/** React Native's AbortSignal polyfill exposes aborted, not throwIfAborted/reason. */
export function assertNotAborted(signal?: { readonly aborted: boolean }): void {
  if (!signal?.aborted) return;
  const error = new Error('The request was aborted.');
  error.name = 'AbortError';
  throw error;
}
