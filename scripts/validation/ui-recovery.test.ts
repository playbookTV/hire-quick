import { describe, expect, it } from 'vitest';
import { nigerianPhone, calendarWeeks } from '../../apps/mobile/lib/ui-state.js';
import { darkColors, lightColors } from '../../apps/mobile/theme/semantic.js';
import { pageQuery, pageResult } from '../../apps/api/src/modules/admin/pagination.js';

describe('phone entry without duplicated country code', () => {
  it.each(['0801 234 5678', '8012345678', '+234 801 234 5678', '2348012345678', '(0801) 234-5678'])(
    'normalizes %s',
    (input) => {
      expect(nigerianPhone(input)).toBe('+2348012345678');
    },
  );
  it.each([
    '',
    '+2342348012345678',
    '0801234567',
    '080123456789',
    '+448012345678',
    '0801abc2345678',
  ])('rejects invalid input %s', (input) => expect(nigerianPhone(input)).toBeNull());
});
describe('calendar weekday alignment', () => {
  it('keeps all dates under the matching weekday in leap and non-leap years', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028])
      for (let month = 0; month < 12; month++) {
        const weeks = calendarWeeks(year, month);
        expect(weeks.every((week) => week.length === 7)).toBe(true);
        const dates = weeks.flat().filter((day): day is number => day !== null);
        expect(dates).toEqual(
          Array.from(
            { length: new Date(Date.UTC(year, month + 1, 0)).getUTCDate() },
            (_, i) => i + 1,
          ),
        );
        weeks.forEach((week) =>
          week.forEach((day, column) => {
            if (day !== null) expect(new Date(Date.UTC(year, month, day)).getUTCDay()).toBe(column);
          }),
        );
      }
  });
});
describe('admin record pagination', () => {
  it('defaults to legacy arrays and rejects malformed paging input', () => {
    expect(pageQuery.parse({})).toEqual({ paged: false, limit: 100 });
    for (const input of [
      { limit: 'NaN' },
      { limit: '0' },
      { limit: '251' },
      { limit: '1.5' },
      { cursor: 'not-a-uuid' },
      { paged: 'yes' },
    ])
      expect(pageQuery.safeParse(input).success).toBe(false);
  });
  it('uses a lookahead without skipping a record at the page boundary', () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ id: String(i) }));
    const first = pageResult(rows.slice(0, 51), 50);
    const second = pageResult(rows.slice(Number(first.nextCursor) + 1, 101), 50);
    const third = pageResult(rows.slice(Number(second.nextCursor) + 1), 50);
    expect([...first.items, ...second.items, ...third.items]).toEqual(rows);
    expect(third.nextCursor).toBeNull();
    expect(pageResult([], 50)).toEqual({ items: [], nextCursor: null });
  });
});
function luminance(hex: string) {
  const values = hex
    .replace('#', '')
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
function ratio(fg: string, bg: string) {
  const a = luminance(fg),
    b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
describe('semantic text contrast in both themes', () => {
  for (const [mode, c] of Object.entries({ light: lightColors, dark: darkColors })) {
    const pairs = [
      ['inkFaint', 'bgCanvas'],
      ['inkMuted', 'bgSurface'],
      ['brandEmerald', 'brandEmeraldTint'],
      ['accentGoldStrong', 'accentGoldTint'],
      ['statusSuccess', 'statusSuccessTint'],
      ['statusWarning', 'statusWarningTint'],
      ['statusDanger', 'statusDangerTint'],
      ['statusInfo', 'statusInfoTint'],
      ['statusHeld', 'accentGoldTint'],
      ['inverseInk', 'brandSurface'],
      ['onBrandAccent', 'brandSurface'],
    ] as const;
    it.each(pairs)(`${mode}: %s on %s meets AA small text`, (fg, bg) =>
      expect(ratio(c[fg], c[bg]), `${c[fg]} on ${c[bg]}`).toBeGreaterThanOrEqual(4.5),
    );
  }
});
