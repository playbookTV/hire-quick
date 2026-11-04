import type { Prisma } from '@hq/database';
import { ApiError } from '../../app.js';

export async function assertPresentationAllowed(
  tx: Prisma.TransactionClient,
  category: string,
  presentation: unknown,
) {
  if (!presentation) return;
  const policy = await tx.presentationPolicy.findUnique({
    where: { category: category.trim().toLowerCase() },
  });
  if (policy && !policy.enabled)
    throw new ApiError(
      400,
      'PRESENTATION_DISABLED',
      'Presentation preferences are disabled for this category. Remove them to continue.',
    );
}
