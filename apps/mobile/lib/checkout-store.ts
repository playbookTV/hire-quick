import * as SecureStore from 'expo-secure-store';
import { api, newIdempotencyKey } from './client.js';
import { checkoutStorage } from './checkout-storage.js';
import { createCheckoutController } from './checkout.js';

const storage = checkoutStorage(SecureStore, newIdempotencyKey);
export const checkoutStore = createCheckoutController(storage, {
  confirm: (eventId, input, idempotencyKey) => api.post(`/api/events/${eventId}/confirm`, input, { idempotencyKey }),
  resume: (orderId) => api.post(`/api/payments/orders/${orderId}/checkout/resume`),
  status: (orderId) => api.get(`/api/payments/orders/${orderId}/checkout`),
}, newIdempotencyKey);
