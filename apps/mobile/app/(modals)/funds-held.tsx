/** Restores the original checkout, including browser cancellation and uncertain payment. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { checkoutResponseSchema, type CheckoutResponse } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Loading } from '../../components/Loading.js';
import { useAuth } from '../../lib/auth-context.js';
import { checkoutStore } from '../../lib/checkout-store.js';
import { checkoutCopy, createCheckoutScopeFence } from '../../lib/checkout.js';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/client.js';
import { money } from '../../lib/format.js';

export default function FundsHeld(): React.JSX.Element {
  const router = useRouter();
  const { event: eventId = '', order: orderId = '' } = useLocalSearchParams<{ event?: string; order?: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const scope = `${user?.id ?? ''}:${eventId}:${orderId}`;
  const fence = useRef(createCheckoutScopeFence()).current;
  fence.activate(scope);
  const [displayed, setDisplayed] = useState<{ scope: string; value: CheckoutResponse } | null>(null);
  const outcome = displayed?.scope === scope ? displayed.value : null;
  const setOutcome = useCallback((value: CheckoutResponse) => setDisplayed({ scope, value }), [scope]);
  useEffect(() => { fence.activate(scope); return () => fence.invalidate(); }, [scope, fence]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!user || (!eventId && !orderId)) return;
    const current = fence.capture();
    setBusy(true); setError('');
    try { const result = orderId ? checkoutResponseSchema.parse(await api.get(`/api/payments/orders/${orderId}/checkout`)) : await checkoutStore.refresh(user.id, eventId); if (current()) setOutcome(result); }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : 'Payment status is unavailable.'); }
    finally { if (current()) setBusy(false); }
  }, [user, eventId, orderId, fence, setOutcome]);
  useEffect(() => {
    fence.activate(scope);
    const current = fence.capture();
    setBusy(false); setError('');
    if (!user || (!eventId && !orderId)) return;
    if (orderId) { void refresh(); return () => { fence.invalidate(); }; }
    void checkoutStore.load(user.id, eventId).then((saved) => {
      if (current()) { if (saved?.outcome) setOutcome(saved.outcome); void refresh(); }
    }).catch((e: unknown) => { if (current()) setError(e instanceof Error ? e.message : 'Cannot read saved checkout.'); });
    return () => { fence.invalidate(); };
  }, [user, eventId, orderId, refresh, fence, setOutcome, scope]);
  const resume = async (): Promise<void> => {
    if (!user) return;
    const current = fence.capture();
    setBusy(true); setError('');
    try {
      const saved = await checkoutStore.load(user.id, eventId);
      if (!current()) return;
      if (!saved) throw new Error('No saved checkout.');
      const result = await checkoutStore.submit(user.id, eventId, saved.input);
      if (!current()) return;
      setOutcome(result);
      if (result.state === 'READY' && result.authorizationUrl) await WebBrowser.openBrowserAsync(result.authorizationUrl);
      if (!current()) return;
      const checked = await checkoutStore.refresh(user.id, eventId);
      if (current()) setOutcome(checked);
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : 'Could not resume checkout.'); }
    finally { if (current()) setBusy(false); }
  };
  const done = async (): Promise<void> => {
    if (!user || !outcome) return;
    const current = fence.capture();
    setBusy(true); setError('');
    try {
      if (!orderId) await checkoutStore.acknowledge(user.id, eventId, outcome.orderId);
      if (!current()) return;
      await qc.invalidateQueries({ queryKey: ['savedCheckout'] });
      if (current()) router.dismissAll();
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : 'Could not acknowledge checkout.'); }
    finally { if (current()) setBusy(false); }
  };
  const copy = outcome ? checkoutCopy[outcome.state] : null;
  return <Box flex={1} backgroundColor="bgCanvas">
    <AppBar title="Payment status" showBack inset />
    <Screen scroll>
      <Box style={{ gap: 20, paddingTop: 32 }}>
        {copy ? <>
          <Text variant="h1">{copy.title}</Text>
          <Text variant="bodyLg" color="inkMuted">{copy.body}</Text>
          <Text variant="titleM">{money(outcome!.amountKobo)}</Text>
          <Text variant="bodySm" color="inkMuted">Order {outcome!.orderId}</Text>
        </> : busy ? <Loading /> : <Text variant="body">Your saved checkout will appear here when its status is available.</Text>}
        {error ? <Text variant="bodySm" color="inkMuted">{error}</Text> : null}
        {!orderId && outcome?.state === 'READY' ? <Button label="Resume Paystack" disabled={busy} onPress={() => { void resume(); }} /> : null}
        <Button label={busy ? 'Checking…' : 'Check payment status'} disabled={busy} onPress={() => { void refresh(); }} />
        {outcome && ['PAID', 'EXPIRED', 'REFUNDED'].includes(outcome.state)
          ? <Button label="Done" variant="secondary" disabled={busy} onPress={() => { void done(); }} />
          : <Button label="Leave and check later" variant="secondary" disabled={busy} onPress={() => router.dismissAll()} />}
      </Box>
    </Screen>
  </Box>;
}
