// -----------------------------------------------------------------------------
// Themes: the filter users actually think in ("a concert", "something for the
// kids"). OpenAgenda has no common category across its agendas, only free
// keywords, and So Toulouse has its own categories: both are mapped to the
// themes below from the words of the title, the keywords, the categories and
// the source agenda. An event can have several themes; the first one in THEMES
// order is its main theme (the one a scene filter sees).
//
// The keys are stored in widget settings and scene filters: never rename one.
// -----------------------------------------------------------------------------

import { normalize } from './text.js';

/**
 * Words of each theme, normalized (lower case, no accents). A trailing `*`
 * matches any word starting with it ("theatr*": théâtre, théâtral).
 */
const WORDS = {
  music: [
    'concert*',
    'musique*',
    'musical*',
    'music',
    'jazz*',
    'rock',
    'rap',
    'hip hop',
    'techno',
    'electro*',
    'house',
    'trance',
    'pop',
    'funk*',
    'soul',
    'reggae',
    'blues',
    'folk',
    'metal',
    'punk',
    'hardcore',
    'chanson*',
    'orchestre*',
    'symphoni*',
    'recital*',
    'opera*',
    'choral*',
    'choeur*',
    'dj',
    'live',
    'showcase',
    'variete*',
    'fanfare*',
    'groove',
    'bal',
    'trad',
  ],
  show: [
    'spectacle*',
    'theatr*',
    'danse*',
    'ballet*',
    'cirque*',
    'humour*',
    'humoriste*',
    'comique*',
    'comedy',
    'stand up',
    'one man show',
    'cabaret*',
    'marionnette*',
    'conte',
    'contes',
    'conteur*',
    'magie',
    'magicien*',
    'impro',
    'improvisation*',
    'clown*',
    'performance*',
  ],
  exhibition: ['exposition*', 'expo', 'expos', 'vernissage*', 'galerie*', 'photographie*'],
  cinema: [
    'cinema*',
    'film',
    'films',
    'projection*',
    'court metrage*',
    'courts metrages',
    'documentaire*',
    'cine*',
    'avant premiere*',
  ],
  festival: ['festival*', 'fete', 'fetes', 'carnaval*', 'biennale*', 'salon*', 'foire*'],
  family: [
    'jeune public',
    'enfant*',
    'famille*',
    'familial*',
    'kids',
    'bebe*',
    'tout petits',
    'parents enfants',
    '0 3 ans',
    'des 3 ans',
    'des 6 ans',
  ],
  talk: [
    'conference*',
    'rencontre*',
    'debat*',
    'lecture*',
    'table ronde*',
    'dedicace*',
    'colloque*',
    'causerie*',
    'projection debat',
    'soutenance*',
  ],
  workshop: ['atelier*', 'stage', 'stages', 'initiation*', 'masterclass*'],
  visit: [
    'visite*',
    'balade*',
    'promenade*',
    'patrimoine*',
    'monument*',
    'jeu de piste',
    'parcours*',
    'randonnee*',
  ],
};

/** The theme keys, in priority order. */
export const THEMES = Object.keys(WORDS);

const PATTERNS = Object.fromEntries(
  Object.entries(WORDS).map(([theme, words]) => {
    const alternatives = words.map((word) =>
      word.endsWith('*') ? `${word.slice(0, -1)}\\S*` : word,
    );
    return [theme, new RegExp(`(?<= )(?:${alternatives.join('|')})(?= )`)];
  }),
);

/**
 * The themes of an event, in THEMES order.
 * @param {string[]} texts title, keywords, categories, agenda name…
 * @param {{ ageMax?: number|null }} [hints]
 * @returns {string[]}
 */
export function detectThemes(texts, hints = {}) {
  // Each text on its own, so that a pattern never spans two of them.
  const normalized = texts.filter(Boolean).map((text) => normalize(String(text)));
  const themes = THEMES.filter((theme) => normalized.some((text) => PATTERNS[theme].test(text)));
  if (
    !themes.includes('family') &&
    Number.isFinite(hints.ageMax) &&
    hints.ageMax > 0 &&
    hints.ageMax <= 12
  ) {
    themes.push('family');
    themes.sort((a, b) => THEMES.indexOf(a) - THEMES.indexOf(b));
  }
  return themes;
}
