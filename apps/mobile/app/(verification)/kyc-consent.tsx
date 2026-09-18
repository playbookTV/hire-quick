/** The native identity widget is not available yet; deep links use manual review. */
import { Redirect } from 'expo-router';

export default function KycConsent(): React.JSX.Element {
  return <Redirect href="/(verification)/id-verification" />;
}
