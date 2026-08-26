import { createAddressrClient, type AddressrClient } from '../src';

if (!process.env.ADDRESSR_RAPIDAPI_KEY) {
  throw new Error(
    'ADDRESSR_RAPIDAPI_KEY is required for integration tests. ' +
      'Set it locally via `op inject -i .env.tpl -o .env && export $(cat .env | xargs)`, ' +
      'or via GitHub Actions secrets in CI.',
  );
}

export function createIntegrationClient(): AddressrClient {
  return createAddressrClient({
    apiKey: process.env.ADDRESSR_RAPIDAPI_KEY,
    retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
  });
}
