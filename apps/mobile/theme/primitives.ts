/**
 * Primitive colour ramps — the RN mirror of the Figma "Primitives" variable
 * collection (Warm Lagos palette, 50–900 steps). These are raw values; nothing
 * in the UI references them directly. The semantic layer (semantic.ts) aliases
 * these per mode, exactly like the Figma `Primitives → Color (Light/Dark)` chain.
 *
 * Anchored to the canonical Figma steps: emerald/600 #0B6B53, emerald/700
 * #08553F, gold/500 #E0A526, gold/600 #C68A1E, bg/canvas #FBF7F0 (neutral/50),
 * dark canvas #14130E (neutral/950), dark ink #F4EFE4, dark emerald #18A074.
 * Re-sync from Figma when the ramps are retuned.
 */

export const primitives = {
  neutral: {
    0: '#FFFFFF',
    50: '#FBF7F0',
    100: '#F4EFE4',
    200: '#E9E1D2',
    300: '#D9CDB8',
    400: '#B8A98E',
    500: '#8C7E63',
    600: '#6B5E45',
    700: '#4A4030',
    800: '#33301F',
    850: '#2F2A1F',
    870: '#262219',
    890: '#1E1B15',
    900: '#1A1710',
    950: '#14130E',
  },
  emerald: {
    50: '#E6F2EE',
    100: '#C9E4DB',
    200: '#9FD0C0',
    300: '#5FAE96',
    400: '#18A074',
    500: '#0E8062',
    600: '#0B6B53',
    700: '#08553F',
    800: '#06432F',
    900: '#053A2C',
  },
  gold: {
    50: '#FBF1DA',
    100: '#F7E9C8',
    300: '#EFD08A',
    400: '#EBB94A',
    450: '#D8A02D',
    500: '#E0A526',
    600: '#C68A1E',
    650: '#B8801A',
    700: '#9C6B14',
  },
  green: {
    100: '#DCF2E3',
    400: '#34C77B',
    500: '#1FA463',
    600: '#178A52',
  },
  amber: {
    100: '#FBEBD0',
    400: '#F0B445',
    500: '#D98A1A',
    600: '#B5710F',
  },
  red: {
    100: '#F7DDD9',
    400: '#F26D5B',
    500: '#D64530',
    600: '#B5341F',
  },
  blue: {
    100: '#DCEAF7',
    400: '#5BA3E8',
    500: '#2E7BC4',
    600: '#1F5E9C',
  },
} as const;
