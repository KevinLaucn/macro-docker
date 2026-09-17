import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dssFetch } from './client';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('@core/util/fetchWithToken', () => ({
  fetchWithToken: fetchMock,
}));

beforeEach(() => {
  fetchMock.mockReset();
});

describe('dssFetch upstream error propagation', () => {
  it('propagates 401 UNAUTHORIZED error as Err without suppressing to empty array', async () => {
    fetchMock.mockResolvedValue(
      err([{ code: 'UNAUTHORIZED', status: 401, message: 'Invalid token' }])
    );

    const result = await dssFetch('/items/soup');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error[0].code).toBe('UNAUTHORIZED');
      expect(result.error[0].message).toBe('Invalid token');
    }
  });

  it('propagates 502 BAD_GATEWAY error as Err for soup ast endpoint', async () => {
    fetchMock.mockResolvedValue(
      err([{ code: 'SERVER_ERROR', message: 'Bad Gateway' }])
    );

    const result = await dssFetch('/items/soup/ast/grouped');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error[0].code).toBe('SERVER_ERROR');
      expect(result.error[0].message).toBe('Bad Gateway');
    }
  });

  it('propagates errors for channels and activity endpoints as Err', async () => {
    fetchMock.mockResolvedValue(
      err([
        { code: 'SERVER_ERROR', status: 500, message: 'Internal Server Error' },
      ])
    );

    const channelResult = await dssFetch('/channels');
    expect(channelResult.isErr()).toBe(true);

    const activityResult = await dssFetch('/activity');
    expect(activityResult.isErr()).toBe(true);
  });

  it('returns Ok result when fetchWithToken succeeds', async () => {
    const payload = { items: [{ id: 'doc-1' }] };
    fetchMock.mockResolvedValue(ok(payload));

    const result = await dssFetch<typeof payload>('/items/soup');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(payload);
    }
  });
});
