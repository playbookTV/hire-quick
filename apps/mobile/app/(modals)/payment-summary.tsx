/**
 * Confirm & pay — matches Figma `Client / 17 Payment Summary` (34:391). Live:
 * runs the confirm-batch (`useConfirmEvent`) which creates the order + bookings
 * and returns a Paystack authorization URL we open in a browser. Escrow HOLD
 * completes on the Paystack webhook, so locally we land on Funds Held in a
 * "payment opened" state. Line items come from the accepted applications.
 */
import { useEffect, useRef } from 'react';
import { createCheckoutScopeFence } from '../../lib/checkout.js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { AppBar } from '../../components/AppBar.js';
import { Screen } from '../../components/Screen.js';
import { Avatar } from '../../components/Avatar.js';
import { Banner } from '../../components/Banner.js';
import { ListItem } from '../../components/ListItem.js';
import { Button } from '../../components/Button.js';
import { Loading } from '../../components/Loading.js';
import { EmptyState } from '../../components/EmptyState.js';
import { useEvent, useApplications, useConfirmEvent, useSavedCheckout } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';
import { useToast } from '../../lib/toast.js';
import { CategoryBadge } from '../../components/CategoryBadge.js';
import { fonts } from '../../theme/fonts.js';
import { money, formatEventDate, formatTimeRange } from '../../lib/format.js';

export default function PaymentSummary(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, apps } = useLocalSearchParams<{ id: string; apps: string }>();
  const eventId = id ?? '';
  const saved = useSavedCheckout(eventId);
  const appIds = saved.data?.input.applicationIds ?? (apps ?? '').split(',').filter(Boolean);
  const event = useEvent(eventId);
  const applications = useApplications(eventId);
  const confirm = useConfirmEvent(eventId);
  const { user } = useAuth();
  const toast = useToast();
  const fence = useRef(createCheckoutScopeFence()).current;
  const scope = `${user?.id ?? ''}:${eventId}`;
  fence.activate(scope);
  useEffect(() => { fence.activate(scope); return () => fence.invalidate(); }, [fence, scope]);
  const ev = event.data;

  const perHead = saved.data?.outcome ? saved.data.outcome.amountKobo / appIds.length : event.data?.budgetPerHead ?? 0;
  const chosen = (applications.data ?? []).filter((a) => appIds.includes(a.id));
  const count = appIds.length;
  const total = perHead * count;
  const email = saved.data?.input.email ?? user?.email ?? `${(user?.phone ?? 'client').replace(/\D/g, '')}@hirequick.ng`;

  const pay = (): void => {
    const current = fence.capture();
    confirm.mutate(
      { applicationIds: appIds, email },
      {
        onSuccess: (res) => {
          if (!current()) return;
          void (async () => {
            try {
              if (res.state === 'READY' && res.authorizationUrl) await WebBrowser.openBrowserAsync(res.authorizationUrl);
            } catch (error) {
              if (current()) toast.error(error instanceof Error ? error.message : 'Could not open Paystack.', 'Checkout saved');
            } finally {
              if (current()) router.replace({ pathname: '/(modals)/funds-held', params: { event: eventId } });
            }
          })();
        },
        onError: (e: unknown) => { if (current()) toast.error(e instanceof Error ? e.message : 'Please try again.', 'Payment couldn’t start'); },
      },
    );
  };

  // Don't render the pay screen until the event AND the chosen ushers have loaded —
  // otherwise the line-items list is empty while the total still shows the full price (C7).
  if (event.isLoading || applications.isLoading || saved.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Confirm & pay" showBack inset />
        <Loading />
      </Box>
    );
  }
  if (saved.isError || event.isError || !ev || (!saved.data?.outcome && chosen.length !== count)) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Confirm & pay" showBack inset />
        <Box style={{ paddingTop: 40 }}>
          <EmptyState
            icon="alert-circle"
            title="Couldn’t load your booking"
            subtitle="We couldn’t confirm the staff and price for this order. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              void saved.refetch();
              void event.refetch();
              void applications.refetch();
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Confirm & pay" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          {/* event context — what you're paying for */}
          {ev ? (
            <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 8 }}>
              <Text variant="overline" color="inkMuted">PAYING FOR</Text>
              <Text variant="titleM" numberOfLines={2}>{ev.title}</Text>
              {ev.category ? <CategoryBadge category={ev.category} size="sm" /> : null}
              <Text variant="bodySm" color="inkMuted">{ev.venue}</Text>
              <Text variant="bodySm" color="inkMuted">
                {formatEventDate(ev.eventDate)}
                {ev.startTime && ev.endTime ? ` · ${formatTimeRange(ev.startTime, ev.endTime)}` : ''}
              </Text>
            </Box>
          ) : null}

          {/* line items */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <Text variant="titleM">Booking {count} {count === 1 ? 'usher' : 'ushers'}</Text>
            {chosen.map((a) => {
              const name = a.usher.displayName ?? 'Usher';
              return (
                <Box key={a.id} flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                  <Avatar name={name} size={32} />
                  <Text variant="bodyLg" color="inkDefault" style={{ flex: 1 }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="labelLg" color="inkStrong">
                    {money(perHead)}
                  </Text>
                </Box>
              );
            })}
          </Box>

          {/* totals */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="body" color="inkMuted">
                Subtotal · {count} × {money(perHead)}
              </Text>
              <Text variant="labelLg" color="inkStrong">
                {money(total)}
              </Text>
            </Box>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="body" color="inkMuted">
                Platform fee (15%)
              </Text>
              <Text variant="labelLg" color="inkStrong">
                Paid by staff
              </Text>
            </Box>
            <Box style={{ width: 100, height: 1 }} backgroundColor="borderDefault" />
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">You pay</Text>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }} color="brandEmerald">
                {money(total)}
              </Text>
            </Box>
            <Text variant="bodySm" color="inkMuted">
              The 15% fee is deducted from each usher’s payout — your total is exactly {money(total)}.
            </Text>
          </Box>

          <Banner tone="brand" message="Held safely — released to each usher only when they check in." />

          <ListItem icon="credit-card" title="Paystack" subtitle="Secure card payment" actionLabel="" />
        </Box>

        <Box style={{ flex: 1, minHeight: 24 }} />
        <Box style={{ gap: 8, paddingBottom: insets.bottom }}>
          <Button label={confirm.isPending ? 'Checking…' : saved.data ? 'Resume saved checkout' : `Pay ${money(total)}`}  disabled={confirm.isPending || count === 0} onPress={pay} />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            Secured by Paystack
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
