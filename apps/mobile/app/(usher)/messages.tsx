/**
 * Usher Messages tab — the usher side of booking chat. Same conversation list as
 * the client (`ConversationList` reads the role from auth and shows the other party).
 */
import { ConversationList } from '../../components/ConversationList.js';

export default function UsherMessages(): React.JSX.Element {
  return <ConversationList />;
}
