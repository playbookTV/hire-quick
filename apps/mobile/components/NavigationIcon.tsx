/** Original 22×22 Figma artwork, bundled for offline use. */
import { Image } from 'expo-image';
import home from '../assets/icons/home.svg';
import discover from '../assets/icons/search.svg';
import events from '../assets/icons/calendardays.svg';
import messages from '../assets/icons/message.svg';
import profile from '../assets/icons/user.svg';
import jobs from '../assets/icons/briefcase.svg';
import wallet from '../assets/icons/wallet.svg';
const sources: Record<string, number> = {
  home,
  discover,
  events,
  messages,
  profile,
  jobs,
  wallet,
};
export function NavigationIcon({ name, color }: { name: string; color: string }) {
  const source = sources[name];
  if (!source) return null;
  return (
    <Image
      source={source}
      tintColor={color}
      contentFit="contain"
      style={{ width: 22, height: 22 }}
      accessible={false}
    />
  );
}
