/** Live Figma snapshot is the single source for the mobile design system. */
import snapshot from './figma-tokens.json';

export const designSystemSource = snapshot.source;
export const colorTokens = snapshot.collections.Color;
export const scaleTokens = snapshot.collections.Scale.Value;
export const primitiveTokens = snapshot.collections.Primitives.Value;
export const typographyTokens = snapshot.typography;

/** Composition tokens shared by the Figma mobile screen templates. */
export const screenTokens = {
  gutter: scaleTokens['space/24'],
  top: scaleTokens['space/8'],
  bottom: scaleTokens['space/24'],
  sectionGap: scaleTokens['space/16'],
  cardGap: scaleTokens['space/12'],
  cardPadding: scaleTokens['space/16'],
  touchTarget: scaleTokens['space/44'],
} as const;

/** Figma uses percentage tracking; React Native expects logical pixels. */
export function typography(name: string) {
  const token = typographyTokens.find((entry) => entry.name === name);
  if (!token) throw new Error(`Unknown Figma typography token: ${name}`);
  const weights: Record<string, string> = {
    Regular: '400Regular',
    Medium: '500Medium',
    SemiBold: '600SemiBold',
    Bold: '700Bold',
    ExtraBold: '800ExtraBold',
  };
  return {
    fontFamily: `${token.font.family}_${weights[token.font.style]}`,
    fontSize: token.size,
    lineHeight: token.lineHeight.value,
    letterSpacing:
      token.letterSpacing.unit === 'PERCENT'
        ? Math.round(token.size * token.letterSpacing.value * 100) / 10000
        : token.letterSpacing.value,
  };
}
