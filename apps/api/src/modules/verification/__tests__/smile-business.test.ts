import { expect, it, vi } from 'vitest';
import { lookupSmileBusiness } from '../port/smile-business.js';
import { fixtureConfig } from './smile-fixtures.js';

const input = {
  referenceId: 'fixture-reference',
  clientId: 'fixture-client',
  businessType: 'co' as const,
  registrationNumber: 'RC1234567',
};
const result = {
  PartnerParams: { job_id: input.referenceId, user_id: input.clientId, job_type: 7 },
  ResultCode: '1012',
  SmileJobID: 'fixture-job',
  Actions: { Verify_Business: 'Verified' },
  company_information: {
    legal_name: 'Fixture Company',
    registration_number: '1234567',
    status: 'ACTIVE',
  },
};

it('signs the registry request and returns only curated company evidence', async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ ...result, directors: [{ id_number: 'PRIVATE' }] })),
  );
  expect(await lookupSmileBusiness(fixtureConfig, input, fetcher)).toEqual({
    status: 'VERIFIED',
    registeredName: 'Fixture Company',
    providerJobId: 'fixture-job',
    environment: 'sandbox',
  });
  const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(call[0]).toContain('/v1/business_verification');
  expect(JSON.parse(call[1].body as string)).toMatchObject({
    country: 'NG',
    id_type: 'BUSINESS_REGISTRATION',
    business_type: 'co',
    partner_params: { job_type: 7 },
  });
});

it.each([
  { ...result, PartnerParams: { ...result.PartnerParams, user_id: 'another-account' } },
  {
    ...result,
    company_information: { ...result.company_information, registration_number: '7654321' },
  },
  { ...result, company_information: { ...result.company_information, status: 'INACTIVE' } },
  { ...result, ResultCode: '1016' },
  { ...result, Actions: { Verify_Business: 'Not Done' } },
  { success: true },
])('never approves mismatched, inactive, unenabled or malformed evidence', async (body) => {
  const value = await lookupSmileBusiness(
    fixtureConfig,
    input,
    async () => new Response(JSON.stringify(body)),
  );
  expect(value.status).toBe('UNAVAILABLE');
  expect(value.registeredName).toBeNull();
});

it('refreshes an existing job without submitting another paid check', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ job_complete: true, result })));
  expect((await lookupSmileBusiness(fixtureConfig, input, fetcher, true)).status).toBe('VERIFIED');
  expect((fetcher.mock.calls[0] as unknown as [string])[0]).toContain('/v1/job_status');
});
