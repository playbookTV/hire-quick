import { describe, expect, it } from 'vitest';
import { nairaInput, parseNairaInput } from '../amount-input.js';

describe('withdrawal amount entry', () => {
  it.each([1, 51, 99, 100, 4251, 10001, 2147483647])(
    'preserves every kobo of %i when withdrawing all',
    (balance) => {
      expect(parseNairaInput(nairaInput(balance))).toBe(balance);
    },
  );
  it.each([
    ['42.51', 4251],
    ['0.01', 1],
    ['42.5', 4250],
    ['42.', 4200],
    [' 42 ', 4200],
  ])('accepts %s exactly', (text, expected) => {
    expect(parseNairaInput(String(text))).toBe(expected);
  });
  it.each(['', '-1', '1.001', '1e3', 'Infinity', 'NaN', '1,000', '0x10', '9007199254740991'])(
    'rejects ambiguous or unrepresentable amount %s',
    (text) => {
      expect(parseNairaInput(text)).toBeNull();
    },
  );
});
