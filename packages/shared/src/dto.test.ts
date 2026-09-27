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

describe('createEventSchema — time bounds (A4)', () => {
  it('rejects out-of-range hours/minutes like 99:99 and 24:00', () => {
    expect(createEventSchema.safeParse({ ...base, startTime: '99:99', endTime: '21:00' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, startTime: '24:00', endTime: '21:00' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, startTime: '18:60', endTime: '21:00' }).success).toBe(false);
  });

  it('accepts valid boundary times 00:00 and 23:59', () => {
    expect(createEventSchema.safeParse({ ...base, startTime: '00:00', endTime: '21:00' }).success).toBe(true);
    // 23:59 end is late-night, so accommodation must be declared for the event to pass.
    expect(
      createEventSchema.safeParse({ ...base, startTime: '00:00', endTime: '23:59', accommodation: 'PROVIDED' }).success,
    ).toBe(true);
  });
});

describe('createEventSchema — money bounds (A5)', () => {
  it('rejects a per-head budget above the 32-bit Int max', () => {
    expect(
      createEventSchema.safeParse({ ...base, endTime: '21:00', headcount: 1, budgetPerHeadKobo: 2_147_483_648 }).success,
    ).toBe(false);
  });

  it('rejects an aggregate (headcount × budget) that would overflow Int even when each field fits', () => {
    // 100 × 100_000_000 = 10^10 > 2_147_483_647.
    const r = createEventSchema.safeParse({ ...base, endTime: '21:00', headcount: 100, budgetPerHeadKobo: 100_000_000 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('budgetPerHeadKobo'))).toBe(true);
  });

  it('accepts a within-bounds aggregate', () => {
    expect(
      createEventSchema.safeParse({ ...base, endTime: '21:00', headcount: 10, budgetPerHeadKobo: 2_000_000 }).success,
    ).toBe(true);
  });
});


it('rejects totals that overflow only after the client-paid fee is added', () => {
  expect(createEventSchema.safeParse({ ...base, endTime: '21:00', headcount: 1, budgetPerHeadKobo: 2_000_000_000 }).success).toBe(false);
  expect(createEventSchema.safeParse({ ...base, endTime: '21:00', budgetPerHeadKobo: -1 }).success).toBe(false);
});
