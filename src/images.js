// -----------------------------------------------------------------------------
// Widget thumbnails. The dashboard never loads a third-party picture: Gladys
// asks the container for the bytes of an image key, and the container
// downloads the OpenAgenda thumbnail (200 × 200 JPEG, about 10 KB). Only the
// OpenAgenda image hosts are reached, only for keys of events in the catalog.
// -----------------------------------------------------------------------------

const IMAGE_HOSTS = new Set(['img.openagenda.com', 'cdn.openagenda.com', 'cibul.s3.amazonaws.com']);
const MAX_BYTES = 300 * 1024;
const TIMEOUT_MS = 10_000;
const CACHE_SIZE = 60;

/** PNG, JPEG or WebP, by their first bytes: what Gladys accepts. */
export function imageFormat(bytes) {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** True for an https address on an OpenAgenda image host. */
export function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && IMAGE_HOSTS.has(url.hostname) && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

export class ImageCache {
  /**
   * @param {object} [deps]
   * @param {typeof fetch} [deps.fetchImpl]
   * @param {string} [deps.userAgent]
   */
  constructor(deps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.userAgent = deps.userAgent;
    /** @type {Map<string, Promise<string>>} base64 by address, oldest first */
    this.entries = new Map();
  }

  /**
   * The raw base64 of the picture at `url`. Concurrent requests for one
   * address share one download; a failed download is not kept.
   */
  get(url) {
    if (!isAllowedImageUrl(url)) {
      return Promise.reject(new Error('This picture is not served by OpenAgenda'));
    }
    const cached = this.entries.get(url);
    if (cached) {
      this.entries.delete(url);
      this.entries.set(url, cached);
      return cached;
    }
    const pending = this.download(url);
    this.entries.set(url, pending);
    pending.catch(() => this.entries.delete(url));
    while (this.entries.size > CACHE_SIZE) {
      this.entries.delete(this.entries.keys().next().value);
    }
    return pending;
  }

  async download(url) {
    const headers = this.userAgent ? { 'user-agent': this.userAgent } : {};
    let response;
    try {
      response = await this.fetchImpl(url, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(
        `Picture unavailable (${err?.name === 'TimeoutError' ? 'timeout' : 'network'})`,
        { cause: err },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Picture unavailable (HTTP ${response.status})`);
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Picture too large');
    }
    // Counted while it arrives: a missing Content-Length is no way around the cap.
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of response.body ?? []) {
        size += chunk.byteLength;
        if (size > MAX_BYTES) {
          throw new Error('Picture too large');
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      throw err.message === 'Picture too large'
        ? err
        : new Error('Picture unavailable (network)', { cause: err });
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length === 0) {
      throw new Error('Empty picture');
    }
    if (!imageFormat(bytes)) {
      throw new Error('Not a PNG, JPEG or WebP picture');
    }
    return bytes.toString('base64');
  }
}
