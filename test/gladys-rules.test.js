// -----------------------------------------------------------------------------
// The device rules of the Gladys core (feature table, polling, min/max…) do not
// apply here: a provider integration publishes no device. This test pins it,
// so that a device added one day comes with the full conformity test
// (test/fixtures/gladys-feature-table.json, as in the other integrations).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('a provider: no device published, no state, nothing polled', async (t) => {
  assert.equal(manifest.type, 'provider');
  const world = await createWorld({ config: { watch_keywords: 'concert' } });
  t.after(() => world.app.stop());
  await world.download();
  await world.fake.scanRequest?.().catch(() => {});
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.deepEqual(world.fake.states, []);
  // The SDK reads the (empty) device list on connection; nothing is ever written.
  const writes = world.fake.requests.filter(
    (request) => request.method !== 'GET' && /\/device|\/state/.test(request.path),
  );
  assert.deepEqual(writes, []);
});

test('the same new event reaches the scenes once, even when two downloads overlap', async (t) => {
  const { OPENAGENDA_RECORDS } = await import('./helpers/world.js');
  const world = await createWorld({
    config: { watch_keywords: 'concert' },
    web: { openagenda: [] },
  });
  t.after(() => world.app.stop());
  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  await Promise.all([world.download(), world.download()]);
  const titles = world.fake.sceneEvents.map((event) => event.data.title);
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(titles.length > 0);
});
