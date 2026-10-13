// -----------------------------------------------------------------------------
// Configuration: DEFAULT_CONFIG mirrors the manifest `config_schema` defaults
// (test/manifest.test.js keeps them in sync); normalizeConfig turns what
// Gladys sends into values the code can trust.
// -----------------------------------------------------------------------------

import { HOUR_MS } from './time.js';
import { parseList } from './text.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
/** Download period choices, in hours. */
export const REFRESH_HOURS = ['1', '3', '6', '12'];
/** Search radius choices around the Capitole, in kilometres. */
export const RADIUS_KM = ['5', '10', '15', '25'];

export const DEFAULT_CONFIG = Object.freeze({
  watch_keywords: '',
  excluded_words: '',
  radius_km: '15',
  refresh_hours: '3',
  language: 'fr',
});

const pick = (value, choices, fallback) => {
  const text = value == null ? '' : String(value).trim();
  return choices.includes(text) ? text : fallback;
};

const text = (value) => (typeof value === 'string' ? value : '');

/**
 * @param {Record<string, unknown>} [raw]
 * @returns {typeof DEFAULT_CONFIG & { watchList: string[], excludedList: string[] }}
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const config = {
    watch_keywords: text(source.watch_keywords),
    excluded_words: text(source.excluded_words),
    radius_km: pick(source.radius_km, RADIUS_KM, DEFAULT_CONFIG.radius_km),
    refresh_hours: pick(source.refresh_hours, REFRESH_HOURS, DEFAULT_CONFIG.refresh_hours),
    language: pick(source.language, LANGUAGES, DEFAULT_CONFIG.language),
  };
  return {
    ...config,
    watchList: parseList(config.watch_keywords),
    excludedList: parseList(config.excluded_words),
  };
}

/** Milliseconds between two downloads. */
export function refreshMs(config) {
  return Number(config.refresh_hours) * HOUR_MS;
}
