/** A received Smile result held for an operator: flagged by Smile, or names not fully matched. */
export function kycNeedsReview(
  govLookup: { providerStatus?: string; nameCheck?: string } | null | undefined,
) {
  return (
    ['attention', 'error'].includes(govLookup?.providerStatus ?? '') ||
    ['partial', 'unavailable'].includes(govLookup?.nameCheck ?? '')
  );
}
