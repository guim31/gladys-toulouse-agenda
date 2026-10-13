// -----------------------------------------------------------------------------
// Text matching for keywords, excluded words and themes: case, accents and
// punctuation are ignored, and a keyword matches whole words only ("rap" does
// not match "rapport", "jazz" matches "Jazz-funk"). Several words match as a
// phrase ("Le Bikini", "jeune public").
// -----------------------------------------------------------------------------

/**
 * Lower case, no accents, every run of non-alphanumerics turned into one
 * space, padded with one space on each side so a phrase search is a plain
 * `includes(' word ')`.
 */
export function normalize(text) {
  if (typeof text !== 'string' || text === '') {
    return ' ';
  }
  const plain = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return plain === '' ? ' ' : ` ${plain} `;
}

/**
 * A comma- or semicolon-separated list typed by the user, as written
 * (trimmed), without empty entries nor duplicates (by their normalized form).
 * @returns {string[]}
 */
export function parseList(value) {
  if (Array.isArray(value)) {
    return parseList(value.join(','));
  }
  if (typeof value !== 'string') {
    return [];
  }
  const seen = new Set();
  const list = [];
  for (const raw of value.split(/[,;\n]/)) {
    const entry = raw.trim();
    const key = normalize(entry);
    if (key !== ' ' && !seen.has(key)) {
      seen.add(key);
      list.push(entry);
    }
  }
  return list;
}

/** True when the normalized `haystack` contains the words of `needle`. */
export function containsWords(haystack, needle) {
  const words = normalize(needle);
  return words !== ' ' && haystack.includes(words);
}

/** The first entry of `list` found in the normalized `haystack`, or null. */
export function firstMatch(haystack, list) {
  return list.find((entry) => containsWords(haystack, entry)) ?? null;
}

/** Strips HTML tags and collapses white space (descriptions are plain text). */
export function plainText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cuts `text` to `max` characters, with an ellipsis when it was longer. */
export function truncate(text, max) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** "TOULOUSE" → "Toulouse", "SAINT-ORENS-DE-GAMEVILLE" → "Saint-Orens-De-Gameville". */
export function titleCase(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const trimmed = text.trim();
  if (trimmed !== trimmed.toUpperCase()) {
    return trimmed;
  }
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}
