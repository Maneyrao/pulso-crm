import { describe, expect, it, vi } from 'vitest';
import { HttpSourceAfisMatcher } from './biometric-matcher.js';

describe('HttpSourceAfisMatcher', () => {
  it('sends base64 templates to the isolated matcher and returns scores', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            scores: [{ credentialId: 'credential-1', memberId: 'member-1', score: 63.4 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const matcher = new HttpSourceAfisMatcher('http://matcher.internal', 'shared-secret', fetcher);

    const scores = await matcher.match(Buffer.from([1, 2, 3]), [
      {
        credentialId: 'credential-1',
        memberId: 'member-1',
        template: Buffer.from([4, 5, 6]),
      },
    ]);

    expect(scores).toEqual([{ credentialId: 'credential-1', memberId: 'member-1', score: 63.4 }]);
    expect(fetcher).toHaveBeenCalledWith(
      'http://matcher.internal/match',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer shared-secret' }),
      }),
    );
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      probe: 'AQID',
      candidates: [
        {
          credentialId: 'credential-1',
          memberId: 'member-1',
          template: 'BAUG',
        },
      ],
    });
  });

  it('fails closed when the matcher is unavailable', async () => {
    const matcher = new HttpSourceAfisMatcher(
      'http://matcher.internal',
      'shared-secret',
      async () => new Response('unavailable', { status: 503 }),
    );

    await expect(
      matcher.match(Buffer.from([1]), [
        { credentialId: 'credential-1', memberId: 'member-1', template: Buffer.from([2]) },
      ]),
    ).rejects.toThrow(/503/);
  });
});
