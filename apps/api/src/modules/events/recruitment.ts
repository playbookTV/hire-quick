import type { ApplicationStatus, InvitationStatus, Prisma, PrismaClient } from '@hq/database';
import { ApiError } from '../../app.js';
import { assertNoLiveBooking, assertRecruiting, assertStaffEligible, lockUsherSchedules } from './eligibility.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
type Tx = Prisma.TransactionClient;
async function lockEvent(tx: Tx, eventId: string) {
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
  return tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { client: true } });
}
async function assertInvitationAllowsSelection(tx: Tx, eventId: string, usherId: string) {
  const invitation = await tx.invitation.findUnique({ where: { eventId_usherId: { eventId, usherId } } });
  if (invitation && ['DECLINED', 'EXPIRED'].includes(invitation.status))
    throw new ApiError(409, 'INVITATION_CLOSED', 'this invitation cycle has ended');
}

export function invitationCanReply(from: InvitationStatus, to: 'ACCEPTED' | 'DECLINED'): boolean {
  return from === to || from === 'SENT' || (from === 'ACCEPTED' && to === 'DECLINED');
}

export async function applyToEvent(prisma: PrismaClient, eventId: string, usherId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    assertRecruiting(event);
    await lockUsherSchedules(tx, [usherId]);
    await assertStaffEligible(tx, event, [usherId]);
    await assertNoLiveBooking(tx, eventId, usherId);
    await assertInvitationAllowsSelection(tx, eventId, usherId);
    const prior = await tx.application.findUnique({ where: { eventId_usherId: { eventId, usherId } } });
    // Duplicate apply must not undo the client's shortlist or acceptance.
    if (prior && ['APPLIED', 'SHORTLISTED', 'ACCEPTED'].includes(prior.status)) return { application: prior, notify: false };
    const application = await tx.application.upsert({
      where: { eventId_usherId: { eventId, usherId } },
      update: { status: 'APPLIED' }, create: { eventId, usherId, status: 'APPLIED' },
    });
    return { application, notify: true };
  }, TX);
}

export async function selectApplication(prisma: PrismaClient, applicationId: string, clientId: string, status: Extract<ApplicationStatus, 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED'>) {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, select: { eventId: true } });
    const event = await lockEvent(tx, identity.eventId);
    if (event.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
    assertRecruiting(event);
    await tx.$queryRaw`SELECT id FROM applications WHERE id = ${applicationId}::uuid FOR UPDATE`;
    const application = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    await lockUsherSchedules(tx, [application.usherId]);
    await assertNoLiveBooking(tx, event.id, application.usherId);
    if (status !== 'REJECTED') {
      await assertStaffEligible(tx, event, [application.usherId]);
      await assertInvitationAllowsSelection(tx, event.id, application.usherId);
      if (application.status === 'WITHDRAWN') throw new ApiError(409, 'SELECTION_CHANGED', 'this application was withdrawn');
    } else {
      // A client can still reject a candidate who has become ineligible.
      await assertStaffEligible(tx, event, []);
    }
    return tx.application.update({ where: { id: application.id }, data: { status } });
  }, TX);
}

export async function inviteToEvent(prisma: PrismaClient, eventId: string, clientId: string, usherId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    if (event.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
    assertRecruiting(event);
    await lockUsherSchedules(tx, [usherId]);
    await assertStaffEligible(tx, event, [usherId]);
    await assertNoLiveBooking(tx, eventId, usherId);
    const prior = await tx.invitation.findUnique({ where: { eventId_usherId: { eventId, usherId } } });
    if (prior) {
      if (prior.status !== 'SENT') throw new ApiError(409, 'INVITATION_CLOSED', 'this invitation has already received a response');
      return { invitation: prior, event, notify: false };
    }
    const invitation = await tx.invitation.create({ data: { eventId, usherId, status: 'SENT' } });
    return { invitation, event, notify: true };
  }, TX);
}

export async function replyToInvitation(prisma: PrismaClient, invitationId: string, usherId: string, status: 'ACCEPTED' | 'DECLINED') {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.invitation.findUniqueOrThrow({ where: { id: invitationId }, select: { eventId: true } });
    const event = await lockEvent(tx, identity.eventId);
    const invitation = await tx.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    if (invitation.usherId !== usherId) throw new ApiError(403, 'FORBIDDEN', 'not your invitation');
    if (!invitationCanReply(invitation.status, status))
      throw new ApiError(409, 'INVITATION_CLOSED', 'this invitation cycle has ended');
    // Replay does not resurrect an application later rejected by the client.
    if (invitation.status === status && status === 'ACCEPTED') return { status };
    await lockUsherSchedules(tx, [usherId]);
    await assertNoLiveBooking(tx, event.id, usherId);
    if (status === 'ACCEPTED') {
      assertRecruiting(event);
      await assertStaffEligible(tx, event, [usherId]);
      await tx.application.upsert({
        where: { eventId_usherId: { eventId: event.id, usherId } },
        update: { status: 'ACCEPTED' }, create: { eventId: event.id, usherId, status: 'ACCEPTED' },
      });
    } else {
      // Decline remains possible when recruitment closes, but never cancels a booking.
      await tx.application.updateMany({ where: { eventId: event.id, usherId }, data: { status: 'WITHDRAWN' } });
    }
    await tx.invitation.update({ where: { id: invitation.id }, data: { status } });
    return { status };
  }, TX);
}
