/** Old entry links now open Smile ID onboarding; biometric consent is captured by the SDK. */
import { Redirect } from 'expo-router';

export default function KycConsent(): React.JSX.Element {
  return <Redirect href="/(verification)/id-verification" />;
}
