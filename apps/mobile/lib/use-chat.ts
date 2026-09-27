import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { api } from './client.js';
import { sessionStore } from './tokens.js';
import { checkoutStorage } from './checkout-storage.js';
import { createChatController, type MessagePage } from './chat.js';
import type { Message } from './types.js';

const storage = checkoutStorage(SecureStore, randomUUID, 'hq.chat');

export function useBookingChat(bookingId: string, userId: string) {
  const controller = useMemo(() => {
    const generation = sessionStore.generation();
    return createChatController({
      bookingId,
      userId,
      storage,
      makeId: randomUUID,
      isCurrent: () => sessionStore.isCurrent(generation),
      page: (query, signal) =>
        api.get<MessagePage>(`/api/bookings/${bookingId}/messages/page?${query}`, { signal }),
      send: ({ clientMessageId, content, contentType }, signal) =>
        api.post<Message>(
          `/api/bookings/${bookingId}/messages`,
          { clientMessageId, content, contentType },
          { signal },
        ),
    });
  }, [bookingId, userId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useFocusEffect(
    useCallback(() => {
      const sync = () => {
        if (AppState.currentState === 'active') void controller.sync();
      };
      sync();
      const timer = setInterval(sync, 5000);
      const subscription = AppState.addEventListener('change', sync);
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, [controller]),
  );
  // React Strict Mode replays effects without recreating memoized state.
  const disposal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(disposal.current);
    return () => {
      disposal.current = setTimeout(() => controller.dispose(), 0);
    };
  }, [controller]);
  return { ...state, controller };
}
