/**
 * Usher check-in (critique P0 — this screen was missing). At the event, the host
 * generates a 6-digit code on their Event-Day roster; the usher enters it here to
 * confirm arrival (`useVerifyCheckin` → CHECKED_IN). This is the moment a worker
 * most needs to feel "I've arrived and my pay is locked in", so each status has a
 * designed, reassuring state rather than a silent screen or an OS alert.
 *
 *   CONFIRMED      → enter code  ("ask the host for your code")
 *   CHECKED_IN     → attendance confirmed; funds remain held
 *   COMPLETED → held until eligible; PAID → credited to wallet
 */
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { IconCircle } from '../../components/IconCircle.js';
import { Loading } from '../../components/Loading.js';
import { shadowMd } from '../../theme/shadows.js';
import { fonts } from '../../theme/fonts.js';
import { useBooking, useVerifyCheckin } from '../../lib/hooks.js';
import { hapticSuccess } from '../../lib/haptics.js';
import { heldFundsCopy, walletReleaseCopy } from '../../lib/payment-copy.js';
import { money, formatEventDate, formatTimeRange } from '../../lib/format.js';
import type { Booking } from '../../lib/types.js';

export default function CheckIn(): React.JSX.Element {
  const { booking: bookingId } = useLocalSearchParams<{ booking: string }>();
  const id = bookingId ?? '';
  const booking = useBooking(id);

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Check in" showBack inset />
      <Screen scroll>
        {booking.isLoading ? (
          <Box style={{ paddingTop: 48 }}>
            <Loading />
          </Box>
        ) : booking.isError || !booking.data ? (
          <ErrorState onRetry={() => void booking.refetch()} />
        ) : (
          <CheckInBody booking={booking.data} />
        )}
      </Screen>
    </Box>
  );
}

function CheckInBody({ booking }: Readonly<{ booking: Booking }>): React.JSX.Element {
  const router = useRouter();
  const verify = useVerifyCheckin(booking.id);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (): void => {
    if (code.length !== 6) return;
    setError(null);
    verify.mutate(code, {
      onSuccess: () => hapticSuccess(),
      onError: (e: unknown) =>
        setError(
          e instanceof Error ? e.message : 'That code didn’t match. Ask the host to read it again.',
        ),
    });
  };

  const ev = booking.event;
  const host = ev?.client?.displayName;
  const pay = booking.payment ? money(booking.payment.usherPayout) : null;
  const released = booking.payment?.escrowStatus === 'RELEASED';

  return (
    <Box style={{ gap: 20 }}>
      {/* event context — recognition, not recall */}
      {ev ? (
        <Box
          backgroundColor="bgSurface"
          borderWidth={1}
          borderColor="borderDefault"
          borderRadius="lg"
          padding="400"
          style={{ gap: 8 }}
        >
          <Text variant="titleM" numberOfLines={2}>
            {ev.title}
          </Text>
          <ContextRow icon="calendar" text={formatEventDate(ev.eventDate)} />
          {ev.startTime && ev.endTime ? (
            <ContextRow icon="clock" text={formatTimeRange(ev.startTime, ev.endTime)} />
          ) : null}
          {ev.venue ? <ContextRow icon="map-pin" text={ev.venue} /> : null}
          {host ? <ContextRow icon="user" text={`Hosted by ${host}`} /> : null}
        </Box>
      ) : null}

      {booking.status === 'CONFIRMED' ? (
        <Box style={{ gap: 16 }}>
          <Box style={{ gap: 4 }}>
            <Text variant="h2">You’re booked — check in on arrival</Text>
            <Text variant="body" color="inkMuted">
              Ask the event host for your 6-digit check-in code, then enter it below to confirm
              you’ve arrived.
            </Text>
          </Box>

          <CodeField value={code} onChange={setCode} />

          {error ? (
            <Box
              flexDirection="row"
              alignItems="center"
              backgroundColor="statusDangerTint"
              borderRadius="md"
              padding="300"
              style={{ gap: 8 }}
            >
              <Icon name="alert-circle" size={16} color="statusDanger" />
              <Text variant="bodySm" color="statusDanger" style={{ flex: 1 }}>
                {error}
              </Text>
            </Box>
          ) : null}

          <Button
            label={verify.isPending ? 'Checking in…' : 'Check in'}
            onPress={onSubmit}
            loading={verify.isPending}
            disabled={code.length !== 6 || verify.isPending}
          />

          {/* the payment-confidence reassurance — the whole point of checking in */}
          <Box
            flexDirection="row"
            alignItems="center"
            backgroundColor="brandEmeraldTintWeak"
            borderRadius="md"
            padding="300"
            style={{ gap: 8 }}
          >
            <Icon name="shield" size={18} color="brandEmerald" />
            <Text variant="bodySm" color="brandEmerald" style={{ flex: 1 }}>
              {pay ? `Your payout after the platform fee is ${pay}. ` : ''}
              {heldFundsCopy}
            </Text>
          </Box>
        </Box>
      ) : booking.status === 'CHECKED_IN' ? (
        <ResultState
          tone="success"
          icon="check"
          title="You’re checked in"
          body={`Your attendance is recorded. ${heldFundsCopy} ${walletReleaseCopy}`}
          amountLabel="YOUR PAY"
          amount={pay ?? undefined}
          primary={{ label: 'Done', onPress: () => router.back() }}
        />
      ) : booking.status === 'PAID' || booking.status === 'COMPLETED' ? (
        <ResultState
          tone="success"
          icon="check-circle"
          title={released ? 'Released to your wallet' : 'Booking completed'}
          body={
            released && pay
              ? `Your ${pay} payout after the platform fee has been released to your wallet.`
              : `${heldFundsCopy} ${walletReleaseCopy}`
          }
          amountLabel={released ? 'EARNED' : 'EXPECTED PAYOUT'}
          amount={pay ?? undefined}
          primary={{ label: 'View wallet', onPress: () => router.replace('/(usher)/wallet') }}
        />
      ) : (
        <ResultState
          tone="neutral"
          icon="clock"
          title="Not ready to check in yet"
          body="This booking isn’t active for check-in right now. It’ll open here on the event day."
          primary={{ label: 'Back', onPress: () => router.back() }}
        />
      )}
    </Box>
  );
}

function ContextRow({
  icon,
  text,
}: Readonly<{ icon: React.ComponentProps<typeof Icon>['name']; text: string }>): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
      <Icon name={icon} size={16} color="inkMuted" />
      <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </Box>
  );
}

/** Big, centred 6-digit field — mirrors the host's code card so the two read as one object. */
function CodeField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (v: string) => void }>): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderStrong"
      borderRadius="lg"
      style={{ paddingVertical: 20, paddingHorizontal: 16 }}
    >
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        placeholder="------"
        placeholderTextColor={theme.colors.inkFaint}
        accessibilityLabel="6-digit check-in code"
        maxLength={6}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: 36,
          letterSpacing: 10,
          textAlign: 'center',
          color: theme.colors.inkStrong,
          padding: 0,
        }}
      />
    </Box>
  );
}

interface ResultProps {
  tone: 'success' | 'neutral';
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  body: string;
  amountLabel?: string;
  amount?: string;
  primary: { label: string; onPress: () => void };
}

function ResultState({
  tone,
  icon,
  title,
  body,
  amountLabel,
  amount,
  primary,
}: Readonly<ResultProps>): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box alignItems="center" style={{ gap: 16, paddingTop: 8 }}>
      <IconCircle
        icon={icon}
        tone={tone}
        size={96}
        iconColor={tone === 'success' ? 'statusSuccess' : 'inkMuted'}
      />
      <Text variant="h2" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
        {body}
      </Text>

      {amount && amountLabel ? (
        <Box
          alignSelf="stretch"
          alignItems="center"
          borderRadius="lg"
          style={[
            {
              backgroundColor: theme.colors.brandSurface,
              paddingVertical: 20,
              paddingHorizontal: 24,
              gap: 4,
            },
            shadowMd,
          ]}
        >
          <Text variant="overline" color="onBrandAccent">
            {amountLabel}
          </Text>
          <Text
            style={{
              fontFamily: fonts.displayBlack,
              fontSize: 40,
              lineHeight: 44,
              letterSpacing: -1.5,
            }}
            color="inverseInk"
          >
            {amount}
          </Text>
        </Box>
      ) : null}

      <Box alignSelf="stretch" style={{ paddingTop: 4 }}>
        <Button label={primary.label} onPress={primary.onPress} />
      </Box>
    </Box>
  );
}

function ErrorState({ onRetry }: Readonly<{ onRetry: () => void }>): React.JSX.Element {
  return (
    <Box
      alignItems="center"
      style={{ gap: 16, paddingTop: 48, maxWidth: 360, alignSelf: 'center' }}
    >
      <IconCircle icon="wifi-off" tone="neutral" size={96} iconColor="inkMuted" />
      <Text variant="h2" style={{ textAlign: 'center' }}>
        Couldn’t load this booking
      </Text>
      <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
        Check your connection and try again.
      </Text>
      <Box alignSelf="stretch" style={{ paddingTop: 4 }}>
        <Button label="Try again" onPress={onRetry} />
      </Box>
    </Box>
  );
}
