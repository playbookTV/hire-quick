/**
 * Toast — app-wide non-blocking feedback. Wrap the tree in <ToastProvider> (done
 * in app/_layout.tsx) and call `useToast()` anywhere to fire success/error/info
 * toasts. One toast shows at a time; a new one replaces the current. The matching
 * haptic fires automatically, so callers should NOT also call haptic* themselves.
 * Use this for success/error/validation feedback — keep Alert.alert for blocking
 * Yes/Cancel confirmations of destructive actions.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { ToastHost, type ToastItem, type ToastTone } from '../components/Toast.js';
import { hapticSuccess, hapticError, hapticSelection } from './haptics.js';

interface ToastApi {
  show: (tone: ToastTone, message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const DURATION_MS = 3200;

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const idRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setToast(null);
  }, [clear]);

  const show = useCallback(
    (tone: ToastTone, message: string, title?: string) => {
      idRef.current += 1;
      setToast({ id: idRef.current, tone, message, title });
      // Announce for screen readers (iOS doesn't reliably speak a freshly-mounted alert) — S13.
      AccessibilityInfo.announceForAccessibility(title ? `${title}. ${message}` : message);
      if (tone === 'success') hapticSuccess();
      else if (tone === 'error') hapticError();
      else hapticSelection();
      clear();
      timer.current = setTimeout(() => setToast(null), DURATION_MS);
    },
    [clear],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, t) => show('success', m, t),
      error: (m, t) => show('error', m, t),
      info: (m, t) => show('info', m, t),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
