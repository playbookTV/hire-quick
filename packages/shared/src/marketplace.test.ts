import { describe, expect, it } from 'vitest';
import {
  BODY_TYPES,
  CLOTHING_SIZES,
  HAIRSTYLES,
  physicalAttributesSchema,
  SHOE_SIZES_EU,
  SKIN_TONES,
} from './marketplace.js';

const firstMessage = (value: unknown) => {
  const parsed = physicalAttributesSchema.safeParse(value);
  return parsed.success ? null : parsed.error.issues[0]?.message;
};

describe('physical attributes', () => {
  it('accepts EU shoe sizes and keeps UK sizes saved by earlier profiles', () => {
    expect(physicalAttributesSchema.parse({ shoeSizeEu: 41, dressSize: '10' })).toEqual({
      shoeSizeEu: 41,
      dressSize: '10',
    });
    expect(physicalAttributesSchema.parse({ shoeSizeEu: 38.5, shoeSizeUk: 7.5 })).toEqual({
      shoeSizeEu: 38.5,
      shoeSizeUk: 7.5,
    });
  });
  it('accepts every dropdown choice the app offers', () => {
    const choices = [
      ...SHOE_SIZES_EU.map((shoeSizeEu) => ({ shoeSizeEu })),
      ...BODY_TYPES.map((bodyType) => ({ bodyType })),
      ...CLOTHING_SIZES.map(({ value: dressSize }) => ({ dressSize })),
      ...SKIN_TONES.map((skinTone) => ({ skinTone })),
      ...HAIRSTYLES.map((hairstyle) => ({ hairstyle })),
    ];
    for (const choice of choices)
      expect(physicalAttributesSchema.safeParse(choice).success).toBe(true);
  });
  it('still accepts values typed before the dropdowns', () => {
    expect(physicalAttributesSchema.parse({ bodyType: '10', skinTone: 'Light skinned' })).toEqual({
      bodyType: '10',
      skinTone: 'Light skinned',
    });
  });
  it('names the field in every numeric error so the app can show it alone', () => {
    expect(firstMessage({ shoeSizeUk: 41 })).toMatch(/^Shoe size \(UK\)/);
    expect(firstMessage({ shoeSizeEu: 12 })).toMatch(/^Shoe size \(EU\)/);
    expect(firstMessage({ shoeSizeEu: 41.3 })).toMatch(/^Shoe size \(EU\)/);
    expect(firstMessage({ shoeSizeEu: Number.NaN })).toMatch(/^Shoe size \(EU\)/);
    expect(firstMessage({ heightCm: 5.6 })).toMatch(/^Height/);
    expect(firstMessage({ age: 16 })).toMatch(/^Age/);
  });
});
