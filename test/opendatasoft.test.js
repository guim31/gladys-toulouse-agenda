// -----------------------------------------------------------------------------
// The Opendatasoft export client: one request, every record, and an error
// that says why when it fails.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceError, fetchExport } from '../src/sources/opendatasoft.js';

const PORTAL = 'https://public.opendatasoft.com';

function answering(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return typeof response === 'function' ? response() : response;
  };
  return { calls, fetchImpl };
}

test('one request to the export endpoint, with the query and the user agent', async () => {
  const { calls, fetchImpl } = answering(new Response('[{"uid":"1"}]'));
  const records = await fetchExport(
    PORTAL,
    'evenements-publics-openagenda',
    { where: "a >= now() and b = 'x'", order_by: 'uid' },
    { fetchImpl, userAgent: 'gladys-toulouse-agenda/test' },
  );
  assert.deepEqual(records, [{ uid: '1' }]);
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(
    url.origin + url.pathname,
    'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/exports/json',
  );
  assert.equal(url.searchParams.get('where'), "a >= now() and b = 'x'");
  assert.equal(url.searchParams.get('order_by'), 'uid');
  assert.equal(init.headers['user-agent'], 'gladys-toulouse-agenda/test');
  assert.ok(init.signal instanceof AbortSignal);
});

async function failure(response, options = {}) {
  const { fetchImpl } = answering(response);
  try {
    await fetchExport(PORTAL, 'dataset', {}, { fetchImpl, ...options });
  } catch (err) {
    assert.ok(err instanceof SourceError);
    return [err.code, err.message];
  }
  assert.fail('should have failed');
}

test('each failure has its code and a short message naming the portal', async () => {
  assert.deepEqual(await failure(new Response('quota', { status: 429 })), [
    'rate_limited',
    'public.opendatasoft.com: daily quota reached (HTTP 429)',
  ]);
  assert.deepEqual(await failure(new Response('oops', { status: 503 })), [
    'http',
    'public.opendatasoft.com: HTTP 503',
  ]);
  assert.deepEqual(await failure(new Response('<html>')), [
    'invalid',
    'public.opendatasoft.com: the answer is not JSON',
  ]);
  assert.deepEqual(await failure(new Response('{"results":[]}')), [
    'invalid',
    'public.opendatasoft.com: the answer is not a list of records',
  ]);
  assert.deepEqual(await failure(new Response(`[${'1,'.repeat(100)}1]`), { maxBytes: 50 }), [
    'too_large',
    'public.opendatasoft.com: answer larger than 50 bytes',
  ]);
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });
  assert.deepEqual(
    await failure(() => {
      throw timeout;
    }),
    ['timeout', 'public.opendatasoft.com: no answer in time'],
  );
  assert.deepEqual(
    await failure(() => {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }),
    ['network', 'public.opendatasoft.com: ENOTFOUND'],
  );
});
