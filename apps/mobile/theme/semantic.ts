/**
 * Semantic colour tokens — the RN mirror of the Figma "Color" collection
 * (Light/Dark modes). Every key exists in BOTH maps (Restyle requires identical
 * key sets to swap themes), and each value aliases a primitive step, the same
 * mapping authored in Figma's Round-6 aliasing pass.
 *
 * Restyle colour keys can't contain "/", so the Figma `bg/canvas` becomes
 * `bgCanvas`, `brand/emerald` → `brandEmerald`, etc.
 */
import { primitives as p } from './primitives.js';

export const lightColors = {
  // backgrounds
  bgCanvas: p.neutral[50],
  bgSurface: p.neutral[0],
  bgMuted: p.neutral[100],
  // ink
  inkStrong: p.neutral[900],
  inkBody: p.neutral[800],
  inkMuted: p.neutral[600],
  inverseInk: p.neutral[0],
  // brand / accent
  brandEmerald: p.emerald[600],
  brandEmeraldStrong: p.emerald[700],
  brandBg: p.emerald[50],
  accentGold: p.gold[500],
  accentGoldStrong: p.gold[600],
  goldBg: p.gold[100],
  // borders
  borderDefault: p.neutral[200],
  borderStrong: p.neutral[300],
  // status foregrounds
  statusSuccess: p.green[500],
  statusWarning: p.amber[500],
  statusDanger: p.red[500],
  statusInfo: p.blue[500],
  statusHeld: p.gold[650],
  // status backgrounds (pills / banners)
  successBg: p.green[100],
  warningBg: p.amber[100],
  dangerBg: p.red[100],
  infoBg: p.blue[100],
  heldBg: p.gold[100],
  // utility
  overlay: 'rgba(20, 19, 14, 0.45)',
  transparent: 'transparent',
};

export type SemanticColors = Record<keyof typeof lightColors, string>;

export const darkColors: SemanticColors = {
  bgCanvas: p.neutral[950],
  bgSurface: p.neutral[890],
  bgMuted: p.neutral[870],
  inkStrong: p.neutral[50],
  inkBody: p.neutral[100],
  inkMuted: p.neutral[400],
  inverseInk: p.neutral[0],
  brandEmerald: p.emerald[400],
  brandEmeraldStrong: p.emerald[500],
  brandBg: p.emerald[900],
  accentGold: p.gold[400],
  accentGoldStrong: p.gold[450],
  goldBg: p.neutral[850],
  borderDefault: p.neutral[800],
  borderStrong: p.neutral[700],
  statusSuccess: p.green[400],
  statusWarning: p.amber[400],
  statusDanger: p.red[400],
  statusInfo: p.blue[400],
  statusHeld: p.gold[450],
  successBg: '#10361F',
  warningBg: '#3A2A0E',
  dangerBg: '#3A1812',
  infoBg: '#102A40',
  heldBg: p.neutral[850],
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
};
