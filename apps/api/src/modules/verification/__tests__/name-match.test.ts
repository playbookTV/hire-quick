import { describe, expect, it } from 'vitest';
import type { ReviewEvidence } from '../evidence.js';
import { checkSubmittedNames, compareNames, NAME_MISMATCH_REASON } from '../name-match.js';

const clear = { decision: 'verified' as const, providerJobId: 'job', providerStatus: 'clear' };
function evidence(fullName: string | null, submittedName: string | null, status = 'clear') {
  return {
    status,
    fullName,
    submittedName,
    maskedId: null,
    selfieUrl: null,
    idPhotoUrl: null,
    documentUrl: null,
    expiresAt: new Date().toISOString(),
  } satisfies ReviewEvidence;
}

describe('submitted names against the identity record', () => {
  it('matches regardless of case, order, accents, punctuation and omitted record names', () => {
    expect(compareNames('ADEBAYO OLUWASEUN JOHNSON', 'Oluwaseun Johnson')).toBe('matched');
    expect(compareNames('JOHNSON ADEBAYO', 'Adebayo Johnson')).toBe('matched');
    expect(compareNames('Ọlá Adébáyọ̀', 'Ola Adebayo')).toBe('matched');
    expect(compareNames('Chukwu-Emeka Okafor', 'chukwu emeka  okafor')).toBe('matched');
  });
  it('separates invented names from near matches', () => {
    expect(compareNames('ADEBAYO JOHNSON', 'Grace Smith')).toBe('mismatch');
    expect(compareNames('ADEBAYO JOHNSON', 'Grace Johnson')).toBe('partial');
    expect(compareNames('MUHAMMED BELLO', 'Mohammed Bello')).toBe('partial');
    expect(compareNames('ADEBAYO OLUWASEUN JOHNSON', 'Johnson')).toBe('partial');
    expect(compareNames(null, 'Adebayo Johnson')).toBe('unavailable');
    expect(compareNames('ADEBAYO JOHNSON', '')).toBe('unavailable');
  });
  it('keeps automatic approval only for a full match', () => {
    expect(checkSubmittedNames(clear, evidence('ADEBAYO JOHNSON', 'Adebayo Johnson'))).toEqual({
      ...clear,
      nameCheck: 'matched',
    });
    expect(checkSubmittedNames(clear, evidence('ADEBAYO JOHNSON', 'Grace Smith'))).toEqual({
      ...clear,
      decision: 'rejected',
      reasonCode: 'NAME_MISMATCH',
      reason: NAME_MISMATCH_REASON,
      nameCheck: 'mismatch',
    });
    expect(checkSubmittedNames(clear, evidence('ADEBAYO JOHNSON', 'Grace Johnson'))).toMatchObject({
      decision: 'pending',
      nameCheck: 'partial',
    });
  });
  it('holds approval when names are missing or belong to a different delivery', () => {
    expect(checkSubmittedNames(clear)).toMatchObject({
      decision: 'pending',
      nameCheck: 'unavailable',
    });
    expect(
      checkSubmittedNames(clear, evidence('ADEBAYO JOHNSON', 'Adebayo Johnson', 'attention')),
    ).toMatchObject({ decision: 'pending', nameCheck: 'unavailable' });
  });
  it('never turns a provider rejection or pending result into an approval', () => {
    const block = { decision: 'rejected' as const, reasonCode: 'OTHER', providerStatus: 'block' };
    expect(checkSubmittedNames(block, evidence('A B', 'A B', 'block'))).toEqual({
      ...block,
      nameCheck: 'matched',
    });
    const attention = { decision: 'pending' as const, providerStatus: 'attention' };
    expect(checkSubmittedNames(attention, evidence('A B', 'C D', 'attention')).decision).toBe(
      'pending',
    );
  });
});
