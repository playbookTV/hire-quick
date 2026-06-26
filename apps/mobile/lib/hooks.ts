/**
 * React Query hooks over the API. Auth mutations skip the bearer token; the
 * verify screen feeds the result into `useAuth().login`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateEventInput, UpdateEventInput, UserRole } from '@hq/shared';
import { api, request, newIdempotencyKey } from './client.js';
import { queryKeys } from './query.js';
import type {
  EventResource,
  AuthResult,
  Booking,
  Message,
  Application,
  MyApplication,
  UsherListItem,
  Review,
  WalletSummary,
  WalletActivity,
  BankAccount,
  Bank,
  Availability,
  ConfirmResult,
  Notification,
  NotificationFeed,
  Invitation,
} from './types.js';

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phone: string) =>
      api.post<{ sent: boolean; devCode?: string }>('/auth/otp/request', { phone }, { auth: false }),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (vars: { phone: string; code: string; role?: UserRole }) =>
      api.post<AuthResult>('/auth/otp/verify', vars, { auth: false }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      displayName?: string;
      bio?: string;
      yearsExperience?: number;
      businessName?: string;
      city?: string;
      languages?: string[];
      dayRateKobo?: number;
    }) => api.patch<{ updated: boolean }>('/api/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

/**
 * Photo edits change the usher's own profile. Components surface the new photo
 * via auth-context `refreshMe()`; we only nudge the `me` query here. We do NOT
 * invalidate the whole `['ushers']` family — those public lists live on clients'
 * devices (an usher doesn't see themselves in discover) and refresh on their own
 * staleness, so invalidating here just refetches every cached list for no gain.
 */
function invalidatePhotos(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  return qc.invalidateQueries({ queryKey: queryKeys.me });
}

export function useSetAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.put<{ avatarUrl: string }>('/api/me/photos/avatar', { key }),
    onSuccess: () => invalidatePhotos(qc),
  });
}

export function useAddPortfolioPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api.post<{ id: string; imageUrl: string }>('/api/me/photos/portfolio', { key }),
    onSuccess: () => invalidatePhotos(qc),
  });
}

export function useDeletePortfolioPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/api/me/photos/portfolio/${id}`),
    onSuccess: () => invalidatePhotos(qc),
  });
}

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => api.get<EventResource[]>('/api/events'),
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: queryKeys.event(id),
    queryFn: () => api.get<EventResource>(`/api/events/${id}`),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.post<EventResource>('/api/events', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.events }),
  });
}

export function useUpdateEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEventInput) => api.patch<EventResource>(`/api/events/${id}`, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.events }),
        qc.invalidateQueries({ queryKey: queryKeys.event(id) }),
      ]),
  });
}

// ---------------------------------------------------------------- bookings
export function useBookings() {
  return useQuery({ queryKey: queryKeys.bookings, queryFn: () => api.get<Booking[]>('/api/bookings') });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: queryKeys.booking(id),
    queryFn: () => api.get<Booking>(`/api/bookings/${id}`),
    enabled: !!id,
  });
}

export function useBookingMessages(id: string) {
  return useQuery({
    queryKey: queryKeys.bookingMessages(id),
    queryFn: () => api.get<Message[]>(`/api/bookings/${id}/messages`),
    enabled: !!id,
    refetchInterval: 5000, // light polling until Socket.IO is wired
  });
}

export function useSendMessage(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.post<Message>(`/api/bookings/${bookingId}/messages`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bookingMessages(bookingId) }),
  });
}

export function useGenerateCheckin(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ generated: boolean; code: string }>(`/api/bookings/${bookingId}/checkin/generate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.booking(bookingId) }),
  });
}

export function useVerifyCheckin(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ status: string }>(`/api/bookings/${bookingId}/checkin/verify`, { code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.booking(bookingId) }),
  });
}

export function useCompleteBooking(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string }>(`/api/bookings/${bookingId}/complete`),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.booking(bookingId) }),
        qc.invalidateQueries({ queryKey: queryKeys.bookings }),
      ]),
  });
}

export function useCreateDispute(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { reason: string; note?: string }) => api.post<{ id: string }>(`/api/bookings/${bookingId}/disputes`, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.booking(bookingId) }),
  });
}

export function useCreateReview(bookingId: string) {
  return useMutation({
    mutationFn: (vars: { rating: number; comment?: string }) => api.post<{ id: string }>(`/api/bookings/${bookingId}/reviews`, vars),
  });
}

export function useCancelBooking(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      api.post<{ status: string }>(`/api/bookings/${bookingId}/cancel`, { reason }, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.booking(bookingId) }),
        qc.invalidateQueries({ queryKey: queryKeys.bookings }),
      ]),
  });
}

// --------------------------------------------------------- events / applications
export function useApplyToEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.post<{ id: string; status: string }>(`/api/events/${eventId}/apply`),
    onSuccess: (_d, eventId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.event(eventId) }),
        qc.invalidateQueries({ queryKey: queryKeys.myApplications }),
      ]),
  });
}

export function useApplications(eventId: string) {
  return useQuery({
    queryKey: queryKeys.applications(eventId),
    queryFn: () => api.get<Application[]>(`/api/events/${eventId}/applications`),
    enabled: !!eventId,
    refetchInterval: 10_000, // surface new applicants while the client reviews
  });
}

/** The usher's own applications — the "Applied" tab. */
export function useMyApplications() {
  return useQuery({
    queryKey: queryKeys.myApplications,
    queryFn: () => api.get<MyApplication[]>('/api/me/applications'),
  });
}

/** Saved (bookmarked) jobs — the "Saved" tab. */
export function useSavedJobs() {
  return useQuery({
    queryKey: queryKeys.savedJobs,
    queryFn: () => api.get<EventResource[]>('/api/me/saved-jobs'),
  });
}

export function useSaveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.post<{ id: string; saved: boolean }>(`/api/events/${eventId}/save`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedJobs }),
  });
}

export function useUnsaveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      request<{ saved: boolean }>(`/api/events/${eventId}/save`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.savedJobs }),
  });
}

export function usePatchApplication(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED' }) =>
      api.patch<{ id: string; status: string }>(`/api/applications/${vars.id}`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.applications(eventId) }),
  });
}

export function useConfirmEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { applicationIds: string[]; email: string }) =>
      api.post<ConfirmResult>(`/api/events/${eventId}/confirm`, vars, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.event(eventId) }),
        qc.invalidateQueries({ queryKey: queryKeys.bookings }),
      ]),
  });
}

// ------------------------------------------------------------ ushers / discovery
function qs(filters?: Record<string, unknown>): string {
  if (!filters) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useUshers(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.ushers(filters),
    queryFn: () => api.get<UsherListItem[]>(`/api/ushers${qs(filters)}`),
  });
}

export function useUsher(id: string) {
  return useQuery({
    queryKey: queryKeys.usher(id),
    queryFn: () => api.get<UsherListItem>(`/api/ushers/${id}`),
    enabled: !!id,
  });
}

export function useUsherReviews(id: string) {
  return useQuery({
    queryKey: queryKeys.usherReviews(id),
    queryFn: () => api.get<Review[]>(`/api/ushers/${id}/reviews`),
    enabled: !!id,
  });
}

// -------------------------------------------------------------------- wallet
export function useWallet() {
  return useQuery({ queryKey: queryKeys.wallet, queryFn: () => api.get<WalletSummary>('/api/payments/wallet') });
}

export function useWalletActivity() {
  return useQuery({ queryKey: queryKeys.walletActivity, queryFn: () => api.get<WalletActivity[]>('/api/payments/wallet/activity') });
}

export function useBankAccounts() {
  return useQuery({ queryKey: queryKeys.bankAccounts, queryFn: () => api.get<BankAccount[]>('/api/payments/bank-accounts') });
}

/** Nigerian banks for the withdraw picker (static — cache hard). */
export function useBanks() {
  return useQuery({
    queryKey: queryKeys.banks,
    queryFn: () => api.get<Bank[]>('/api/payments/banks'),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

/** Lazily resolve a NUBAN → account name (the bank-app confirm step). */
export function useResolveAccount() {
  return useMutation({
    mutationFn: (vars: { bankCode: string; accountNumber: string }) =>
      api.get<{ accountName: string }>(
        `/api/payments/resolve-account?bankCode=${encodeURIComponent(vars.bankCode)}&accountNumber=${encodeURIComponent(vars.accountNumber)}`,
      ),
  });
}

export function useAddBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    // accountName is resolved server-side, so the client only sends bank + number.
    mutationFn: (vars: { bankCode: string; accountNumber: string }) =>
      api.post<BankAccount>('/api/payments/bank-accounts', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bankAccounts }),
  });
}

export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { bankAccountId: string; amountKobo: number }) =>
      api.post<{ id: string; status: string }>('/api/payments/withdrawals', vars, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.wallet }),
        qc.invalidateQueries({ queryKey: queryKeys.walletActivity }),
        qc.invalidateQueries({ queryKey: queryKeys.me }),
      ]),
  });
}

// --------------------------------------------------------- verification / availability
export function useSubmitVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idDocumentUrl: string; selfieUrl: string }) =>
      api.post<{ id: string; status: string }>('/api/me/verification', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useMyVerifications() {
  return useQuery({
    queryKey: ['verification'] as const,
    queryFn: () => api.get<{ id: string; status: string; reason: string | null; createdAt: string }[]>('/api/me/verification'),
  });
}

export function useAvailability(from?: string, to?: string) {
  const range = `${from ?? ''}_${to ?? ''}`;
  return useQuery({
    queryKey: queryKeys.availability(range),
    queryFn: () => api.get<Availability[]>(`/api/me/availability${qs({ from, to })}`),
  });
}

export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { date: string; status: 'AVAILABLE' | 'UNAVAILABLE' }) =>
      request<Availability>('/api/me/availability', { method: 'PUT', body: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  });
}

// ── Notifications & invitations ────────────────────────────────────────────
// No Socket.IO client on mobile yet, so the inbox/invites poll (matching the
// jobs feed). The realtime nudge the API emits lights these up instantly once a
// socket client is added; until then a short poll keeps them fresh.

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => api.get<NotificationFeed>('/api/me/notifications'),
    refetchInterval: 20_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<{ read: boolean }>(`/api/me/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ read: boolean }>('/api/me/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useMyInvitations() {
  return useQuery({
    queryKey: queryKeys.invitations,
    queryFn: () => api.get<Invitation[]>('/api/me/invitations'),
    refetchInterval: 20_000,
  });
}

export function useInvitation(id: string) {
  return useQuery({
    queryKey: queryKeys.invitation(id),
    queryFn: () => api.get<Invitation>(`/api/invitations/${id}`),
    enabled: !!id,
  });
}

export function useRespondInvitation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'ACCEPTED' | 'DECLINED') =>
      request<{ status: string }>(`/api/invitations/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      // The invite changes state and (on accept) creates an application + job row.
      void qc.invalidateQueries({ queryKey: queryKeys.invitations });
      void qc.invalidateQueries({ queryKey: queryKeys.invitation(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.myApplications });
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}
