/** Dropdown choices for physical attributes; the lists live in @hq/shared. */
import {
  BODY_TYPES,
  CLOTHING_SIZES,
  HAIRSTYLES,
  SHOE_SIZES_EU,
  SKIN_TONES,
  type PhysicalAttributes,
} from '@hq/shared';

export type AttributeKey = Exclude<keyof PhysicalAttributes, 'gender'>;
interface Choice {
  value: string;
  label: string;
}

const plain = (values: readonly (string | number)[]): Choice[] =>
  values.map((v) => ({ value: String(v), label: String(v) }));

/** Fields without an entry stay free numeric inputs (age, height, legacy UK shoe size). */
export const ATTRIBUTE_CHOICES: Partial<Record<AttributeKey, Choice[]>> = {
  shoeSizeEu: plain(SHOE_SIZES_EU),
  bodyType: plain(BODY_TYPES),
  dressSize: CLOTHING_SIZES.map((c) => ({ value: c.value, label: c.label })),
  skinTone: plain(SKIN_TONES),
  hairstyle: plain(HAIRSTYLES),
};

/** "Not set" first; a saved value outside the list (typed before the dropdowns) stays selectable. */
export function attributeOptions(
  key: AttributeKey,
  saved: string | number | undefined,
  emptyLabel: string,
): Choice[] {
  const choices = ATTRIBUTE_CHOICES[key] ?? [];
  const current = saved === undefined ? '' : String(saved);
  return [
    { value: '', label: emptyLabel },
    ...choices,
    ...(current && !choices.some((c) => c.value === current)
      ? [{ value: current, label: current }]
      : []),
  ];
}

/** How a saved value reads, e.g. "M (UK 12–14)". */
export function attributeLabel(key: AttributeKey, value: string | number): string {
  return ATTRIBUTE_CHOICES[key]?.find((c) => c.value === String(value))?.label ?? String(value);
}
