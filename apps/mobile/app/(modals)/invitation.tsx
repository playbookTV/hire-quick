/**
 * Invitation — matches Figma `Usher / 04 Invitation` (49:150): an emerald hero,
 * the event summary card, a warning that accepting only reserves the slot (the
 * booking confirms once the client funds escrow), and Decline / Accept actions.
 *
 * Hydrated from an `id` param (a deep link from the notifications inbox or the
 * invites list). Accept/Decline drive `PATCH /api/invitations/:id`; accepting
 * creates an ACCEPTED application the client can then confirm into a booking.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { MetaRow } from '../../components/MetaRow.js';
import { Icon } from '../../components/Icon.js';
import { Loading } from '../../components/Loading.js';
import { EmptyState } from '../../components/EmptyState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { shadowMd } from '../../theme/shadows.js';
import { useInvitation, useRespondInvitation } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { money, dateTime } from '../../lib/format.js';
import { userMessage } from '../../lib/api-error.js';

export default function Invitation(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const invitationId = id ?? '';
  const inv = useInvitation(invitationId);
  const respond = useRespondInvitation(invitationId);

  if (inv.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Invitation" showBack inset />
        <Loading />
      </Box>
    );
  }

  if (inv.isError || !inv.data) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Invitation" showBack inset />
        <EmptyState
          icon="alert-circle"
          title="Couldn’t load this invitation"
          subtitle="It may have been withdrawn, or you’re offline."
          actionLabel="Try again"
          onAction={() => void inv.refetch()}
        />
      </Box>
    );
  }

  const data = inv.data;
  const ev = data.event;
  const clientName = ev.client.businessName ?? ev.client.displayName;
  const pending = data.status === 'SENT';
  const busy = respond.isPending;

  const onAccept = (): void => {
    respond.mutate('ACCEPTED', {
      onSuccess: () => {
        toast.success('Slot reserved. You’ll be booked once the client pays.', 'Invitation accepted');
        router.replace('/(usher)/jobs');
      },
      onError: (e: unknown) => toast.error(userMessage(e), 'Couldn’t accept'),
    });
  };
  const onDecline = (): void => {
    respond.mutate('DECLINED', {
      onSuccess: () => {
        toast.info('Invitation declined.');
        router.back();
      },
      onError: (e: unknown) => toast.error(userMessage(e), 'Couldn’t decline'),
    });
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Invitation" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          {/* hero */}
          <Box alignItems="center" borderRadius="lg" style={[{ backgroundColor: theme.colors.brandEmerald, padding: 20, gap: 12 }, shadowMd]}>
            <Box style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldStrong }}>
              <Icon name="mail" size={26} color="inverseInk" />
            </Box>
            <Text variant="h2" color="inverseInk">You’re invited!</Text>
            <Text variant="body" color="brandEmeraldTint" style={{ textAlign: 'center' }}>
              {clientName} invited you to usher at {ev.title}.
            </Text>
          </Box>

          {/* event */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between" style={{ gap: 12 }}>
              <Text variant="titleM" numberOfLines={1} style={{ flex: 1 }}>{ev.title}</Text>
              <Text variant="amountM" color="brandEmerald">{money(ev.budgetPerHead)}</Text>
            </Box>
            <MetaRow icon="calendar" text={dateTime(ev.eventDate, ev.startTime)} />
            <MetaRow icon="map-pin" text={ev.dressCode ? `${ev.venue} · ${ev.dressCode}` : ev.venue} />
          </Box>

          {pending ? (
            <Banner tone="warning" message={`Accepting reserves your slot. The booking confirms once ${clientName} pays.`} />
          ) : (
            <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
              <Text variant="bodySm" color="inkMuted">This invitation is</Text>
              <StatusPill status={data.status} />
            </Box>
          )}
        </Box>
      </Screen>

      {/* actions */}
      {pending ? (
        <Box flexDirection="row" backgroundColor="bgCanvas" style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
          <Box flex={1}>
            <Button label="Decline" variant="secondary" onPress={onDecline} disabled={busy} />
          </Box>
          <Box flex={1}>
            <Button label={busy ? '…' : 'Accept'} onPress={onAccept} disabled={busy} />
          </Box>
        </Box>
      ) : (
        <Box backgroundColor="bgCanvas" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Box>
      )}
    </Box>
  );
}
