/**
 * Elevation presets approximating the Figma effect styles (Shadow/sm, Shadow/md)
 * for RN's single-shadow model. Spread on cards/sheets.
 */
import type { ViewStyle } from 'react-native';

export const shadowSm: ViewStyle = {
  shadowColor: '#17171A',
  shadowOpacity: 0.1,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

export const shadowMd: ViewStyle = {
  shadowColor: '#17171A',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 4 },
  elevation: 5,
};
