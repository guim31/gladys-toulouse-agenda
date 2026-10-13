// -----------------------------------------------------------------------------
// The Opendatasoft Explore API v2.1, the portal software behind both sources
// (public.opendatasoft.com for OpenAgenda, data.toulouse-metropole.fr for So
// Toulouse). Free, no key. The `exports/json` endpoint returns every matching
// record in one response (the `records` endpoint stops at 100 per page), so a
// refresh costs one request per source.
// -----------------------------------------------------------------------------

/** Why a download failed, in words a log line and a report can show. */
export class SourceError extends Error {
  /**
   * @param {'http'|'rate_limited'|'timeout'|'network'|'invalid'|'too_large'} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status) {
    super(message);
    this.name = 'SourceError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;
// The OpenAgenda export around Toulouse weighs about 3 MB: room for growth,
// not for a runaway response in a 256 MB sandbox.
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Downloads every record of a dataset matching `params`.
 * @param {string} portal e.g. 'https://public.opendatasoft.com'
 * @param {string} dataset dataset id
 * @param {Record<string, string>} params ODSQL: select, where, order_by…
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.userAgent]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @returns {Promise<object[]>}
 */
export async function fetchExport(portal, dataset, params, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(
    `/api/explore/v2.1/catalog/datasets/${encodeURIComponent(dataset)}/exports/json`,
    portal,
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const headers = { accept: 'application/json' };
  if (options.userAgent) {
    headers['user-agent'] = options.userAgent;
  }
  let response;
  try {
    response = await fetchImpl(url.href, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new SourceError('timeout', `${url.host}: no answer in time`);
    }
    throw new SourceError('network', `${url.host}: ${err?.cause?.code ?? err?.message ?? err}`);
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    throw new SourceError('rate_limited', `${url.host}: daily quota reached (HTTP 429)`, 429);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new SourceError('http', `${url.host}: HTTP ${response.status}`, response.status);
  }
  const text = await readText(response, options.maxBytes ?? DEFAULT_MAX_BYTES, url.host);
  let records;
  try {
    records = JSON.parse(text);
  } catch {
    throw new SourceError('invalid', `${url.host}: the answer is not JSON`);
  }
  if (!Array.isArray(records)) {
    throw new SourceError('invalid', `${url.host}: the answer is not a list of records`);
  }
  return records;
}

/** The body as text, refused past `maxBytes` (counted while it arrives). */
async function readText(response, maxBytes, host) {
  if (!response.body) {
    return response.text();
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxBytes) {
        throw new SourceError('too_large', `${host}: answer larger than ${maxBytes} bytes`);
      }
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof SourceError) {
      throw err;
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new SourceError('timeout', `${host}: no answer in time`);
    }
    throw new SourceError('network', `${host}: ${err?.cause?.code ?? err?.message ?? err}`);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}
