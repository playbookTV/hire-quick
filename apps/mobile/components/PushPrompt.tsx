import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box } from '../theme/restyle.js';
import { Banner } from './Banner.js';
import { Button } from './Button.js';
import { pushConsentState, useConsents } from '../lib/hooks.js';
import { queryKeys } from '../lib/query.js';
import {
  enablePush,
  pushPermission,
  pushUnsupported,
  readPromptDismissedAt,
  snoozePushPrompt,
} from '../lib/push.js';
import { shouldShowPushPrompt } from '../lib/push-routing.js';
import { useToast } from '../lib/toast.js';
import { userMessage } from '../lib/api-error.js';

const COPY = {
  USHER: 'Hear the moment you’re booked, invited or paid, and when a booking changes.',
  CLIENT: 'Hear when ushers apply, accept, arrive or cancel, and when payments go through.',
} as const;

/** Explains push before the OS prompt; "Not now" hides it for a week. */
export function PushPrompt({ role }: { role: 'USHER' | 'CLIENT' }): React.JSX.Element | null {
  const qc = useQueryClient();
  const toast = useToast();
  const consents = useConsents(!pushUnsupported());
  const consent = pushConsentState(consents.data);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pushUnsupported() || !consents.isSuccess) return;
    let active = true;
    void Promise.all([pushPermission(), readPromptDismissedAt()])
      .then(([permission, dismissedAt]) => {
        if (active)
          setVisible(shouldShowPushPrompt({ permission, consent, dismissedAt, now: Date.now() }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [consent, consents.isSuccess]);

  if (!visible) return null;

  const turnOn = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === 'denied')
        toast.error('Allow notifications for HireQuick in your phone settings.', 'Notifications are off');
      else if (result === 'unavailable')
        toast.error('This device can’t receive notifications yet.', 'Notifications unavailable');
      else toast.success('Notifications are on.');
      setVisible(false);
    } catch (error) {
      toast.error(userMessage(error));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: queryKeys.consents });
    }
  };

  return (
    <Box gap="300">
      <Banner tone="info" title="Turn on notifications" message={COPY[role]} />
      <Box flexDirection="row" style={{ gap: 12 }}>
        <Box flex={1}>
          <Button label="Turn on" loading={busy} disabled={busy} onPress={() => void turnOn()} />
        </Box>
        <Box flex={1}>
          <Button
            label="Not now"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setVisible(false);
              void snoozePushPrompt();
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
