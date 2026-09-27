/** Delivery reports are advisory telemetry, never proof of phone ownership. */
import { json, Router } from 'express';
import { z } from 'zod';
import { logger } from '../../logger.js';

const reportSchema = z.object({
  status: z.enum(['DELIVRD', 'UNDELIVRD', 'EXPIRED', 'REJECTD', 'UNKNOWN']),
  data: z.object({ code: z.enum(['000', '99', '100', '101', '102', '150']) }),
});
const statusForCode = {
  '000': 'DELIVRD',
  '99': 'UNDELIVRD',
  '100': 'UNDELIVRD',
  '101': 'EXPIRED',
  '102': 'REJECTD',
  '150': 'UNKNOWN',
} as const;

export function kudiSmsWebhookRouter(): Router {
  const router = Router();
  router.post('/', json({ limit: '16kb' }), (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success || statusForCode[parsed.data.data.code] !== parsed.data.status) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_WEBHOOK', message: 'Invalid delivery report' } });
      return;
    }
    // KudiSMS's public callback contract documents no signature. Keep only
    // allowlisted status/code telemetry, explicitly marked unverified. Do not
    // persist the raw report, recipient, description or customer reference.
    // Duplicate callbacks may produce duplicate logs but no state changes/sends.
    logger.info(
      {
        provider: 'kudisms',
        verified: false,
        status: parsed.data.status,
        code: parsed.data.data.code,
      },
      'SMS delivery report',
    );
    res.status(200).json({ ok: true });
  });
  return router;
}
