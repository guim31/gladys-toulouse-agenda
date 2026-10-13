// -----------------------------------------------------------------------------
// A test world: the SDK's fake Gladys, a fake web serving the two
// Opendatasoft portals (real records, test/fixtures) and the OpenAgenda
// thumbnails, a settable clock and an in-memory store. Nothing touches the
// network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

/** Wednesday 14 October 2026, 08:00 in Toulouse: the day after the fixtures were downloaded. */
export const NOW = Date.parse('2026-10-14T06:00:00.000Z');

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

export const OPENAGENDA_RECORDS = fixture('openagenda-toulouse.json');
export const SO_TOULOUSE_RECORDS = fixture('so-toulouse.json');

/** A 1 × 1 JPEG, enough for the image checks. */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64',
);

const OPENAGENDA_PATH =
  '/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/exports/json';
const SO_TOULOUSE_PATH =
  '/api/explore/v2.1/catalog/datasets/agenda-des-manifestations-culturelles-so-toulouse/exports/json';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A fake web. Each route is the body to serve (records, Buffer) or a function
 * (url) → Response | Error | body.
 */
export function createWeb(overrides = {}) {
  const routes = {
    openagenda: OPENAGENDA_RECORDS,
    soToulouse: SO_TOULOUSE_RECORDS,
    image: TINY_JPEG,
    ...overrides,
  };
  const requests = [];
  async function answer(route, url) {
    const value = typeof route === 'function' ? await route(url) : route;
    if (value instanceof Error) {
      throw value;
    }
    if (value instanceof Response) {
      return value;
    }
    if (Buffer.isBuffer(value)) {
      return new Response(value, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    return json(value);
  }
  const fetchImpl = async (href, init = {}) => {
    const url = new URL(href);
    requests.push({ url, headers: init.headers ?? {} });
    if (url.host === 'public.opendatasoft.com' && url.pathname === OPENAGENDA_PATH) {
      return answer(routes.openagenda, url);
    }
    if (url.host === 'data.toulouse-metropole.fr' && url.pathname === SO_TOULOUSE_PATH) {
      return answer(routes.soToulouse, url);
    }
    if (url.host === 'img.openagenda.com') {
      return answer(routes.image, url);
    }
    return new Response('Not found', { status: 404 });
  };
  return { routes, requests, fetchImpl };
}

export function createMemoryStore(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    saves: 0,
    async load() {},
    get: (key) => data[key],
    set(key, value) {
      if (value === undefined) {
        delete data[key];
      } else {
        data[key] = value;
      }
    },
    async save() {
      this.saves += 1;
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] the integration configuration
 * @param {object} [options.web] route overrides of the fake web
 * @param {object} [options.store] a store (createMemoryStore)
 * @param {number} [options.now]
 * @param {boolean} [options.connect] false: not connected yet
 * @param {boolean} [options.timers] true: the periodic download runs (mock the timers)
 */
export async function createWorld(options = {}) {
  const clock = { now: options.now ?? NOW };
  const web = createWeb(options.web);
  const store = options.store ?? createMemoryStore();
  const gladys = createFakeGladys({ config: options.config ?? {} });
  const app = registerHandlers(gladys, {
    fetchImpl: web.fetchImpl,
    now: () => clock.now,
    store,
    timers: options.timers ?? false,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    catalog: app.catalog,
    web,
    store,
    clock,
    async connect() {
      await gladys.connect();
      await app.idle();
    },
    /** A download, as the timer would run it. */
    async download() {
      const ack = await gladys.fake.action('refresh_now', {});
      await app.idle();
      return ack;
    },
    async widget(settings = {}, language = 'fr') {
      const ack = await gladys.fake.widgetGet('outings', { settings, language, units: 'metric' });
      if (!ack.success) {
        throw new Error(ack.error);
      }
      return ack.data.content;
    },
    async summary(fields = {}) {
      const ack = await gladys.fake.sceneAction('outings_summary', fields);
      if (!ack.success) {
        throw new Error(ack.error);
      }
      return ack.data.outputs;
    },
  };
  if (options.connect !== false) {
    await world.connect();
  }
  return world;
}

/** The OpenAgenda records without the ones whose uid is listed. */
export function withoutUids(uids) {
  return OPENAGENDA_RECORDS.filter((record) => !uids.includes(record.uid));
}
