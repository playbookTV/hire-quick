/**
 * Typed Restyle primitives bound to our Theme. Import `Box`, `Text`, `useTheme`
 * from here everywhere — never from `@shopify/restyle` directly — so the theme
 * keys (colours, spacing, text variants) are type-checked.
 */
import {
  createBox,
  createText,
  useTheme as useRestyleTheme,
} from '@shopify/restyle';
import type { Theme } from './theme.js';

export const Box = createBox<Theme>();
export const Text = createText<Theme>();

export const useTheme = (): Theme => useRestyleTheme<Theme>();

export type { Theme };
