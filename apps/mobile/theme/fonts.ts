/** Archivo display + Manrope UI, bundled locally and gated by the app splash. */
import { useFonts } from 'expo-font';
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';

export const fonts = {
  displayRegular: 'Archivo_400Regular',
  displayMedium: 'Archivo_500Medium',
  displaySemibold: 'Archivo_600SemiBold',
  displayBold: 'Archivo_700Bold',
  displayBlack: 'Archivo_800ExtraBold',
  sansRegular: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemibold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
} as const;

export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    // Compatibility for existing screen-local styles during the screen migration.
    Fraunces_400Regular: Archivo_400Regular,
    Fraunces_500Medium: Archivo_500Medium,
    Fraunces_600SemiBold: Archivo_600SemiBold,
    Fraunces_700Bold: Archivo_700Bold,
    Fraunces_900Black: Archivo_800ExtraBold,
    PlusJakartaSans_400Regular: Manrope_400Regular,
    PlusJakartaSans_500Medium: Manrope_500Medium,
    PlusJakartaSans_600SemiBold: Manrope_600SemiBold,
    PlusJakartaSans_700Bold: Manrope_700Bold,
  });
}
