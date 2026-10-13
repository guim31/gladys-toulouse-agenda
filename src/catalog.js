// -----------------------------------------------------------------------------
// The catalog: every event to come around Toulouse, from both sources, kept in
// memory and in /data (so a restart shows the widget at once and does not
// announce the whole agenda again).
//
// "New" means "never seen before by this installation": the first download
// of a source (or after a change of the search radius, which brings in a
// whole new area) only takes note of what exists, silently. Then every
// download compares the ids with the ones already seen.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { fetchOpenAgenda } from './sources/openagenda.js';
import { fetchSoToulouse } from './sources/sotoulouse.js';
import { searchText, upcomingOccurrences } from './events.js';
import { containsWords, firstMatch, normalize } from './text.js';
import { DAY_MS, localParts } from './time.js';
import { isAllowedImageUrl } from './images.js';

const logger = createLogger({ name: 'catalog' });

export const SOURCES = ['openagenda', 'so_toulouse'];

/** At most this many scene events per download: a whole festival announced at once stays readable. */
export const MAX_ANNOUNCED = 20;
/** An id not seen for this long is forgotten. */
const SEEN_TTL_MS = 60 * DAY_MS;

const ID_PREFIXES = { openagenda: 'oa:', so_toulouse: 'st:' };

const FETCHERS = { openagenda: fetchOpenAgenda, so_toulouse: fetchSoToulouse };

/** The image key of a thumbnail address: changes when the address does. */
export function imageKey(url) {
  return `t-${createHash('sha1').update(url).digest('hex').slice(0, 24)}`;
}

export class Catalog {
  /**
   * @param {object} deps
   * @param {ReturnType<import('./store.js').createStore>} deps.store
   * @param {() => ReturnType<import('./config.js').normalizeConfig>} deps.getConfig
   * @param {() => number} deps.now
   * @param {typeof fetch} [deps.fetchImpl]
   * @param {string} [deps.userAgent]
   * @param {Record<string, Function>} [deps.fetchers] test seam
   */
  constructor(deps) {
    this.store = deps.store;
    this.getConfig = deps.getConfig;
    this.now = deps.now;
    this.fetchImpl = deps.fetchImpl;
    this.userAgent = deps.userAgent;
    this.fetchers = deps.fetchers ?? FETCHERS;
    /** @type {Record<string, object[]>} the last good list of each source */
    this.bySource = { openagenda: [], so_toulouse: [] };
    this.fetchedAt = null;
    /** @type {Record<string, string>} the last error of each source, if any */
    this.errors = {};
    /** True while the last download failed for every source. */
    this.failing = false;
    this.visible = [];
    this.thumbnails = new Map();
    this.running = null;
  }

  /** Reads what /data remembers: the events of the last download. */
  load() {
    const saved = this.store.get('events');
    if (saved && typeof saved === 'object') {
      for (const source of SOURCES) {
        if (Array.isArray(saved[source])) {
          this.bySource[source] = saved[source];
        }
      }
    }
    const fetchedAt = this.store.get('fetchedAt');
    this.fetchedAt = Number.isFinite(fetchedAt) ? fetchedAt : null;
    this.rebuild();
  }

  /** True when there is something to show (downloaded now or before a restart). */
  get ready() {
    return this.fetchedAt !== null;
  }

  /**
   * Downloads both sources. One failing keeps its previous events; both
   * failing throws (the previous events stay). Concurrent calls share one
   * download.
   * @returns {Promise<{ total: number, counts: Record<string, number>, errors: Record<string, string>, announced: object[], watched: Record<string, number> }>}
   */
  refresh() {
    const radius = this.getConfig().radius_km;
    if (this.running && this.runningRadius === radius) {
      return this.running;
    }
    // Nothing running, or a download of another area (the radius changed
    // meanwhile): a new download, after the one in progress.
    const after = this.running ? this.running.catch(() => {}) : Promise.resolve();
    const current = after.then(() => this.download());
    this.running = current;
    this.runningRadius = radius;
    current
      .finally(() => {
        if (this.running === current) {
          this.running = null;
        }
      })
      .catch(() => {});
    return current;
  }

  async download() {
    const config = this.getConfig();
    const now = this.now();
    const radiusKm = Number(config.radius_km);
    const results = await Promise.allSettled(
      SOURCES.map((source) =>
        this.fetchers[source]({
          radiusKm,
          now,
          fetchImpl: this.fetchImpl,
          userAgent: this.userAgent,
        }),
      ),
    );
    const errors = {};
    const fresh = {};
    SOURCES.forEach((source, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        fresh[source] = result.value;
      } else {
        errors[source] = result.reason?.message ?? String(result.reason);
      }
    });
    this.errors = errors;
    this.failing = Object.keys(fresh).length === 0;
    if (this.failing) {
      this.rebuild();
      const error = new Error(Object.values(errors).join('; '));
      error.sources = errors;
      throw error;
    }

    const candidates = [];
    const seen = { ...(this.store.get('seen') ?? {}) };
    const seeded = { ...(this.store.get('seeded') ?? {}) };
    for (const [source, events] of Object.entries(fresh)) {
      const area = String(radiusKm);
      // A new area, or a source that had nothing (a dataset coming back to
      // life): take note silently rather than announce its whole content.
      const silent = seeded[source] !== area || this.bySource[source].length === 0;
      for (const event of events) {
        if (!silent && seen[event.id] === undefined) {
          candidates.push(event);
        }
        seen[event.id] = now;
      }
      if (silent) {
        logger.info(
          `${source}: ${events.length} event(s) to come noted, new ones will be announced from the next download`,
        );
      }
      seeded[source] = area;
      this.bySource[source] = events;
    }
    // Only the ids of the sources just read age: a source down for weeks
    // keeps its own, or its first success would announce old events.
    const freshPrefixes = Object.keys(fresh).map((source) => ID_PREFIXES[source]);
    for (const [id, at] of Object.entries(seen)) {
      if (!freshPrefixes.some((prefix) => id.startsWith(prefix))) {
        continue;
      }
      if (!Number.isFinite(at) || now - at > SEEN_TTL_MS) {
        delete seen[id];
      }
    }
    this.fetchedAt = now;
    this.rebuild();

    const announced = this.watchedAmong(candidates, config).slice(0, MAX_ANNOUNCED);
    if (candidates.length > 0) {
      logger.debug(`${candidates.length} new events, ${announced.length} to announce`);
    }
    this.store.set('seen', seen);
    this.store.set('seeded', seeded);
    this.store.set('fetchedAt', now);
    this.store.set('events', this.bySource);
    await this.store.save();

    const counts = Object.fromEntries(
      SOURCES.map((source) => [source, this.bySource[source].length]),
    );
    return {
      total: this.visible.length,
      counts,
      errors,
      announced,
      watched: this.watchedCounts(config),
    };
  }

  /**
   * Drops the dates gone by, merges the sources (OpenAgenda wins when both
   * list the same event on the same day) and hides the excluded words.
   */
  rebuild() {
    const now = this.now();
    const { excludedList } = this.getConfig();
    const merged = [];
    const keys = new Set();
    for (const source of SOURCES) {
      for (const stored of this.bySource[source]) {
        const occurrences = upcomingOccurrences(stored.occurrences ?? [], now);
        if (occurrences.length === 0) {
          continue;
        }
        const event = { ...stored, occurrences };
        // The day it is seen from: a run already started counts from today,
        // so a whole-day So Toulouse copy meets its OpenAgenda twin.
        const key = `${normalize(event.title)}|${localParts(Math.max(occurrences[0][0], now)).date}`;
        if (keys.has(key)) {
          continue;
        }
        keys.add(key);
        Object.defineProperty(event, 'search', { value: searchText(event), enumerable: false });
        if (excludedList.some((word) => containsWords(event.search, word))) {
          continue;
        }
        merged.push(event);
      }
    }
    this.visible = merged;
    this.thumbnails = new Map(
      merged
        .filter((event) => event.thumbnail && isAllowedImageUrl(event.thumbnail))
        .map((event) => [imageKey(event.thumbnail), event.thumbnail]),
    );
  }

  /**
   * The events matching a watched word, each with the first word it matches
   * (in the order of the configuration), soonest first.
   * @returns {{ event: object, keyword: string }[]}
   */
  watchedAmong(events, config = this.getConfig()) {
    if (config.watchList.length === 0) {
      return [];
    }
    const visible = new Map(this.visible.map((event) => [event.id, event]));
    return events
      .map((event) => visible.get(event.id))
      .filter(Boolean)
      .map((event) => ({ event, keyword: firstMatch(event.search, config.watchList) }))
      .filter((entry) => entry.keyword !== null)
      .sort((a, b) => a.event.occurrences[0][0] - b.event.occurrences[0][0]);
  }

  /** How many events to come match each watched word. */
  watchedCounts(config = this.getConfig()) {
    return Object.fromEntries(
      config.watchList.map((word) => [
        word,
        this.visible.filter((event) => containsWords(event.search, word)).length,
      ]),
    );
  }

  /** The address of a thumbnail shown in a widget, by its image key. */
  thumbnailFor(key) {
    return this.thumbnails.get(key) ?? null;
  }
}
