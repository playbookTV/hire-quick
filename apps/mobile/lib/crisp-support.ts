import type { Me } from './types.js';
import type * as CrispSDK from 'crisp-sdk-react-native';

type Crisp = Pick<
  typeof CrispSDK,
  | 'configure'
  | 'setTokenId'
  | 'resetSession'
  | 'setUserNickname'
  | 'setUserPhone'
  | 'setSessionString'
  | 'openChat'
  | 'setShouldPromptForNotificationPermission'
>;

/** Small adapter around Crisp. Auth changes fence any pending chat launch. */
export function createCrispSupport(deps: {
  websiteId: string;
  load(): Promise<Crisp>;
  tokenFor(userId: string): Promise<string>;
}) {
  let user: Me | null = null;
  let generation = 0;
  let sdk: Crisp | undefined;
  let identified = false;
  let opening: Promise<void> | undefined;

  return {
    setUser(this: void, next: Me | null): void {
      if (next?.id !== user?.id) {
        generation += 1;
        identified = false;
        // Clear the native session immediately on sign-out/account switch.
        // If a native call fails, open() must reset successfully before showing it.
        try {
          sdk?.setTokenId(null);
          sdk?.resetSession();
        } catch {
          /* Retry the reset before the next open. */
        }
      }
      user = next;
    },
    open(this: void, context: string): Promise<void> {
      if (opening) return opening;
      const run = generation;
      const currentUser = user;
      opening = (async () => {
        if (!sdk) {
          const loaded = await deps.load();
          loaded.configure(deps.websiteId);
          // Push delivery needs provider credentials; don't request permission prematurely.
          loaded.setShouldPromptForNotificationPermission(false);
          sdk = loaded;
        }
        if (run !== generation) return;
        if (!identified) {
          // Do not use a public account ID as a conversation access token.
          const token = currentUser ? await deps.tokenFor(currentUser.id) : null;
          if (run !== generation) return;
          sdk.setTokenId(null);
          sdk.resetSession();
          sdk.setTokenId(token);
          identified = true;
        }
        if (currentUser) {
          sdk.setUserNickname(
            currentUser.client?.displayName || currentUser.usher?.displayName || 'HireQuick user',
          );
          sdk.setUserPhone(currentUser.phone);
          sdk.setSessionString('hirequick_user_id', currentUser.id);
          sdk.setSessionString('hirequick_role', currentUser.role);
        }
        // Context is visible to the support operator; no message is sent for the user.
        sdk.setSessionString('support_context', context);
        sdk.openChat();
      })().finally(() => {
        opening = undefined;
      });
      return opening;
    },
  };
}
