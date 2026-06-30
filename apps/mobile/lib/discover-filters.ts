/**
 * Discover filter state, shared between the Discover feed and the Filters modal.
 *
 * expo-router renders the modal as a separate screen, so we can't prop-drill the
 * selection across the boundary. A tiny `useSyncExternalStore` store lets the
 * modal commit a selection and the feed re-query against it — no extra deps.
 *
 * All fields here are discovery sugar (rating/location/availability/rate ceiling).
 * `maxRate` is a kobo ceiling on the usher's indicative day rate; it never feeds
 * escrow/order math (that stays Event.budgetPerHead, TRD §6).
 */
import { useSyncExternalStore } from 'react';

export interface DiscoverFilters {
  /** Minimum average rating (e.g. 4, 4.5). */
  minRating?: number;
  /** City/area contains-match (e.g. "Lekki"). */
  location?: string;
  /** Kobo ceiling on the usher's indicative day rate. */
  maxRate?: number;
  /** ISO date (YYYY-MM-DD) the usher must be marked AVAILABLE on. */
  availableOn?: string;
}

const EMPTY: DiscoverFilters = {};
let state: DiscoverFilters = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function setDiscoverFilters(next: DiscoverFilters): void {
  state = next;
  emit();
}

export function getDiscoverFilters(): DiscoverFilters {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribe a component to the current discover filters. */
export function useDiscoverFilters(): DiscoverFilters {
  return useSyncExternalStore(subscribe, getDiscoverFilters, getDiscoverFilters);
}

/** Map filter state to the query params `GET /api/ushers` accepts (undefined → omitted by `qs`). */
export function toUsherQuery(f: DiscoverFilters): Record<string, unknown> {
  return {
    minRating: f.minRating,
    location: f.location,
    maxRate: f.maxRate,
    availableOn: f.availableOn,
  };
}

/** Count of active (non-empty) filter facets — drives the badge on the Discover filter button. */
export function activeFilterCount(f: DiscoverFilters): number {
  return [f.minRating, f.location, f.maxRate, f.availableOn].filter((v) => v !== undefined).length;
}

/** Today's date as YYYY-MM-DD (local), for the "Available today" facet. */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
