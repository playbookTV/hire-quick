/**
 * Elevation presets approximating the Figma effect styles (Shadow/sm, Shadow/md)
 * for RN's single-shadow model. Spread on cards/sheets.
 */
import type { ViewStyle } from 'react-native';

export const shadowSm: ViewStyle = {
  shadowColor: '#1B1A17',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

export const shadowMd: ViewStyle = {
  shadowColor: '#1B1A17',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 5,
};
