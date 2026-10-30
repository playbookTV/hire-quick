/**
 * Smile's biometric verdict proves the selfie belongs to the ID holder, not that the
 * typed names are theirs (`clear` ignores names). HireQuick compares them itself.
 */
import type { ReviewEvidence } from './evidence.js';
import type { KycResult, NameCheck } from './port/kyc-port.js';

export const NAME_MISMATCH_REASON =
  'The name you entered does not match the name on your NIN or BVN record. Enter your names exactly as they appear on your ID and try again.';

function tokens(name: string | null | undefined): Set<string> {
  return new Set(
    (name ?? '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(Boolean),
  );
}

/** Order-insensitive: every typed name must be on the record; extra record names are allowed. */
export function compareNames(record: string | null, submitted: string | null): NameCheck {
  const onRecord = tokens(record);
  const typed = tokens(submitted);
  if (!onRecord.size || !typed.size) return 'unavailable';
  const found = [...typed].filter((name) => onRecord.has(name)).length;
  if (found === typed.size && found >= Math.min(2, onRecord.size)) return 'matched';
  return found ? 'partial' : 'mismatch';
}

/**
 * Only a full match keeps an automatic approval. A near match or missing names wait for
 * operator review; names with nothing in common are rejected so the applicant can correct them.
 */
export function checkSubmittedNames(result: KycResult, evidence?: ReviewEvidence): KycResult {
  // Names must come from the callback for this same verdict, never a different delivery.
  const nameCheck =
    evidence && evidence.status === result.providerStatus
      ? compareNames(evidence.fullName, evidence.submittedName)
      : 'unavailable';
  if (result.decision !== 'verified' || nameCheck === 'matched') return { ...result, nameCheck };
  if (nameCheck === 'mismatch')
    return {
      ...result,
      nameCheck,
      decision: 'rejected',
      reasonCode: 'NAME_MISMATCH',
      reason: NAME_MISMATCH_REASON,
    };
  return { ...result, nameCheck, decision: 'pending' };
}
