/** PushBridge mounts nothing on web, where expo-notifications' tap hook throws. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'web' }));
vi.mock('react-native', () => ({ Platform: platform, AppState: { addEventListener: vi.fn() } }));
vi.mock('expo-router', () => ({ useRouter: vi.fn(), useSegments: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: vi.fn() }));
vi.mock('expo-notifications', () => ({
  useLastNotificationResponse: vi.fn(() => {
    throw new Error('UnavailabilityError: getLastNotificationResponse');
  }),
}));
vi.mock('../auth-context.js', () => ({ useAuth: vi.fn() }));
vi.mock('../client.js', () => ({ api: { post: vi.fn() } }));
vi.mock('../hooks.js', () => ({ useConsents: vi.fn(), pushConsentState: vi.fn() }));
vi.mock('../query.js', () => ({ queryKeys: {} }));
vi.mock('../push.js', () => ({}));

beforeEach(() => {
  vi.resetModules();
});

describe('PushBridge', () => {
  it('renders nothing on web, so the tap hook never runs there', async () => {
    platform.OS = 'web';
    const { PushBridge } = await import('../../components/PushBridge.js');
    expect(PushBridge()).toBeNull();
  });

  it('mounts the push lifecycle on phones', async () => {
    platform.OS = 'android';
    const { PushBridge } = await import('../../components/PushBridge.js');
    expect(PushBridge()).not.toBeNull();
  });
});
