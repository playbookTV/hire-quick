import { describe, expect, it, vi } from 'vitest';
import { createCrispSupport } from '../crisp-support.js';
import type { Me } from '../types.js';

const user = (id: string): Me => ({
  id,
  role: 'CLIENT',
  phone: '+2348000000000',
  email: null,
  status: 'ACTIVE',
  client: null,
  usher: null,
});
function setup(tokenFor = vi.fn(async (id: string) => `private-${id}`)) {
  const sdk = {
    configure: vi.fn(),
    setTokenId: vi.fn(),
    resetSession: vi.fn(),
    setUserNickname: vi.fn(),
    setUserPhone: vi.fn(),
    setSessionString: vi.fn(),
    openChat: vi.fn(),
    setShouldPromptForNotificationPermission: vi.fn(),
  };
  const load = vi.fn(async () => sdk);
  return {
    sdk,
    load,
    tokenFor,
    chat: createCrispSupport({ websiteId: 'workspace', load, tokenFor }),
  };
}

describe('Crisp support integration', () => {
  it('opens the configured inbox with user and booking context, reusing the session', async () => {
    const { chat, sdk, tokenFor, load } = setup();
    chat.setUser(user('a'));
    await chat.open('Help with booking 123');
    expect(sdk.configure).toHaveBeenCalledWith('workspace');
    expect(sdk.setTokenId).toHaveBeenLastCalledWith('private-a');
    expect(sdk.setSessionString).toHaveBeenCalledWith('hirequick_user_id', 'a');
    expect(sdk.setSessionString).toHaveBeenCalledWith('support_context', 'Help with booking 123');
    expect(sdk.openChat).toHaveBeenCalledOnce();
    await chat.open('Help with withdrawal 456');
    expect(tokenFor).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(sdk.resetSession).toHaveBeenCalledOnce();
  });
  it('clears the previous identity on logout and switches accounts safely', async () => {
    const { chat, sdk } = setup();
    chat.setUser(user('a'));
    await chat.open('Account A');
    sdk.resetSession.mockClear();
    chat.setUser(null);
    expect(sdk.setTokenId).toHaveBeenLastCalledWith(null);
    expect(sdk.resetSession).toHaveBeenCalledOnce();
    chat.setUser(user('b'));
    await chat.open('Account B');
    expect(sdk.setTokenId).toHaveBeenLastCalledWith('private-b');
  });
  it('never opens a stale conversation when logout happens during secure storage access', async () => {
    let resolve!: (value: string) => void;
    const { chat, sdk } = setup(
      vi.fn(
        () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      ),
    );
    chat.setUser(user('a'));
    const pending = chat.open('Old account');
    await Promise.resolve();
    chat.setUser(null);
    resolve('private-a');
    await pending;
    expect(sdk.openChat).not.toHaveBeenCalled();
    expect(sdk.setTokenId).not.toHaveBeenCalledWith('private-a');
  });
  it('allows restricted users to ask for help without a profile or previous identity', async () => {
    const { chat, sdk, tokenFor } = setup();
    await chat.open('My account is restricted');
    expect(tokenFor).not.toHaveBeenCalled();
    expect(sdk.setTokenId).toHaveBeenLastCalledWith(null);
    expect(sdk.resetSession).toHaveBeenCalledOnce();
    expect(sdk.setUserPhone).not.toHaveBeenCalled();
    expect(sdk.openChat).toHaveBeenCalledOnce();
  });
  it('deduplicates rapid taps and allows a retry after native load fails', async () => {
    const { chat, sdk, load } = setup();
    load.mockRejectedValueOnce(new Error('Native module unavailable'));
    const first = chat.open('Help');
    expect(chat.open('Help')).toBe(first);
    await expect(first).rejects.toThrow('Native module unavailable');
    await chat.open('Retry');
    expect(sdk.openChat).toHaveBeenCalledOnce();
  });
  it('fails closed when private session storage fails', async () => {
    const { chat, sdk } = setup(
      vi.fn(async () => {
        throw new Error('Keychain unavailable');
      }),
    );
    chat.setUser(user('a'));
    await expect(chat.open('Help')).rejects.toThrow('Keychain unavailable');
    expect(sdk.openChat).not.toHaveBeenCalled();
  });
});
