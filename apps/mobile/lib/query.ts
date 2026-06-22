/**
 * TanStack Query client + key factory. We don't retry 4xx (client errors won't
 * fix themselves); transient 5xx/network errors retry a couple of times.
 */
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export const queryKeys = {
  me: ['me'] as const,
  events: ['events'] as const,
  event: (id: string) => ['events', id] as const,
  bookings: ['bookings'] as const,
  booking: (id: string) => ['bookings', id] as const,
  bookingMessages: (id: string) => ['bookings', id, 'messages'] as const,
  applications: (eventId: string) => ['events', eventId, 'applications'] as const,
  myApplications: ['me', 'applications'] as const,
  savedJobs: ['me', 'saved-jobs'] as const,
  banks: ['banks'] as const,
  ushers: (filters?: Record<string, unknown>) => ['ushers', filters ?? {}] as const,
  usher: (id: string) => ['ushers', id] as const,
  usherReviews: (id: string) => ['ushers', id, 'reviews'] as const,
  wallet: ['wallet'] as const,
  walletActivity: ['wallet', 'activity'] as const,
  bankAccounts: ['bank-accounts'] as const,
  availability: (range?: string) => ['availability', range ?? 'all'] as const,
};
