/**
 * Message Thread — matches Figma `Client / 16 Message Thread` (33:377). Live:
 * booking chat from `useBookingMessages` (polls) and `useSendMessage`. Outbound
 * vs inbound is decided by the signed-in user id. The API flags messages that
 * leak contact details (off-platform coordination).
 */
import { useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Avatar } from '../../components/Avatar.js';
import { Banner } from '../../components/Banner.js';
import { Icon } from '../../components/Icon.js';
import { Loading } from '../../components/Loading.js';
import { useBookingMessages, useSendMessage, useBooking } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';

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

  const isUsher = user?.role === 'USHER';
  const counterparty = isUsher ? detail.data?.event?.client?.displayName : detail.data?.usher?.displayName ?? detail.data?.usher?.user.phone;
  const headerName = counterparty ?? detail.data?.event?.title ?? `Booking · ${bookingId.slice(0, 6)}`;
  const headerSub = detail.data?.event?.title ?? 'Coordination chat';

  const onSend = (): void => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate(body, { onError: () => setText(body) });
  };

  const list = messages.data ?? [];

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      {/* header */}
      <Box
        flexDirection="row"
        alignItems="center"
        style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1.5, borderBottomColor: theme.colors.borderDefault }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="chevron-left" size={24} color="inkStrong" />
        </Pressable>
        <Avatar name={headerName} size={40} />
        <Box flex={1}>
          <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong" numberOfLines={1}>
            {headerName}
          </Text>
          <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
            {headerSub}
          </Text>
        </Box>
      </Box>

      <Box style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Banner tone="warning" message="For your protection, keep coordination & payment on HireQuick." />
      </Box>

      {/* messages */}
      {messages.isLoading ? (
        <Loading />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, justifyContent: 'flex-end' }}>
          {list.length === 0 ? (
            <Text variant="bodySm" color="inkMuted" style={{ textAlign: 'center' }}>
              No messages yet — say hello.
            </Text>
          ) : (
            list.map((m) => {
              const mine = m.senderId === user?.id;
              return (
                <Box
                  key={m.id}
                  style={{
                    maxWidth: '78%',
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: mine ? theme.colors.brandEmerald : theme.colors.bgSurface,
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
                    <Text variant="bodySm" color={mine ? 'brandEmeraldTint' : 'statusWarning'} style={{ marginTop: 4 }}>
                      ⚠ Contact details are hidden
                    </Text>
                  ) : null}
                </Box>
              );
            })
          )}
        </ScrollView>
      )}

      {/* composer */}
      <Box
        flexDirection="row"
        alignItems="center"
        style={{ gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}
      >
        <Icon name="plus" size={22} color="inkMuted" />
        <Box flex={1} backgroundColor="bgSubtle" borderRadius="pill" style={{ height: 44, justifyContent: 'center', paddingHorizontal: 16 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={theme.colors.inkFaint}
            style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, color: theme.colors.inkStrong, paddingVertical: 0 }}
            onSubmitEditing={onSend}
            returnKeyType="send"
          />
        </Box>
        <Pressable onPress={onSend} disabled={send.isPending}>
          <Box style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmerald }}>
            <Icon name="arrow-right" size={20} color="inverseInk" />
          </Box>
        </Pressable>
      </Box>
    </Box>
  );
}
