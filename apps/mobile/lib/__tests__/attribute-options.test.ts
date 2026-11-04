import { describe, expect, it } from 'vitest';
import { physicalAttributesSchema } from '@hq/shared';
import { ATTRIBUTE_CHOICES, attributeLabel, attributeOptions } from '../attribute-options.js';

describe('physical attribute dropdowns', () => {
  it('offers EU shoe sizes the API accepts', () => {
    const sizes = ATTRIBUTE_CHOICES.shoeSizeEu!.map((c) => Number(c.value));
    expect(sizes).toContain(41);
    for (const shoeSizeEu of sizes)
      expect(physicalAttributesSchema.safeParse({ shoeSizeEu }).success).toBe(true);
  });
  it('puts the empty choice first and keeps a value typed before the dropdowns', () => {
    const options = attributeOptions('dressSize', '10', 'Prefer not to say');
    expect(options[0]).toEqual({ value: '', label: 'Prefer not to say' });
    expect(options.at(-1)).toEqual({ value: '10', label: '10' });
    expect(attributeOptions('hairstyle', 'Ponytail', 'No preference').at(-1)?.value).toBe(
      'Bald / shaved',
    );
    expect(attributeOptions('shoeSizeEu', 38.5, '').at(-1)).toEqual({
      value: '38.5',
      label: '38.5',
    });
  });
  it('shows clothing sizes with their UK equivalents and other values as saved', () => {
    expect(attributeLabel('dressSize', 'M')).toBe('M (UK 12–14)');
    expect(attributeLabel('dressSize', '10')).toBe('10');
    expect(attributeLabel('shoeSizeEu', 41)).toBe('41');
  });
});
