/**
 * Haptics — thin, fire-and-forget wrappers over expo-haptics so screens can add
 * tactile feedback without importing/`await`ing the SDK everywhere. All calls
 * swallow errors (haptics are best-effort and unavailable on some devices /
 * simulators). Use `selection` for taps, `impact` for toggles/steps, and the
 * notification helpers for terminal success / warning / error moments.
 */
import * as Haptics from 'expo-haptics';

export type HapticImpact = 'light' | 'medium' | 'heavy';

const IMPACT: Record<HapticImpact, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export function hapticSelection(): void {
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticImpact(style: HapticImpact = 'light'): void {
  void Haptics.impactAsync(IMPACT[style]).catch(() => {});
}

export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticError(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
