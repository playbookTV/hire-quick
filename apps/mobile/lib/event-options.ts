/**
 * Shared option lists for the create/edit event forms so the two screens never
 * drift. Categories are free-text on the server; hairstyle + requirements live in
 * the event `preferences` JSON. Time options carry 24h values with friendly 12h
 * labels (clients read wall-clock time, not 24h — feedback: "there's no 4 p.m.").
 */
import { NIGERIAN_STATES } from '@hq/shared';
import { to12h } from './format.js';

export const STATE_OPTIONS: { value: string; label: string }[] = NIGERIAN_STATES.map((s) => ({ value: s, label: s }));

export const EVENT_CATEGORIES: string[] = [
  'Wedding',
  'Corporate event',
  'Brand activation',
  'Concert',
  'Conference',
  'Party',
  'Birthday',
  'Product launch',
  'Religious event',
  'Other',
];

// "" = no preference; clients can add finer detail in Extra requirements (UXRD).
export const HAIRSTYLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No preference' },
  { value: 'Ponytail', label: 'Ponytail' },
  { value: 'Bob wig', label: 'Bob wig' },
  { value: 'Packable hair', label: 'Packable hair' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 06:00–23:30 in 30-min steps; value "HH:MM" (24h), label "H:MM AM/PM". */
export const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let h = 6; h <= 23; h++) for (const m of [0, 30]) out.push({ value: `${pad(h)}:${pad(m)}`, label: to12h(`${pad(h)}:${pad(m)}`) });
  return out;
})();
