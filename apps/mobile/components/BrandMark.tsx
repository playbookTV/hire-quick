import { Image } from 'expo-image';
import { Box } from '../theme/restyle.js';
import { canvasTokens } from '../theme/token-manager.js';
import background from '../assets/welcome/brand-background.svg';
import mark from '../assets/welcome/brand-mark.svg';

/** The official artwork, shared by onboarding and the launch screen. */
export function BrandMark(): React.JSX.Element {
  const { size, left, top, width, height } = canvasTokens.brandMark;
  return (
    <Box width={size} height={size} accessibilityLabel="HireQuick" accessible>
      <Image
        source={background}
        style={{ position: 'absolute', width: size, height: size }}
        accessible={false}
      />
      <Image
        source={mark}
        style={{ position: 'absolute', left, top, width, height }}
        accessible={false}
      />
    </Box>
  );
}
