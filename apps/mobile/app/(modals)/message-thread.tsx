/**
 * Message Thread — matches Figma `Client / 16 Message Thread` (33:377). Live:
 * booking chat from `useBookingMessages` (polls) and `useSendMessage`. Outbound
 * vs inbound is decided by the signed-in user id. The API flags messages that
 * leak contact details (off-platform coordination).
 */
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { fonts } from '../../theme/fonts.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { Icon } from '../../components/Icon.js';
import { Skeleton } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { AnimatedPressable } from '../../components/Pressable.js';
import { useBookingMessages, useSendMessage, useBooking } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';
import { formatTime, formatDayLabel, dateTime } from '../../lib/format.js';

export default function MessageThread(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { booking } = useLocalSearchParams<{ booking: string }>();
  const bookingId = booking ?? '';
  const messages = useBookingMessages(bookingId);
  const send = useSendMessage(bookingId);
  const detail = useBooking(bookingId);
  const { user } = useAuth();
  const [text, setText] = useState('');
  const nextId = useRef(0);
  const [failed, setFailed] = useState<Array<{ id: number; body: string }>>([]);
  const [pendingBody, setPendingBody] = useState<string | null>(null);

  const isUsher = user?.role === 'USHER';
  const counterparty = isUsher
    ? detail.data?.event?.client?.displayName
    : (detail.data?.usher?.displayName ?? detail.data?.usher?.user.phone);
  const ev = detail.data?.event;
  const headerName = counterparty ?? ev?.title ?? `Booking · ${bookingId.slice(0, 6)}`;
  const headerSub = ev?.title ?? 'Coordination chat';
  const eventMeta = ev
    ? `${dateTime(ev.eventDate, ev.startTime)}${ev.venue ? ` · ${ev.venue}` : ''}`
    : null;

  const sendBody = (body: string, retryId?: number): void => {
    if (send.isPending) return;
    const id = retryId ?? ++nextId.current;
    setPendingBody(body);
    send.mutate(body, {
      onSuccess: () => setFailed((items) => items.filter((item) => item.id !== id)),
      onError: () =>
        setFailed((items) =>
          items.some((item) => item.id === id) ? items : [...items, { id, body }],
        ),
      onSettled: () => setPendingBody(null),
    });
  };
  const onSend = (): void => {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText('');
    sendBody(body);
  };

  const list = messages.data ?? [];

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      {/* header */}
      <Box
        flexDirection="row"
        alignItems="center"
        style={{
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderBottomWidth: 1.5,
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
        <Avatar name={headerName} size={40} />
        <Box flex={1}>
          <Text
            variant="label"
            style={{ fontSize: 15, lineHeight: 20 }}
            color="inkStrong"
            numberOfLines={1}
          >
            {headerName}
          </Text>
          <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
            {headerSub}
          </Text>
        </Box>
      </Box>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        {/* event context */}
        {eventMeta ? (
          <Box
            flexDirection="row"
            alignItems="center"
            style={{ gap: 8, paddingHorizontal: 16, paddingTop: 10 }}
          >
            <Icon name="calendar" size={14} color="inkMuted" />
            <Text variant="bodySm" color="inkMuted" numberOfLines={1} style={{ flex: 1 }}>
              {eventMeta}
            </Text>
          </Box>
        ) : null}

        <Box style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Banner
            tone="warning"
            message="For your protection, keep coordination & payment on HireQuick."
          />
        </Box>

        {/* messages */}
        {messages.isLoading ? (
          <Box style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'flex-end' }}>
            {[false, true, false, true].map((mine, i) => (
              <Box key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                <Skeleton width={mine ? 150 : 200} height={44} radius={16} />
              </Box>
            ))}
          </Box>
        ) : messages.isError ? (
          <EmptyState
            icon="alert-circle"
            title="Couldn’t load messages"
            subtitle="Your draft is still here. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              void messages.refetch();
            }}
          />
        ) : list.length === 0 ? (
          <Box style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon="message-circle"
              title="No messages yet"
              subtitle="Say hello and sort out the details for the day."
            />
          </Box>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: 16,
              gap: 12,
              flexGrow: 1,
              justifyContent: 'flex-end',
            }}
          >
            {(() => {
              const rows: React.ReactNode[] = [];
              let lastDay = '';
              for (const m of list) {
                const day = formatDayLabel(m.createdAt);
                if (day && day !== lastDay) {
                  lastDay = day;
                  rows.push(
                    <Box key={`sep-${m.id}`} alignItems="center" style={{ paddingVertical: 4 }}>
                      <Box
                        style={{
                          backgroundColor: theme.colors.bgInset,
                          paddingHorizontal: 12,
                          paddingVertical: 4,
                          borderRadius: theme.borderRadii.pill,
                        }}
                      >
                        <Text variant="labelSm" color="inkMuted">
                          {day}
                        </Text>
                      </Box>
                    </Box>,
                  );
                }
                const mine = m.senderId === user?.id;
                rows.push(
                  <Box
                    key={m.id}
                    style={{ maxWidth: '78%', alignSelf: mine ? 'flex-end' : 'flex-start', gap: 4 }}
                  >
                    <Box
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        backgroundColor: mine ? theme.colors.brandSurface : theme.colors.bgSurface,
                        borderWidth: mine ? 0 : 1,
                        borderColor: theme.colors.borderDefault,
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                        borderBottomLeftRadius: mine ? 16 : 6,
                        borderBottomRightRadius: mine ? 6 : 16,
                      }}
                    >
                      <Text variant="body" color={mine ? 'inverseInk' : 'inkDefault'}>
                        {m.content}
                      </Text>
                      {m.flagged ? (
                        <Text
                          variant="bodySm"
                          color={mine ? 'brandEmeraldTint' : 'statusWarning'}
                          style={{ marginTop: 4 }}
                        >
                          ⚠ Contact details are hidden
                        </Text>
                      ) : null}
                    </Box>
                    <Text
                      variant="labelSm"
                      color="inkFaint"
                      style={{ alignSelf: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}
                    >
                      {formatTime(m.createdAt)}
                    </Text>
                  </Box>,
                );
              }
              return rows;
            })()}
          </ScrollView>
        )}

        {pendingBody ? (
          <Box padding="300">
            <Text variant="bodySm" color="inkMuted" accessibilityLiveRegion="polite">
              Sending: {pendingBody}
            </Text>
          </Box>
        ) : null}
        {failed.length ? (
          <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
            {failed.map((item) => (
              <Box key={item.id} style={{ gap: 8 }}>
                <Text variant="bodySm" color="statusDanger" accessibilityRole="alert">
                  Couldn’t confirm delivery: {item.body}
                </Text>
                <Button
                  label="Retry this message"
                  variant="secondary"
                  size="md"
                  disabled={send.isPending}
                  onPress={() => sendBody(item.body, item.id)}
                />
              </Box>
            ))}
          </ScrollView>
        ) : null}
        {/* composer */}
        <Box
          flexDirection="row"
          alignItems="center"
          style={{
            gap: 12,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            borderTopWidth: 1.5,
            borderTopColor: theme.colors.borderDefault,
          }}
        >
          <Box
            flex={1}
            backgroundColor="bgSubtle"
            borderRadius="pill"
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
          >
            <TextInput
              accessibilityLabel="Message"
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={theme.colors.inkFaint}
              style={{
                fontFamily: fonts.sansRegular,
                fontSize: 15,
                color: theme.colors.inkStrong,
                paddingVertical: 8,
              }}
              onSubmitEditing={onSend}
              returnKeyType="send"
              multiline
            />
          </Box>
          <AnimatedPressable
            onPress={onSend}
            disabled={send.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandSurface,
                opacity: send.isPending ? 0.6 : 1,
              }}
            >
              <Icon name="arrow-up" size={20} color="inverseInk" />
            </Box>
          </AnimatedPressable>
        </Box>
      </KeyboardAvoidingView>
    </Box>
  );
}
