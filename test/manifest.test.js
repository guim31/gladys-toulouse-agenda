// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, RADIUS_KM, REFRESH_HOURS } from '../src/config.js';
import { ACTIONS } from '../src/app.js';
import { PERIODS } from '../src/filters.js';
import { THEMES } from '../src/themes.js';
import {
  FREE_CHOICES,
  SCENE_ACTION_KEYS,
  SCENE_TRIGGER_KEYS,
  SUMMARY_DEFAULTS,
  SUMMARY_MAX_ITEMS,
} from '../src/scenes.js';
import { DEFAULT_PERIOD, OUTINGS_WIDGET } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('a provider integration, cloud, for Gladys 5.1.0 and later', () => {
  // Widgets, scene triggers and actions and the provider type came with 5.1.0.
  assert.equal(manifest.type, 'provider');
  assert.equal(manifest.gladys_version, '>=5.1.0');
  assert.deepEqual(manifest.categories, ['services']);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.containers, undefined);
});

test('config_schema defaults and choices are the ones of the code', () => {
  for (const entry of manifest.config_schema.filter((item) => item.type !== 'section')) {
    assert.equal(DEFAULT_CONFIG[entry.key], entry.default, `default of ${entry.key}`);
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    keysOf(manifest.config_schema)
      .filter((key) => key !== 'intro')
      .sort(),
  );
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'radius_km')), RADIUS_KM);
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'refresh_hours')), REFRESH_HOURS);
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'language')), LANGUAGES);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('every declared action, scene action and widget has a handler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(keysOf(manifest.actions), Object.values(ACTIONS));
  for (const key of keysOf(manifest.actions)) {
    const ack = await world.fake.action(key, {});
    assert.equal(ack.success, true, `${key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.scene_actions), Object.values(SCENE_ACTION_KEYS));
  for (const key of keysOf(manifest.scene_actions)) {
    const ack = await world.fake.sceneAction(key, {});
    assert.equal(ack.success, true, `${key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.widgets), [OUTINGS_WIDGET]);
  const ack = await world.fake.widgetGet(OUTINGS_WIDGET, {
    settings: {},
    language: 'en',
    units: 'metric',
  });
  assert.equal(ack.success, true);
});

test('the trigger: its filters are the keys the code sends, its variables too', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers), SCENE_TRIGGER_KEYS);
  const [trigger] = manifest.scene_triggers;
  assert.deepEqual(keysOf(trigger.fields), ['keyword', 'theme', 'free', 'city']);
  assert.deepEqual(optionsOf(field(trigger.fields, 'theme')), THEMES);
  assert.deepEqual(optionsOf(field(trigger.fields, 'free')), FREE_CHOICES);
  // Fire one, and compare with the declaration.
  const world = await createWorld({
    config: { watch_keywords: 'concert' },
    web: { openagenda: [] },
  });
  t.after(() => world.app.stop());
  const { OPENAGENDA_RECORDS } = await import('./helpers/world.js');
  world.web.routes.openagenda = OPENAGENDA_RECORDS;
  await world.download();
  const [{ data }] = world.fake.sceneEvents;
  const declared = new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)]);
  assert.deepEqual(Object.keys(data).sort(), [...declared].sort());
  for (const variable of trigger.variables) {
    assert.equal(variable.type, 'string', variable.key);
  }
});

test('the scene action and the widget: periods, themes and defaults of the code', () => {
  const [action] = manifest.scene_actions;
  assert.deepEqual(keysOf(action.fields), [
    'period',
    'themes',
    'keywords',
    'cities',
    'free_only',
    'ongoing',
    'max_items',
  ]);
  assert.deepEqual(optionsOf(field(action.fields, 'period')), PERIODS);
  assert.equal(field(action.fields, 'period').default, SUMMARY_DEFAULTS.period);
  assert.equal(field(action.fields, 'max_items').default, SUMMARY_DEFAULTS.max_items);
  assert.equal(field(action.fields, 'max_items').max, SUMMARY_MAX_ITEMS);
  assert.deepEqual(optionsOf(field(action.fields, 'themes')), THEMES);
  assert.deepEqual(keysOf(action.outputs), ['summary', 'count', 'first_title', 'first_url']);
  assert.ok(action.fields.every((entry) => entry.required === undefined));

  const [widget] = manifest.widgets;
  assert.deepEqual(keysOf(widget.settings), [
    'period',
    'themes',
    'keywords',
    'cities',
    'free_only',
    'ongoing',
  ]);
  assert.deepEqual(optionsOf(field(widget.settings, 'period')), PERIODS);
  assert.equal(field(widget.settings, 'period').default, DEFAULT_PERIOD);
  assert.deepEqual(optionsOf(field(widget.settings, 'themes')), THEMES);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-toulouse-agenda:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-toulouse-agenda/main/cover.png',
  );
});

test('section fields are purely presentational, links https', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});
