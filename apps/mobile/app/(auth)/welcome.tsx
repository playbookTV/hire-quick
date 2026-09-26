/** Figma A01: original event photography, official mark and full-bleed welcome. */
import { Redirect, useRouter } from 'expo-router';
import { ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { DevLogin } from '../../components/DevLogin.js';
import { Loading } from '../../components/Loading.js';
import { useAuth } from '../../lib/auth-context.js';
import { primitiveTokens, screenTokens } from '../../theme/token-manager.js';
import photo from '../../assets/welcome/event.jpg';
import brandBackground from '../../assets/welcome/brand-background.svg';
import brandMark from '../../assets/welcome/brand-mark.svg';

export default function Welcome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authed') return <Redirect href="/" />;
  return (
    <Box flex={1} style={{ backgroundColor: primitiveTokens['overlay/black'] }}>
      <StatusBar style="light" />
      <Image
        source={photo}
        contentFit="cover"
        contentPosition={{ left: '20%', top: '0%' }}
        style={{ position: 'absolute', width: '100%', height: height * 0.62 }}
        accessible={false}
      />
      <LinearGradient
        colors={['transparent', primitiveTokens['overlay/black']]}
        locations={[0.26, 0.54]}
        style={{ position: 'absolute', width: '100%', height }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: screenTokens.gutter,
        }}
      >
        <Box width={79} height={79} accessibilityLabel="HireQuick" accessible>
          <Image source={brandBackground} style={{ position: 'absolute', width: 79, height: 79 }} />
          <Image
            source={brandMark}
            style={{ position: 'absolute', left: 15.28, top: 19.92, width: 48.44, height: 40.61 }}
          />
        </Box>
        <Box flex={1} minHeight={180} />
        <Box gap="300" marginBottom="800">
          <Text variant="displayXL" color="inkOnElevated" accessibilityRole="header">
            Event staff,{'\n'}booked properly.
          </Text>
          <Text variant="bodyLg" color="inkOnElevatedMuted">
            Hire verified ushers for events across Lagos. Payment is held securely until work is
            completed and the dispute window closes.
          </Text>
        </Box>
        <Box gap="200">
          <Button label="Get started" onPress={() => router.push('/(auth)/role')} />
          <Pressable
            onPress={() => router.push('/(auth)/phone')}
            accessibilityRole="button"
            style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="labelLg" color="inkOnElevated">
              I already have an account
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/privacy-policy')}
            accessibilityRole="link"
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="bodySm" color="inkOnElevatedMuted" textAlign="center">
              Read our Privacy policy
            </Text>
          </Pressable>
          <DevLogin />
        </Box>
      </ScrollView>
    </Box>
  );
}
