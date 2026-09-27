/** Restyle adapter over the Figma token manager. */
import { createTheme } from '@shopify/restyle';
import { lightColors, darkColors, type SemanticColors } from './semantic.js';
import { scaleTokens as s, typography } from './token-manager.js';

const palette: SemanticColors = { ...lightColors };
const theme = createTheme({
  colors: palette,
  spacing: {
    none: 0,
    '50': s['space/2'],
    '100': s['space/4'],
    '150': s['space/6'],
    '200': s['space/8'],
    '250': s['space/10'],
    '300': s['space/12'],
    '400': s['space/16'],
    '500': s['space/20'],
    '600': s['space/24'],
    '700': s['space/28'],
    '800': s['space/32'],
    '900': s['space/36'],
    '1000': s['space/40'],
    '1100': s['space/44'],
    '1200': s['space/48'],
    '1400': s['space/56'],
    '1600': s['space/64'],
    '2000': s['space/80'],
    '2250': s['space/90'],
    '3000': s['space/120'],
  },
  borderRadii: {
    none: 0,
    xxs: s['radius/xxs'],
    xs: s['radius/xs'],
    sm: s['radius/sm'],
    md: s['radius/md'],
    lg: s['radius/lg'],
    xl: s['radius/xl'],
    '2xl': s['radius/xl'],
    sheet: s['radius/sheet'],
    pill: s['radius/pill'],
  },
  textVariants: {
    defaults: { ...typography('Body/M'), color: 'inkDefault' },
    displayXL: { ...typography('Display/XL'), color: 'inkStrong' },
    display: { ...typography('Display/L'), color: 'inkStrong' },
    h1: { ...typography('Display/M'), color: 'inkStrong' },
    h2: { ...typography('Heading/L'), color: 'inkStrong' },
    headingM: { ...typography('Heading/M'), color: 'inkStrong' },
    headingS: { ...typography('Heading/S'), color: 'inkStrong' },
    title: { ...typography('Heading/M'), color: 'inkStrong' },
    titleM: { ...typography('Heading/S'), color: 'inkStrong' },
    bodyLg: { ...typography('Body/L'), color: 'inkDefault' },
    body: { ...typography('Body/M'), color: 'inkDefault' },
    bodySm: { ...typography('Body/S'), color: 'inkMuted' },
    label: { ...typography('Label/M'), color: 'inkDefault' },
    labelLg: { ...typography('Label/L'), color: 'inkDefault' },
    labelSm: { ...typography('Navigation/Label'), color: 'inkMuted' },
    navigation: { ...typography('Navigation/Label'), color: 'inkMuted' },
    overline: { ...typography('Label/S'), color: 'inkMuted' },
    button: { ...typography('Label/L'), color: 'inkOnAccent' },
    amount: { ...typography('Amount/L'), color: 'moneyAvailable' },
    amountXL: { ...typography('Amount/XL'), color: 'moneyAvailable' },
    amountM: { ...typography('Amount/M'), color: 'moneyAvailable' },
    amountSm: { ...typography('Amount/S'), color: 'moneyAvailable' },
    code: { ...typography('Code/Value'), color: 'inkStrong' },
  },
});
export type Theme = typeof theme;
export const darkTheme: Theme = { ...theme, colors: { ...darkColors } };
export default theme;
