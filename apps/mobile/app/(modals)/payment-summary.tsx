/**
 * Confirm & pay — matches Figma `Client / 17 Payment Summary` (34:391). Live:
 * runs the confirm-batch (`useConfirmEvent`) which creates the order + bookings
 * and returns a Paystack authorization URL we open in a browser. Escrow HOLD
 * completes on the Paystack webhook, so locally we land on Funds Held in a
 * "payment opened" state. Line items come from the accepted applications.
 */
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
import { useEvent, useApplications, useConfirmEvent } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';
import { useToast } from '../../lib/toast.js';
import { CategoryBadge } from '../../components/CategoryBadge.js';
import { money, formatEventDate, formatTimeRange } from '../../lib/format.js';

export default function PaymentSummary(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, apps } = useLocalSearchParams<{ id: string; apps: string }>();
  const eventId = id ?? '';
  const appIds = (apps ?? '').split(',').filter(Boolean);
  const event = useEvent(eventId);
  const applications = useApplications(eventId);
  const confirm = useConfirmEvent(eventId);
  const { user } = useAuth();
  const toast = useToast();
  const ev = event.data;

  const perHead = event.data?.budgetPerHead ?? 0;
  const chosen = (applications.data ?? []).filter((a) => appIds.includes(a.id));
  const count = appIds.length;
  const total = perHead * count;
  const email = user?.email ?? `${(user?.phone ?? 'client').replace(/\D/g, '')}@hirequick.ng`;

  const pay = (): void => {
    confirm.mutate(
      { applicationIds: appIds, email },
      {
        onSuccess: (res) => {
          const bookingId = res.bookingIds[0];
          if (!bookingId) {
            toast.error('We couldn’t confirm your booking. Please try again.', 'Payment couldn’t start');
            return;
          }
          void (async () => {
            if (res.authorizationUrl) {
              await WebBrowser.openBrowserAsync(res.authorizationUrl);
            }
            router.replace({ pathname: '/(modals)/funds-held', params: { booking: bookingId } });
          })();
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Please try again.', 'Payment couldn’t start'),
      },
    );
  };

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
              const name = a.usher.displayName ?? a.usher.user.phone;
              return (
                <Box key={a.id} flexDirection="row" alignItems="center" style={{ gap: 12 }}>
                  <Avatar name={name} size={32} />
                  <Text variant="bodyLg" color="inkDefault" style={{ flex: 1 }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
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
              <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                {money(total)}
              </Text>
            </Box>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="body" color="inkMuted">
                Platform fee (15%)
              </Text>
              <Text variant="label" style={{ fontSize: 15 }} color="inkStrong">
                Paid by staff
              </Text>
            </Box>
            <Box style={{ width: 100, height: 1 }} backgroundColor="borderDefault" />
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">You pay</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }} color="brandEmerald">
                {money(total)}
              </Text>
            </Box>
            <Text variant="bodySm" color="inkMuted">
              The 15% fee is deducted from each usher’s payout — your total is exactly {money(total)}.
            </Text>
          </Box>

          <Banner tone="brand" message="Held in escrow — released to each usher only when they check in." />

          <ListItem icon="credit-card" title="Paystack" subtitle="Secure card payment" actionLabel="" />
        </Box>

        <Box style={{ flex: 1, minHeight: 24 }} />
        <Box style={{ gap: 8, paddingBottom: insets.bottom }}>
          <Button label={confirm.isPending ? 'Starting…' : `Pay ${money(total)}`} disabled={confirm.isPending || count === 0} onPress={pay} />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            Secured by Paystack
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
