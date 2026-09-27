/** Figma visual tokens plus shared native interaction rules for the mobile design system. */
import snapshot from './figma-tokens.json';

export const designSystemSource = snapshot.source;
export const colorTokens = snapshot.collections.Color;
export const scaleTokens = snapshot.collections.Scale.Value;
export const primitiveTokens = snapshot.collections.Primitives.Value;
export const typographyTokens = snapshot.typography;

/** Native interaction tokens supplement the unchanged Figma visual snapshot. */
export const motionTokens = {
  press: { scale: 0.96, inMs: 100, outMs: 150 },
  toast: { inMs: 250, outMs: 150 },
  skeleton: { halfCycleMs: 800, minOpacity: 0.5, restingOpacity: 0.75 },
  easeOut: [0.22, 1, 0.36, 1],
} as const;

/** Stable numeric columns for amounts, codes, and changing counters. */
export const numericTypography = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };

/** Keep the field's content box fixed when its focus border thickens. */
export const controlTokens = { border: 1.5, activeBorder: scaleTokens['border/emphasis'] } as const;

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
    ...(name.startsWith('Amount/') || name === 'Code/Value' ? numericTypography : {}),
  };
}
