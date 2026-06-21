/**
 * React Query hooks over the API. Auth mutations skip the bearer token; the
 * verify screen feeds the result into `useAuth().login`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateEventInput, UserRole } from '@hq/shared';
import { api } from './client.js';
import { queryKeys } from './query.js';
import type { EventResource, AuthResult } from './types.js';

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phone: string) =>
      api.post<{ sent: boolean; devCode?: string }>('/auth/otp/request', { phone }, { auth: false }),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (vars: { phone: string; code: string; role?: UserRole }) =>
      api.post<AuthResult>('/auth/otp/verify', vars, { auth: false }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName?: string; bio?: string; yearsExperience?: number }) =>
      api.patch<{ updated: boolean }>('/api/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => api.get<EventResource[]>('/api/events'),
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: queryKeys.event(id),
    queryFn: () => api.get<EventResource>(`/api/events/${id}`),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.post<EventResource>('/api/events', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.events }),
  });
}
