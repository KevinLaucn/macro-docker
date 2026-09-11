/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { err, ok } from 'neverthrow';

const macroApiToken = vi.fn();

vi.mock('./client', () => ({
  authServiceClient: { macroApiToken },
}));

function jwt(exp: number) {
  const payload = btoa(JSON.stringify({ exp }));
  return `header.${payload}.signature`;
}

describe('getMacroApiToken', () => {
  beforeEach(() => {
    vi.resetModules();
    macroApiToken.mockReset();
  });

  test('reuses an unexpired cached token', async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    macroApiToken.mockResolvedValue(ok({ macro_api_token: token }));
    const { getMacroApiToken } = await import('./fetch');

    await expect(getMacroApiToken()).resolves.toBe(token);
    await expect(getMacroApiToken()).resolves.toBe(token);

    expect(macroApiToken).toHaveBeenCalledTimes(1);
  });

  test('refreshes an expired cached token', async () => {
    const expired = jwt(Math.floor(Date.now() / 1000) - 60);
    const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);
    macroApiToken
      .mockResolvedValueOnce(ok({ macro_api_token: expired }))
      .mockResolvedValueOnce(ok({ macro_api_token: fresh }));
    const { getMacroApiToken } = await import('./fetch');

    await expect(getMacroApiToken()).resolves.toBe(expired);
    await expect(getMacroApiToken()).resolves.toBe(fresh);

    expect(macroApiToken).toHaveBeenCalledTimes(2);
  });

  test('does not permanently cache a rejected token request', async () => {
    const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);
    macroApiToken
      .mockResolvedValueOnce(
        err([{ code: 'UNAUTHORIZED' as const, message: 'Unauthorized access' }])
      )
      .mockResolvedValueOnce(ok({ macro_api_token: fresh }));
    const { getMacroApiToken } = await import('./fetch');

    await expect(getMacroApiToken()).rejects.toBeDefined();
    await expect(getMacroApiToken()).resolves.toBe(fresh);

    expect(macroApiToken).toHaveBeenCalledTimes(2);
  });
});
