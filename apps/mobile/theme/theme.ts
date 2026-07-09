/**
 * The Restyle theme — colours (light), spacing/radii (EXACT Figma "Scale"
 * collection), and text variants (Fraunces + Plus Jakarta ramp). `darkTheme`
 * swaps only the colour map. Components consume these via the typed Box/Text.
 */
import { createTheme } from '@shopify/restyle';
import { lightColors, darkColors, type SemanticColors } from './semantic.js';
import { fonts } from './fonts.js';

const palette: SemanticColors = {
  ...lightColors,
};

const theme = createTheme({
  colors: palette,
  // Figma Scale → space/* (px)
  spacing: {
    none: 0,
    '50': 2,
    '100': 4,
    '200': 8,
    '300': 12,
    '400': 16,
    '500': 20,
    '600': 24,
    '700': 28,
    '800': 32,
    '1000': 40,
    '1200': 48,
    '1600': 64,
  },
  // Figma Scale → radius/*
  borderRadii: {
    none: 0,
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 28,
    pill: 999,
  },
  textVariants: {
    defaults: {
      fontFamily: fonts.sansRegular,
      fontSize: 15,
      lineHeight: 22,
      color: 'inkDefault',
    },
    display: {
      fontFamily: fonts.displaySemibold,
      fontSize: 32,
      lineHeight: 40,
      color: 'inkStrong',
    },
    h1: {
      fontFamily: fonts.displaySemibold,
      fontSize: 26,
      lineHeight: 32,
      color: 'inkStrong',
    },
    h2: {
      fontFamily: fonts.displaySemibold,
      fontSize: 22,
      lineHeight: 28,
      color: 'inkStrong',
    },
    // Heading/S — Fraunces 18/24, used by SectionHeader.
    headingS: {
      fontFamily: fonts.displaySemibold,
      fontSize: 18,
      lineHeight: 24,
      color: 'inkStrong',
    },
    title: {
      fontFamily: fonts.sansSemibold,
      fontSize: 18,
      lineHeight: 24,
      color: 'inkStrong',
    },
    bodyLg: {
      fontFamily: fonts.sansRegular,
      fontSize: 16,
      lineHeight: 24,
      color: 'inkDefault',
    },
    body: {
      fontFamily: fonts.sansRegular,
      fontSize: 15,
      lineHeight: 22,
      color: 'inkDefault',
    },
    bodySm: {
      fontFamily: fonts.sansRegular,
      fontSize: 13,
      lineHeight: 18,
      color: 'inkMuted',
    },
    label: {
      fontFamily: fonts.sansSemibold,
      fontSize: 14,
      lineHeight: 18,
      color: 'inkDefault',
    },
    // Figma Label/L — 15px semibold, one step above `label` (14px). Used wherever
    // the Figma file pairs a label with a larger number or form value.
    labelLg: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      lineHeight: 20,
      color: 'inkDefault',
    },
    labelSm: {
      fontFamily: fonts.sansSemibold,
      fontSize: 12,
      lineHeight: 16,
      color: 'inkMuted',
    },
    overline: {
      fontFamily: fonts.sansSemibold,
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.8,
      color: 'inkMuted',
    },
    button: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      lineHeight: 20,
      color: 'inverseInk',
    },
    amount: {
      fontFamily: fonts.displaySemibold,
      fontSize: 20,
      lineHeight: 26,
      color: 'inkStrong',
    },
    // Card-level title/price — Plus Jakarta Bold 17 (Figma Title/M, Amount/M),
    // distinct from the Fraunces display/heading variants.
    titleM: {
      fontFamily: fonts.sansBold,
      fontSize: 17,
      lineHeight: 24,
      letterSpacing: -0.2,
      color: 'inkStrong',
    },
    amountM: {
      fontFamily: fonts.sansBold,
      fontSize: 17,
      lineHeight: 22,
      letterSpacing: -0.2,
      color: 'inkStrong',
    },
  },
});

export type Theme = typeof theme;

export const darkTheme: Theme = {
  ...theme,
  colors: { ...darkColors },
};

export default theme;
