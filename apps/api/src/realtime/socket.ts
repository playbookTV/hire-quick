/**
 * @deprecated The realtime layer now lives in ./gateway.ts (a `RealtimeGateway`
 * that does chat AND lifecycle pushes). This thin re-export keeps the old
 * `attachRealtime` import working.
 */
export { attachRealtime } from './gateway.js';
