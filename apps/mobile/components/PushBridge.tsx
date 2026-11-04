import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../lib/auth-context.js';
import { api } from '../lib/client.js';
import { pushConsentState, useConsents } from '../lib/hooks.js';
import { queryKeys } from '../lib/query.js';
import {
  configurePush,
  detachThisDevice,
  keepPushRegistered,
  resumePushCleanup,
  setPushSession,
} from '../lib/push.js';
import { canOpenPushTarget, parsePushData, pushAction, pushRoute } from '../lib/push-routing.js';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Push lifecycle for the signed-in account: keeps this device registered while
 * push is allowed, refreshes the inbox when a push lands in the foreground, and
 * opens the screen behind a tapped notification (including the one that
 * launched the app) from any screen once onboarding has finished.
 * Whenever no one is signed in (an expired session, including one found at
 * launch) it detaches the phone locally, and it keeps retrying a sign-out
 * cleanup that could not finish (e.g. offline) at launch, on returning to the
 * foreground and every minute. Phones only: expo-notifications' tap hook throws
 * on web, so nothing mounts there.
 */
export function PushBridge(): React.JSX.Element | null {
  return native ? <NativePushBridge /> : null;
}

function NativePushBridge(): null {
  const { status, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const qc = useQueryClient();
  const role = user?.role;
  const signedIn = status === 'authed' && (role === 'USHER' || role === 'CLIENT');
  const consents = useConsents(signedIn);
  const pushAllowed = pushConsentState(consents.data) === 'granted';
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const ready = signedIn && canOpenPushTarget(user, segments[0]);

  useEffect(() => {
    void configurePush().catch(() => undefined);
    void resumePushCleanup();
    const retry = setInterval(() => void resumePushCleanup(), 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resumePushCleanup();
    });
    return () => {
      clearInterval(retry);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    setPushSession(signedIn);
    // Signed out by any route: a sign-out already ran this with its session;
    // an expired session, including one found at launch, reaches here directly.
    if (status === 'guest') void detachThisDevice({ session: false });
  }, [signedIn, status]);

  useEffect(() => {
    if (!signedIn || !pushAllowed) return;
    const keeping = keepPushRegistered();
    return () => keeping.remove();
  }, [signedIn, pushAllowed, user?.id]);

  useEffect(() => {
    if (!signedIn) return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    });
    return () => subscription.remove();
  }, [signedIn, qc]);

  useEffect(() => {
    if (!ready || !response) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    const data = parsePushData(response.notification.request.content.data);
    if (!data) return;
    void api
      .post(`/api/me/notification-dispatches/${data.dispatchId}/opened`, {
        action: pushAction(response.actionIdentifier),
      })
      .catch(() => undefined);
    void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    const route = pushRoute(data, role);
    if (route) router.push(route);
  }, [ready, response, role, router, qc]);

  return null;
}
