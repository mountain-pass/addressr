import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('integration-setup', () => {
  const originalKey = process.env.ADDRESSR_RAPIDAPI_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ADDRESSR_RAPIDAPI_KEY;
    } else {
      process.env.ADDRESSR_RAPIDAPI_KEY = originalKey;
    }
  });

  it('throws loudly on import when ADDRESSR_RAPIDAPI_KEY is unset', async () => {
    delete process.env.ADDRESSR_RAPIDAPI_KEY;
    await expect(import('./integration-setup')).rejects.toThrow(/ADDRESSR_RAPIDAPI_KEY is required/);
  });

  it('exposes createIntegrationClient() that returns an AddressrClient with retries disabled', async () => {
    process.env.ADDRESSR_RAPIDAPI_KEY = 'test-key';
    const mod = await import('./integration-setup');
    expect(typeof mod.createIntegrationClient).toBe('function');
    const client = mod.createIntegrationClient();
    expect(client).toBeDefined();
    expect(typeof client.searchAddresses).toBe('function');
    expect(typeof client.fetchNextPage).toBe('function');
    expect(typeof client.getAddressDetail).toBe('function');
    expect(typeof client.prefetch).toBe('function');
  });
});
