import { describe, it, expect } from 'vitest';
import { createEventSchema } from './dto.js';

const base = {
  title: 'Lagos Gala',
  venue: 'Eko Hotel',
  category: 'Gala',
  eventDate: '2026-09-01',
  startTime: '18:00',
  headcount: 4,
  budgetPerHeadKobo: 2_000_000,
};

describe('createEventSchema — accommodation disclosure (late-night safety)', () => {
  it('requires accommodation when the event ends at or after 22:00', () => {
    const r = createEventSchema.safeParse({ ...base, endTime: '23:00' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('accommodation'))).toBe(true);
    }
  });

  it('treats exactly 22:00 as late (at or after)', () => {
    expect(createEventSchema.safeParse({ ...base, endTime: '22:00' }).success).toBe(false);
  });

  it('accepts a late event when accommodation is declared', () => {
    expect(
      createEventSchema.safeParse({ ...base, endTime: '23:00', accommodation: 'PROVIDED' }).success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse({ ...base, endTime: '23:30', accommodation: 'NOT_PROVIDED' }).success,
    ).toBe(true);
  });

  it('leaves accommodation optional for events ending before 22:00', () => {
    expect(createEventSchema.safeParse({ ...base, endTime: '21:59' }).success).toBe(true);
  });

  it('still rejects an invalid accommodation value', () => {
    expect(
      createEventSchema.safeParse({ ...base, endTime: '23:00', accommodation: 'MAYBE' }).success,
    ).toBe(false);
  });

  it('still enforces endTime after startTime', () => {
    const r = createEventSchema.safeParse({ ...base, startTime: '20:00', endTime: '19:00' });
    expect(r.success).toBe(false);
  });
});
