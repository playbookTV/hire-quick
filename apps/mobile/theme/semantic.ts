/**
 * Semantic colour tokens — EXACT mirror of the Figma "Color" collection
 * (Light/Dark modes, file hpP1yPu7hkQLkgJFWvF9wC). Every key exists in BOTH maps
 * (Restyle requires identical key sets to swap themes) and aliases the same
 * primitive step the Figma file does, so editing a ramp cascades here too.
 *
 * Restyle keys can't contain "/", so Figma `bg/canvas` → `bgCanvas`,
 * `brand/emerald-strong` → `brandEmeraldStrong`, etc. `overlay`/`transparent`
 * are app-only utilities (not Figma tokens).
 */
import { primitives as p } from './primitives.js';

export const lightColors = {
  // backgrounds
  bgCanvas: p.neutral[50],
  bgSurface: p.neutral[0],
  bgSubtle: p.neutral[100],
  bgInset: p.neutral[200],
  // ink
  inkStrong: p.neutral[900],
  inkDefault: p.neutral[800],
  // Darkened neutral[600] → neutral[700] for WCAG AA compliance on light
  // backgrounds (neutral[600] ≈ 3.7:1 on bgCanvas; neutral[700] ≈ 7:1).
  inkMuted: p.neutral[700],
  inkFaint: p.neutral[400],
  inverseInk: p.neutral[50],
  // brand
  brandEmerald: p.emerald[600],
  brandEmeraldStrong: p.emerald[700],
  brandEmeraldTint: p.emerald[100],
  brandEmeraldTintWeak: p.emerald[50],
  // accent
  accentGold: p.gold[500],
  accentGoldStrong: p.gold[600],
  accentGoldTint: p.gold[100],
  // borders
  borderDefault: p.neutral[200],
  borderStrong: p.neutral[300],
  // status
  statusSuccess: p.green[500],
  statusSuccessTint: p.green[100],
  statusWarning: p.amber[500],
  statusWarningTint: p.amber[100],
  statusDanger: p.red[500],
  statusDangerTint: p.red[100],
  statusInfo: p.blue[500],
  statusInfoTint: p.blue[100],
  statusHeld: p.gold[650],
  // app-only utilities
  overlay: 'rgba(20, 19, 14, 0.45)',
  transparent: 'transparent',
};

export type SemanticColors = Record<keyof typeof lightColors, string>;

export const darkColors: SemanticColors = {
  bgCanvas: p.neutral[950],
  bgSurface: p.neutral[890],
  bgSubtle: p.neutral[870],
  bgInset: p.neutral[850],
  inkStrong: p.neutral[50],
  inkDefault: p.neutral[300],
  inkMuted: p.neutral[500],
  inkFaint: p.neutral[700],
  inverseInk: p.neutral[50],
  brandEmerald: p.emerald[400],
  brandEmeraldStrong: p.emerald[500],
  brandEmeraldTint: p.emerald[800],
  brandEmeraldTintWeak: p.emerald[900],
  accentGold: p.gold[400],
  accentGoldStrong: p.gold[500],
  accentGoldTint: p.gold[800],
  borderDefault: p.neutral[850],
  borderStrong: p.neutral[800],
  statusSuccess: p.green[400],
  statusSuccessTint: p.green[800],
  statusWarning: p.amber[400],
  statusWarningTint: p.amber[800],
  statusDanger: p.red[400],
  statusDangerTint: p.red[800],
  statusInfo: p.blue[400],
  statusInfoTint: p.blue[800],
  statusHeld: p.gold[450],
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
};
