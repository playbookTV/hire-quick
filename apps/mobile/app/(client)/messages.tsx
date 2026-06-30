/**
 * Messages — matches Figma `Client / 15 Messages` (32:333). Booking chats unlock
 * once a booking is CONFIRMED. Shared with the usher side via `ConversationList`.
 */
import { ConversationList } from '../../components/ConversationList.js';

export default function Messages(): React.JSX.Element {
  return <ConversationList />;
}
