import { describe, expect, it } from 'vitest';
import { parseWorkerSelection } from '../hiring-selection.js';
import { pendingJobId, validJobId } from '../job-links.js';
const id = 'd0241d8e-bc20-4e78-9267-fc251094f2bb';
const other = 'acf20d46-b6e2-4892-b2cd-cc505c4de4b8';
describe('marketplace navigation boundaries', () => {
  it('preserves multi-worker selection through URL round-trips and deduplicates it', () => {
    expect(parseWorkerSelection([id, other].join(','))).toEqual([id, other]);
    expect(parseWorkerSelection(`${id},${id}`)).toEqual([id]);
  });
  it('rejects malformed or oversized selections before offering invitations', () => {
    expect(parseWorkerSelection(`${id},untrusted`)).toEqual([]);
    expect(parseWorkerSelection(Array.from({ length: 51 }, () => id).join(','))).toEqual([]);
    expect(parseWorkerSelection()).toEqual([]);
    expect(parseWorkerSelection([id, other])).toEqual([]);
  });
  it('resumes only recent, valid shared jobs after authentication', () => {
    const now = 100_000_000;
    expect(pendingJobId(JSON.stringify({ id, savedAt: now - 1000 }), now)).toBe(id);
    expect(pendingJobId(JSON.stringify({ id, savedAt: now - 86_400_000 }), now)).toBeNull();
    expect(pendingJobId(JSON.stringify({ id, savedAt: now + 1000 }), now)).toBeNull();
    expect(pendingJobId('invalid', now)).toBeNull();
    expect(pendingJobId(JSON.stringify({ id: '../admin', savedAt: now }), now)).toBeNull();
    expect(validJobId([id])).toBe(false);
  });
});
