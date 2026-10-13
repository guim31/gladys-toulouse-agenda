// -----------------------------------------------------------------------------
// The "Outings in Toulouse" widget: within the core vocabulary and budget
// (validateWidgetContent of the SDK) in the four languages, filtered by its
// settings, honest when there is nothing to show; and its thumbnails.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { PERIODS } from '../src/filters.js';
import { imageKey } from '../src/catalog.js';
import { imageFormat, isAllowedImageUrl } from '../src/images.js';
import { TINY_JPEG, createWorld } from './helpers/world.js';

test('every period, in the four languages, fits the core vocabulary and budget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const period of PERIODS) {
      for (const ongoing of [false, true]) {
        const content = await world.widget({ period, ongoing }, language);
        assert.deepEqual(validateWidgetContent(content), [], `${language} ${period}`);
        assert.ok(content.components.filter((c) => c.type === 'text').length <= 2);
      }
    }
  }
});

test('this weekend, in French: the rows, the badge, the detail panel', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const content = await world.widget({}, 'fr');
  const [caption, list] = content.components;
  assert.equal(caption.text, 'Ce week-end · 14 sorties');
  assert.equal(list.display, 'list');
  assert.equal(list.items.length, 8);
  assert.deepEqual(
    list.items.slice(0, 3).map((item) => [item.title, item.subtitle, item.badge?.text]),
    [
      [
        'Venez fêter Martror !',
        'ven. 16 oct., 17:30 · Halle Lauragaise de Castanet-Tolosan',
        undefined,
      ],
      ['Éloge de la folie', 'ven. 16 oct., 18:30 (+1 date) · Archives municipales', undefined],
      ['Sesilha (session musiques trad)', 'ven. 16 oct., 18:30 · COMDT', 'Gratuit'],
    ],
  );
  const sesilha = list.items[2];
  assert.equal(sesilha.badge.color, 'success');
  assert.match(
    sesilha.description,
    /\n\nDates : ven\. 16 oct\., 18:30\nLieu : COMDT, 5 rue du Pont de Tounis\nTarif : Entrée libre\n\nSource : OpenAgenda/,
  );
  assert.deepEqual(sesilha.links, [
    {
      url: 'https://openagenda.com/o-agenda-des-tiers-lieux/events/sesilha-session-musiques-trad',
      label: "Fiche de l'événement",
    },
  ]);
  assert.match(sesilha.image, /^t-[0-9a-f]{24}$/);
});

test('the settings filter: theme, keywords, towns, free only', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const titles = async (settings) =>
    ((await world.widget(settings, 'en')).components[1]?.items ?? []).map((item) => item.title);
  assert.deepEqual(await titles({ period: 'week', themes: ['cinema'] }), [
    "Santosh / Soirée The Puzzle Asia et Po's culture",
    'Emily / Rencontre avec Didier Castanet, psychanalyste',
  ]);
  assert.deepEqual(await titles({ period: 'week', free_only: true, themes: ['music'] }), [
    'Concert de Professeurs',
    'Sesilha (session musiques trad)',
  ]);
  assert.deepEqual(await titles({ period: 'weekend', cities: 'Ramonville-Saint-Agne' }), [
    'THE SILVER LININGS ➤ @marinsdeaudouce ➤ Ramonville',
    '#FUTAL2026',
    'Au rythme des vagues • Kanis & Lou',
  ]);
  assert.deepEqual(await titles({ period: 'month', keywords: 'pokémon' }), []);
  assert.deepEqual(await titles({ period: 'month', keywords: 'pokémon', ongoing: true }), [
    'Exposition Inédite "Pokémon x ESA"',
  ]);
  // Full: flagged.
  const full = (await world.widget({ period: 'month', keywords: 'sorcière' }, 'en')).components[1];
  assert.deepEqual(full.items[0].badge, { text: 'Sold out', color: 'warning' });
});

test('nothing found, and before the first download', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const empty = await world.widget({ period: 'tonight', keywords: 'opéra baroque' }, 'de');
  assert.deepEqual(
    empty.components.map((component) => component.text),
    ['Heute Abend · 0 Veranstaltungen', 'Für diesen Zeitraum passt nichts zu diesen Filtern.'],
  );
  const waiting = await createWorld({
    web: { openagenda: () => new Error('offline'), soToulouse: () => new Error('offline') },
  });
  t.after(() => waiting.app.stop());
  const loading = await waiting.widget({}, 'es');
  assert.deepEqual(validateWidgetContent(loading), []);
  assert.equal(loading.ttl_seconds, 60);
  assert.equal(loading.components[1].text, 'Primera descarga en curso, vuelva en un minuto.');
});

test('thumbnails: only the keys shown, only from OpenAgenda, checked bytes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const content = await world.widget({ period: 'week' }, 'en');
  const key = content.components[1].items[0].image;
  const ack = await world.fake.widgetGetImage(key);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.image, TINY_JPEG.toString('base64'));
  assert.deepEqual(validateWidgetImage(ack.data.image), []);
  // Cached: one download for two requests.
  const before = world.web.requests.length;
  await world.fake.widgetGetImage(key);
  assert.equal(world.web.requests.length, before);

  const unknown = await world.fake.widgetGetImage('t-000000000000000000000000');
  assert.equal(unknown.success, false);

  world.web.routes.image = Buffer.from('<svg></svg>');
  const other = world.catalog.visible.find(
    (event) => event.thumbnail && imageKey(event.thumbnail) !== key,
  );
  const refused = await world.fake.widgetGetImage(imageKey(other.thumbnail));
  assert.equal(refused.success, false);
  assert.match(refused.error, /Not a PNG, JPEG or WebP picture/);
  // A failed download is not kept: it is tried again.
  world.web.routes.image = TINY_JPEG;
  assert.equal((await world.fake.widgetGetImage(imageKey(other.thumbnail))).success, true);

  world.web.routes.image = Buffer.alloc(301 * 1024, 0xff);
  const third = world.catalog.visible.filter((event) => event.thumbnail)[5];
  const large = await world.fake.widgetGetImage(imageKey(third.thumbnail));
  assert.match(large.error, /too large/);

  assert.equal(imageFormat(Buffer.from('RIFF0000WEBPVP8 ', 'latin1')), 'webp');
  assert.equal(imageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(imageFormat(Buffer.from('GIF89a')), null);
  assert.equal(isAllowedImageUrl('https://img.openagenda.com/main/x.jpg'), true);
  assert.equal(isAllowedImageUrl('http://img.openagenda.com/main/x.jpg'), false);
  assert.equal(isAllowedImageUrl('https://192.0.2.1/x.jpg'), false);
  assert.equal(isAllowedImageUrl('nope'), false);
});
