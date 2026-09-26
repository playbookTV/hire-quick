/** Booking chat: Gifted Chat presentation over the session-bound durable controller. */
import { useCallback, useRef, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bubble, GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { fonts } from '../../theme/fonts.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Icon } from '../../components/Icon.js';
import { EmptyState } from '../../components/EmptyState.js';
import { AnimatedPressable } from '../../components/Pressable.js';
import { useBooking } from '../../lib/hooks.js';
import { useBookingChat } from '../../lib/use-chat.js';
import { useAuth } from '../../lib/auth-context.js';
import { api } from '../../lib/client.js';
import { queryKeys } from '../../lib/query.js';
import { pickImageAsset, uploadChatPhoto } from '../../lib/upload.js';
import { useToast } from '../../lib/toast.js';
import { sessionStore } from '../../lib/tokens.js';
import { dateTime } from '../../lib/format.js';

interface ChatMessage extends IMessage {
  mediaType?: 'IMAGE' | 'VOICE';
  confirmed: boolean;
  failed?: boolean;
  flagged?: boolean;
}

export default function MessageThread(): React.JSX.Element {
  const { booking } = useLocalSearchParams<{ booking: string }>();
  const { user } = useAuth();
  if (!booking || !user)
    return (
      <EmptyState
        icon="message-circle"
        title="Conversation unavailable"
        subtitle="Open a conversation from your bookings."
      />
    );
  return (
    <BookingChat
      key={`${user.id}.${booking}`}
      bookingId={booking}
      userId={user.id}
      role={user.role}
    />
  );
}

function BookingChat({
  bookingId,
  userId,
  role,
}: {
  bookingId: string;
  userId: string;
  role: string;
}): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useBooking(bookingId);
  const chat = useBookingChat(bookingId, userId);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const composing = useRef(false);
  const [topHeight, setTopHeight] = useState(insets.top + 56);
  const canSend =
    !!detail.data &&
    !detail.isError &&
    ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID', 'DISPUTED'].includes(detail.data.status);
  const busy = uploading || chat.sending.length > 0;
  const event = detail.data?.event;
  const name =
    (role === 'USHER' ? event?.client?.displayName : detail.data?.usher?.displayName) ??
    'Booking conversation';
  const lastInbound = chat.messages
    .filter((message) => message.senderId !== userId && !message.seenAt)
    .at(-1)?.id;
  useFocusEffect(
    useCallback(() => {
      const markRead = () => {
        if (lastInbound && AppState.currentState === 'active') {
          void api
            .post(`/api/bookings/${bookingId}/messages/seen`, { upToMessageId: lastInbound })
            .then(() => qc.invalidateQueries({ queryKey: queryKeys.bookings }))
            .catch(() => undefined);
        }
      };
      markRead();
      const subscription = AppState.addEventListener('change', markRead);
      return () => subscription.remove();
    }, [bookingId, lastInbound, qc]),
  );

  const submitText = async () => {
    const content = text.trim();
    if (!content || !canSend || busy || composing.current) return;
    composing.current = true;
    setText('');
    try {
      await chat.controller.submit(content);
    } catch (error) {
      setText((draft) => draft || content);
      toast.error(error instanceof Error ? error.message : 'Couldn’t save this message.');
    } finally {
      composing.current = false;
    }
  };
  const sendPhoto = async () => {
    if (!canSend || busy || composing.current) return;
    composing.current = true;
    const generation = sessionStore.generation();
    setUploading(true);
    try {
      const asset = await pickImageAsset('library');
      if (!sessionStore.isCurrent(generation)) return;
      if (asset) await chat.controller.submit(await uploadChatPhoto(bookingId, asset), 'IMAGE');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t send photo.');
    } finally {
      composing.current = false;
      setUploading(false);
    }
  };
  const confirmedIds = new Set(chat.messages.map((message) => message.id));
  const messages: ChatMessage[] = [
    ...chat.messages.map((message) => ({
      _id: message.id,
      text: message.contentType === 'TEXT' ? message.content : '',
      createdAt: new Date(message.createdAt),
      user: { _id: message.senderId },
      confirmed: true,
      sent: true,
      received: !!message.seenAt,
      flagged: message.flagged,
      ...(message.contentType !== 'TEXT' ? { mediaType: message.contentType } : {}),
    })),
    ...chat.pending
      .filter((message) => !confirmedIds.has(message.clientMessageId))
      .map((message) => ({
        _id: message.clientMessageId,
        text: message.contentType === 'TEXT' ? message.content : '',
        createdAt: new Date(message.createdAt),
        user: { _id: userId },
        confirmed: false,
        pending: chat.sending.includes(message.clientMessageId),
        failed: !chat.sending.includes(message.clientMessageId),
        ...(message.contentType !== 'TEXT' ? { mediaType: message.contentType } : {}),
      })),
  ].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || String(b._id).localeCompare(String(a._id)),
  );

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingBottom: insets.bottom }}>
      <Box
        onLayout={(event) => setTopHeight(event.nativeEvent.layout.height)}
        style={{ paddingTop: insets.top }}
      >
        <Box
          flexDirection="row"
          alignItems="center"
          style={{
            gap: 12,
            paddingHorizontal: 24,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.borderDefault,
          }}
        >
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="chevron-left" size={24} color="inkStrong" />
          </AnimatedPressable>
          <Avatar name={name} size={36} />
          <Box flex={1}>
            <Text variant="label" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
              {event?.title ?? 'Coordination chat'}
            </Text>
          </Box>
        </Box>
        {event ? (
          <Text
            variant="bodySm"
            color="inkMuted"
            numberOfLines={1}
            style={{ paddingHorizontal: 16, paddingTop: 8 }}
          >
            {dateTime(event.eventDate, event.startTime)}
            {event.venue ? ` · ${event.venue}` : ''}
          </Text>
        ) : null}
        <Box style={{ paddingHorizontal: 24, paddingVertical: 8 }}>
          <Banner
            tone="warning"
            message="Keep payment and contact details on HireQuick. Messages and photos here can be reviewed if a dispute is opened."
          />
        </Box>
        {chat.error ? (
          <Box padding="300">
            <Text variant="bodySm" color="statusDanger" accessibilityRole="alert">
              {chat.error}
            </Text>
            <Button
              label="Refresh messages"
              variant="ghost"
              onPress={() => {
                void chat.controller.sync();
              }}
            />
          </Box>
        ) : null}
        {!canSend ? (
          <Text variant="bodySm" color="inkMuted" style={{ padding: 12 }}>
            {detail.isError
              ? 'Reload booking details before sending a message.'
              : 'This conversation is read-only.'}
          </Text>
        ) : null}
      </Box>
      <GiftedChat<ChatMessage>
        messages={messages}
        user={{ _id: userId }}
        text={text}
        colorScheme={scheme === 'dark' ? 'dark' : 'light'}
        keyboardAvoidingViewProps={{ keyboardVerticalOffset: topHeight }}
        renderAvatar={null}
        isScrollToBottomEnabled
        isDayAnimationEnabled={false}
        textInputProps={{
          onChangeText: setText,
          editable: canSend,
          maxLength: 4000,
          placeholder: 'Message…',
          accessibilityLabel: 'Message',
          style: { color: theme.colors.inkStrong, fontFamily: fonts.sansRegular },
        }}
        loadEarlierMessagesProps={{
          isAvailable: chat.hasOlder,
          isLoading: chat.loadingOlder,
          onPress: () => {
            void chat.controller.loadOlder();
          },
          label: 'Load older messages',
        }}
        renderChatEmpty={() => (
          <Box style={{ transform: [{ scaleY: -1 }] }}>
            <EmptyState
              icon="message-circle"
              title={chat.ready ? 'No messages yet' : 'Loading messages…'}
              subtitle={
                chat.ready
                  ? 'Say hello and sort out the details for the day.'
                  : 'Your conversation will appear here.'
              }
            />
          </Box>
        )}
        timeTextStyle={{
          left: { color: theme.colors.inkMuted },
          right: { color: theme.colors.inkOnAccent },
        }}
        renderBubble={(props) => (
          <Bubble
            {...props}
            wrapperStyle={{
              left: {
                backgroundColor: theme.colors.bgSurface,
                borderWidth: 1,
                borderColor: theme.colors.borderDefault,
                borderRadius: 12,
              },
              right: { backgroundColor: theme.colors.brandAccent, borderRadius: 12 },
            }}
            textStyle={{
              left: {
                color: theme.colors.inkStrong,
                fontFamily: fonts.sansRegular,
                fontSize: 16,
                lineHeight: 24,
              },
              right: {
                color: theme.colors.inkOnAccent,
                fontFamily: fonts.sansRegular,
                fontSize: 16,
                lineHeight: 24,
              },
            }}
            renderTicks={(message) =>
              message.user._id === userId ? (
                <Text variant="labelSm" color="inkOnAccent" style={{ paddingRight: 8 }}>
                  {message.received ? 'Read' : message.confirmed ? 'Sent' : ''}
                </Text>
              ) : null
            }
          />
        )}
        renderCustomView={({ currentMessage: message }) => (
          <Box style={{ paddingHorizontal: 10, gap: 4 }}>
            {message.mediaType ? (
              message.confirmed ? (
                <ChatMedia
                  bookingId={bookingId}
                  messageId={String(message._id)}
                  type={message.mediaType}
                />
              ) : (
                <Text variant="bodySm" color="inkOnAccent">
                  Photo waiting to send
                </Text>
              )
            ) : null}
            {message.flagged ? (
              <Text
                variant="bodySm"
                color={message.user._id === userId ? 'inkOnAccent' : 'statusWarning'}
              >
                Keep contact and payment on HireQuick.
              </Text>
            ) : null}
            {message.pending ? (
              <Text variant="bodySm" color="inkOnAccent">
                Sending…
              </Text>
            ) : null}
            {message.failed ? (
              <Button
                label="Delivery unconfirmed · Retry"
                variant="secondary"
                disabled={!canSend || busy}
                onPress={() => {
                  void chat.controller
                    .retry(String(message._id))
                    .catch(() => toast.error('Reopen this conversation to retry.'));
                }}
              />
            ) : null}
          </Box>
        )}
        renderActions={() => (
          <AnimatedPressable
            onPress={() => {
              void sendPhoto();
            }}
            disabled={!canSend || busy}
            accessibilityRole="button"
            accessibilityLabel={uploading ? 'Uploading photo' : 'Share photo'}
            style={{ padding: 12 }}
          >
            <Icon name="paperclip" size={22} color="inkMuted" />
          </AnimatedPressable>
        )}
        renderSend={() => (
          <AnimatedPressable
            onPress={() => {
              void submitText();
            }}
            disabled={!canSend || busy || !text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={{
              padding: 12,
              margin: 6,
              borderRadius: 24,
              backgroundColor: theme.colors.brandAccent,
              opacity: !canSend || busy || !text.trim() ? 0.4 : 1,
            }}
          >
            <Icon name="send" size={22} color="inkOnAccent" />
          </AnimatedPressable>
        )}
      />
    </Box>
  );
}

function ChatMedia({
  bookingId,
  messageId,
  type,
}: {
  bookingId: string;
  messageId: string;
  type: string;
}): React.JSX.Element {
  const query = useQuery({
    queryKey: ['chatMedia', bookingId, messageId],
    queryFn: ({ signal }) =>
      api.get<{ url: string }>(`/api/bookings/${bookingId}/messages/${messageId}/media-url`, {
        signal,
      }),
    staleTime: 60_000,
  });
  if (query.isError)
    return (
      <Button
        label="Retry attachment"
        variant="secondary"
        onPress={() => {
          void query.refetch();
        }}
      />
    );
  if (!query.data) return <Text variant="bodySm">Loading attachment…</Text>;
  return type === 'IMAGE' ? (
    <Image
      source={{ uri: query.data.url }}
      style={{ width: 200, height: 200 }}
      contentFit="contain"
      accessibilityLabel="Photo shared in this booking"
    />
  ) : (
    <Text variant="bodySm">Voice attachment — contact support to access this recording.</Text>
  );
}
