// -----------------------------------------------------------------------------
// The "Outings in Toulouse" scene action: a text ready to send, its count and
// first outing; in the language of the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOW, createWorld } from './helpers/world.js';

test('this weekend, five outings listed, the others counted', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const outputs = await world.summary({});
  assert.equal(outputs.count, 14);
  assert.equal(outputs.first_title, 'Venez fêter Martror !');
  assert.equal(
    outputs.first_url,
    'https://openagenda.com/mervilla/events/venez-feter-martror-4234212',
  );
  assert.equal(
    outputs.summary,
    [
      'Ce week-end à Toulouse : 14 sorties.',
      '• ven. 16 oct., 17:30 — Venez fêter Martror ! · Halle Lauragaise de Castanet-Tolosan',
      '• ven. 16 oct., 18:30 — Éloge de la folie · Archives municipales',
      '• ven. 16 oct., 18:30 — Sesilha (session musiques trad) · COMDT (Gratuit)',
      "• ven. 16 oct., 20:30 — Saison musicale - Les Orients d'Occitanie - Lakhdar Hanou · Chapelle des Carmélites",
      '• ven. 16 oct., 21:00 — GACHA EMPEGA EL HILLAL · La Cave Poésie René-Gouzenne',
      'Et 9 autres.',
    ].join('\n'),
  );
});

test('filters, period and length; the language of the configuration', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  const music = await world.summary({
    period: 'week',
    themes: ['music'],
    free_only: true,
    max_items: 1,
  });
  assert.equal(
    music.summary,
    [
      'Next 7 days in Toulouse: 2 outings.',
      '• tomorrow, 20:00 — Concert de Professeurs · Auditorium Saint-Pierre des Cuisines (Free)',
      'And 1 more.',
    ].join('\n'),
  );
  const nothing = await world.summary({ period: 'tonight', keywords: 'opéra baroque' });
  assert.deepEqual(nothing, {
    summary: 'Tonight in Toulouse: nothing matches these filters.',
    count: 0,
    first_title: '',
    first_url: '',
  });
  // Out-of-range or malformed values fall back to the defaults.
  const fallback = await world.summary({ period: 'someday', max_items: 'x' });
  assert.equal(fallback.count, 14);
  assert.equal(fallback.summary.split('\n').length, 1 + 5 + 1);
  const capped = await world.summary({ period: 'month', max_items: 99, ongoing: true });
  assert.equal(capped.summary.split('\n').length, 1 + 15 + 1);
});

test('the same text in German and Spanish, and before the first download', async (t) => {
  const world = await createWorld({ config: { language: 'de' } });
  t.after(() => world.app.stop());
  const tonight = await world.summary({ period: 'tonight' });
  assert.match(tonight.summary, /^Heute Abend in Toulouse: 3 Veranstaltungen\.\n• heute, 18:00 — /);
  await world.fake.configUpdated({ language: 'es' });
  const tomorrow = await world.summary({ period: 'tomorrow', max_items: 2 });
  assert.match(tomorrow.summary, /^Mañana en Toulouse: \d+ salidas\.\n• mañana, /);
  const waiting = await createWorld({
    now: NOW,
    config: { language: 'fr' },
    web: { openagenda: () => new Error('offline'), soToulouse: () => new Error('offline') },
  });
  t.after(() => waiting.app.stop());
  assert.deepEqual(await waiting.summary({}), {
    summary: "L'agenda de Toulouse n'est pas encore téléchargé.",
    count: 0,
    first_title: '',
    first_url: '',
  });
});
