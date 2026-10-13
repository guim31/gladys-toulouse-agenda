// -----------------------------------------------------------------------------
// The periodic download, on the container's own timer (a provider has no
// device to poll), and what the logs say at the default level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RETRY_MS } from '../src/app.js';
import { NOW, OPENAGENDA_RECORDS, createWorld } from './helpers/world.js';

const HOUR = 3600 * 1000;

async function settle(world) {
  for (let round = 0; round < 5; round += 1) {
    await world.app.idle();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('downloads every 3 hours, sooner after a failure, at the new pace when changed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  const downloads = () =>
    world.web.requests.filter((r) => r.url.host === 'public.opendatasoft.com').length;
  assert.equal(downloads(), 1);

  t.mock.timers.tick(3 * HOUR - 1);
  await settle(world);
  assert.equal(downloads(), 1);
  world.clock.now = NOW + 3 * HOUR;
  t.mock.timers.tick(1);
  await settle(world);
  assert.equal(downloads(), 2);

  // Both sources down: tried again 15 minutes later.
  world.web.routes.openagenda = () => new Error('offline');
  world.web.routes.soToulouse = () => new Error('offline');
  world.clock.now += 3 * HOUR;
  t.mock.timers.tick(3 * HOUR);
  await settle(world);
  assert.equal(downloads(), 3);
  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  world.clock.now += RETRY_MS;
  t.mock.timers.tick(RETRY_MS);
  await settle(world);
  assert.equal(downloads(), 4);

  // Every 12 hours from now on: the next one 12 hours after the last.
  await world.fake.configUpdated({ refresh_hours: '12' });
  world.clock.now += 11 * HOUR;
  t.mock.timers.tick(11 * HOUR);
  await settle(world);
  assert.equal(downloads(), 4);
  world.clock.now += HOUR;
  t.mock.timers.tick(HOUR);
  await settle(world);
  assert.equal(downloads(), 5);
});

test('no download while disconnected, the late one on reconnection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  const downloads = () =>
    world.web.requests.filter((r) => r.url.host === 'public.opendatasoft.com').length;
  await world.gladys.disconnect();
  world.clock.now += 4 * HOUR;
  t.mock.timers.tick(4 * HOUR);
  await settle(world);
  assert.equal(downloads(), 1);
  await world.connect();
  await settle(world);
  assert.equal(downloads(), 2);
});

/** Capture what the SDK logger writes, at `level`. */
function captureLogs(t, level = 'info') {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk) => {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      return true;
    });
  }
  return {
    lines,
    stop() {
      t.mock.restoreAll();
      if (previous === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previous;
      }
    },
  };
}

test('routine downloads write nothing at the info level, a failure one line', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const logs = captureLogs(t);
  try {
    world.clock.now += 3 * HOUR;
    await world.download();
    await world.download();
    assert.deepEqual(logs.lines, []);
    world.web.routes.soToulouse = new Response('', { status: 500 });
    await world.download();
    world.web.routes.soToulouse = () => new Response('', { status: 500 });
    await world.download();
    assert.equal(logs.lines.length, 1);
    assert.match(logs.lines[0], /So Toulouse unavailable: data\.toulouse-metropole\.fr: HTTP 500/);
  } finally {
    logs.stop();
  }
});
