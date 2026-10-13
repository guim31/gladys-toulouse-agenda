// -----------------------------------------------------------------------------
// Keyword matching: whole words, case and accents ignored; the lists typed by
// users; the themes read from titles and keywords.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  containsWords,
  firstMatch,
  normalize,
  parseList,
  plainText,
  titleCase,
  truncate,
} from '../src/text.js';
import { THEMES, detectThemes } from '../src/themes.js';

test('normalize ignores case, accents, ligatures and punctuation', () => {
  assert.equal(normalize('Théâtre — Cœur  de Toulouse !'), ' theatre coeur de toulouse ');
  assert.equal(normalize(''), ' ');
  assert.equal(normalize(null), ' ');
  assert.equal(normalize('¡!'), ' ');
});

test('a keyword matches whole words only, a phrase in order', () => {
  const text = normalize('Rapport annuel | Jazz-funk au Bikini | Le Zénith');
  assert.equal(containsWords(text, 'jazz'), true);
  assert.equal(containsWords(text, 'FUNK'), true);
  assert.equal(containsWords(text, 'rap'), false, '"rap" is not "rapport"');
  assert.equal(containsWords(text, 'zenith'), true);
  assert.equal(containsWords(text, 'le zénith'), true);
  assert.equal(containsWords(text, 'zénith le'), false);
  assert.equal(containsWords(text, ''), false);
  assert.equal(firstMatch(text, ['opera', 'Bikini', 'jazz']), 'Bikini');
  assert.equal(firstMatch(text, ['opera']), null);
});

test('lists are split on commas, semicolons and lines, without empties nor duplicates', () => {
  assert.deepEqual(parseList(' jazz, Bikini ;; JAZZ\nZénith , '), ['jazz', 'Bikini', 'Zénith']);
  assert.deepEqual(parseList(['a', 'b']), ['a', 'b']);
  assert.deepEqual(parseList(undefined), []);
  assert.deepEqual(parseList(42), []);
});

test('plain text, truncation and title case', () => {
  assert.equal(plainText('<p>Un <b>concert</b>&nbsp;&amp; plus</p>\n\n'), 'Un concert & plus');
  assert.equal(plainText(undefined), '');
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 4), 'abc');
  assert.equal(truncate(null, 4), '');
  assert.equal(titleCase('SAINT-ORENS-DE-GAMEVILLE'), 'Saint-Orens-De-Gameville');
  assert.equal(titleCase("L'UNION"), "L'Union");
  assert.equal(titleCase('Toulouse'), 'Toulouse');
  assert.equal(titleCase(null), '');
});

test('themes come from the title, the keywords and the categories', () => {
  assert.deepEqual(THEMES, [
    'music',
    'show',
    'exhibition',
    'cinema',
    'festival',
    'family',
    'talk',
    'workshop',
    'visit',
  ]);
  assert.deepEqual(detectThemes(['Concert de Professeurs']), ['music']);
  assert.deepEqual(detectThemes(['BRIQUE Comedy Club', 'humour']), ['show']);
  assert.deepEqual(detectThemes(['Lectures pour les 0-3 ans']), ['family', 'talk']);
  assert.deepEqual(detectThemes(['Atelier Parents - enfants (dès 3 ans)']), ['family', 'workshop']);
  assert.deepEqual(detectThemes(['Saint Omer', 'Cinéma', 'Drame']), ['cinema']);
  assert.deepEqual(detectThemes(['Visites guidées', 'Culturelle']), ['visit']);
  assert.deepEqual(detectThemes(['Un rapport, une population']), [], 'no "rap", no "pop"');
  assert.deepEqual(detectThemes(['Spectacle'], { ageMax: 10 }), ['show', 'family']);
  assert.deepEqual(detectThemes(['Spectacle'], { ageMax: 99 }), ['show']);
  assert.deepEqual(detectThemes([null, undefined, '']), []);
});
