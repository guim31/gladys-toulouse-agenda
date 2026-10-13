// -----------------------------------------------------------------------------
// Every text the code produces, in the four languages of the Gladys interface.
// German says "du", Spanish "usted". The widget follows the language of the
// person looking at it; the scene texts and the action reports follow the
// `language` setting (Gladys does not tell them who reads). Event titles and
// descriptions stay as the organisers wrote them, in French.
// -----------------------------------------------------------------------------

import { EVENT_TIME_ZONE, addDays, localParts } from './time.js';

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** The language of a table, English when unknown. */
export function pick(table, language) {
  return table[language] ?? table.en;
}

/** The four languages of a text, for a multi-language message. */
export function allLanguages(render) {
  return Object.fromEntries(Object.keys(LOCALES).map((language) => [language, render(language)]));
}

export const THEME_LABELS = {
  en: {
    music: 'Music',
    show: 'Show',
    exhibition: 'Exhibition',
    cinema: 'Cinema',
    festival: 'Festival',
    family: 'Family',
    talk: 'Talk',
    workshop: 'Workshop',
    visit: 'Visit',
  },
  fr: {
    music: 'Musique',
    show: 'Spectacle',
    exhibition: 'Exposition',
    cinema: 'Cinéma',
    festival: 'Festival',
    family: 'En famille',
    talk: 'Rencontre',
    workshop: 'Atelier',
    visit: 'Visite',
  },
  de: {
    music: 'Musik',
    show: 'Bühne',
    exhibition: 'Ausstellung',
    cinema: 'Kino',
    festival: 'Festival',
    family: 'Familie',
    talk: 'Vortrag',
    workshop: 'Workshop',
    visit: 'Führung',
  },
  es: {
    music: 'Música',
    show: 'Espectáculo',
    exhibition: 'Exposición',
    cinema: 'Cine',
    festival: 'Festival',
    family: 'En familia',
    talk: 'Encuentro',
    workshop: 'Taller',
    visit: 'Visita',
  },
};

/** The period as a sentence start: "Tonight", "This weekend"… */
export const PERIOD_LABELS = {
  en: {
    today: 'Today',
    tonight: 'Tonight',
    tomorrow: 'Tomorrow',
    weekend: 'This weekend',
    week: 'Next 7 days',
    month: 'Next 30 days',
  },
  fr: {
    today: "Aujourd'hui",
    tonight: 'Ce soir',
    tomorrow: 'Demain',
    weekend: 'Ce week-end',
    week: '7 prochains jours',
    month: '30 prochains jours',
  },
  de: {
    today: 'Heute',
    tonight: 'Heute Abend',
    tomorrow: 'Morgen',
    weekend: 'Dieses Wochenende',
    week: 'Nächste 7 Tage',
    month: 'Nächste 30 Tage',
  },
  es: {
    today: 'Hoy',
    tonight: 'Esta noche',
    tomorrow: 'Mañana',
    weekend: 'Este fin de semana',
    week: 'Próximos 7 días',
    month: 'Próximos 30 días',
  },
};

export const TEXT = {
  en: {
    free: 'Free',
    full: 'Sold out',
    today: 'today',
    tomorrow: 'tomorrow',
    until: (date) => `until ${date}`,
    more: (count) => (count === 1 ? '+1 date' : `+${count} dates`),
    count: (count) => (count === 1 ? '1 outing' : `${count} outings`),
    eventPage: 'Event page',
    loading: 'First download in progress, come back in a minute.',
    nothing: 'Nothing matches these filters for this period.',
    unavailable: 'The agenda could not be downloaded: these are the events of the last download.',
    source: (date) =>
      `Source: OpenAgenda and Toulouse Métropole open data (Licence Ouverte), updated ${date}.`,
    price: (value) => `Price: ${value}`,
    place: (value) => `Place: ${value}`,
    dates: (value) => `Dates: ${value}`,
    summaryTitle: (period, count) =>
      `${period} in Toulouse: ${count === 1 ? '1 outing' : `${count} outings`}.`,
    summaryNone: (period) => `${period} in Toulouse: nothing matches these filters.`,
    summaryMore: (count) => `And ${count} more.`,
    summaryLoading: 'The Toulouse agenda is not downloaded yet.',
  },
  fr: {
    free: 'Gratuit',
    full: 'Complet',
    today: "aujourd'hui",
    tomorrow: 'demain',
    until: (date) => `jusqu'au ${date}`,
    more: (count) => (count === 1 ? '+1 date' : `+${count} dates`),
    count: (count) => (count === 1 ? '1 sortie' : `${count} sorties`),
    eventPage: "Fiche de l'événement",
    loading: 'Premier téléchargement en cours, reviens dans une minute.',
    nothing: 'Rien ne correspond à ces filtres sur cette période.',
    unavailable:
      "L'agenda n'a pas pu être téléchargé : voici les événements du dernier téléchargement.",
    source: (date) =>
      `Source : OpenAgenda et open data de Toulouse Métropole (Licence Ouverte), mis à jour le ${date}.`,
    price: (value) => `Tarif : ${value}`,
    place: (value) => `Lieu : ${value}`,
    dates: (value) => `Dates : ${value}`,
    summaryTitle: (period, count) =>
      `${period} à Toulouse : ${count === 1 ? '1 sortie' : `${count} sorties`}.`,
    summaryNone: (period) => `${period} à Toulouse : rien ne correspond à ces critères.`,
    summaryMore: (count) => `Et ${count} autre${count === 1 ? '' : 's'}.`,
    summaryLoading: "L'agenda de Toulouse n'est pas encore téléchargé.",
  },
  de: {
    free: 'Kostenlos',
    full: 'Ausverkauft',
    today: 'heute',
    tomorrow: 'morgen',
    until: (date) => `bis ${date}`,
    more: (count) => (count === 1 ? '+1 Termin' : `+${count} Termine`),
    count: (count) => (count === 1 ? '1 Veranstaltung' : `${count} Veranstaltungen`),
    eventPage: 'Veranstaltungsseite',
    loading: 'Erster Download läuft, schau gleich noch mal vorbei.',
    nothing: 'Für diesen Zeitraum passt nichts zu diesen Filtern.',
    unavailable:
      'Die Agenda konnte nicht geladen werden: Das sind die Veranstaltungen des letzten Downloads.',
    source: (date) =>
      `Quelle: OpenAgenda und Open Data von Toulouse Métropole (Licence Ouverte), aktualisiert am ${date}.`,
    price: (value) => `Preis: ${value}`,
    place: (value) => `Ort: ${value}`,
    dates: (value) => `Termine: ${value}`,
    summaryTitle: (period, count) =>
      `${period} in Toulouse: ${count === 1 ? '1 Veranstaltung' : `${count} Veranstaltungen`}.`,
    summaryNone: (period) => `${period} in Toulouse: Nichts passt zu diesen Kriterien.`,
    summaryMore: (count) => `Und ${count} weitere.`,
    summaryLoading: 'Die Agenda von Toulouse ist noch nicht geladen.',
  },
  es: {
    free: 'Gratis',
    full: 'Completo',
    today: 'hoy',
    tomorrow: 'mañana',
    until: (date) => `hasta el ${date}`,
    more: (count) => (count === 1 ? '+1 fecha' : `+${count} fechas`),
    count: (count) => (count === 1 ? '1 salida' : `${count} salidas`),
    eventPage: 'Ficha del evento',
    loading: 'Primera descarga en curso, vuelva en un minuto.',
    nothing: 'Nada corresponde a estos filtros en este periodo.',
    unavailable:
      'No se ha podido descargar la agenda: estos son los eventos de la última descarga.',
    source: (date) =>
      `Fuente: OpenAgenda y datos abiertos de Toulouse Métropole (Licence Ouverte), actualizado el ${date}.`,
    price: (value) => `Precio: ${value}`,
    place: (value) => `Lugar: ${value}`,
    dates: (value) => `Fechas: ${value}`,
    summaryTitle: (period, count) =>
      `${period} en Toulouse: ${count === 1 ? '1 salida' : `${count} salidas`}.`,
    summaryNone: (period) => `${period} en Toulouse: nada corresponde a estos criterios.`,
    summaryMore: (count) => `Y ${count} más.`,
    summaryLoading: 'La agenda de Toulouse aún no se ha descargado.',
  },
};

/** Messages of the "Refresh now" action. */
export const REPORT_TEXT = {
  en: {
    done: (total) => `${total} events to come around Toulouse.`,
    sourceFailed: (source, error) => `${source} unavailable (${error}), previous events kept.`,
    failed: (error) => `Download failed: ${error}.`,
    watched: (list) => `Watched words: ${list}.`,
    noWatched: 'No watched word yet.',
    started: 'Download in progress: the widget will update when it is over.',
    status: 'The Toulouse agenda cannot be downloaded at the moment.',
  },
  fr: {
    done: (total) => `${total} événements à venir autour de Toulouse.`,
    sourceFailed: (source, error) =>
      `${source} indisponible (${error}), événements précédents conservés.`,
    failed: (error) => `Échec du téléchargement : ${error}.`,
    watched: (list) => `Mots surveillés : ${list}.`,
    noWatched: 'Aucun mot surveillé pour l’instant.',
    started: 'Téléchargement en cours : le widget se mettra à jour à la fin.',
    status: "L'agenda de Toulouse ne peut pas être téléchargé pour le moment.",
  },
  de: {
    done: (total) => `${total} kommende Veranstaltungen rund um Toulouse.`,
    sourceFailed: (source, error) =>
      `${source} nicht erreichbar (${error}), bisherige Veranstaltungen bleiben.`,
    failed: (error) => `Download fehlgeschlagen: ${error}.`,
    watched: (list) => `Beobachtete Wörter: ${list}.`,
    noWatched: 'Noch kein beobachtetes Wort.',
    started: 'Download läuft: Das Widget wird danach aktualisiert.',
    status: 'Die Agenda von Toulouse kann gerade nicht geladen werden.',
  },
  es: {
    done: (total) => `${total} eventos próximos en los alrededores de Toulouse.`,
    sourceFailed: (source, error) =>
      `${source} no disponible (${error}), se conservan los eventos anteriores.`,
    failed: (error) => `Error de descarga: ${error}.`,
    watched: (list) => `Palabras vigiladas: ${list}.`,
    noWatched: 'Todavía no hay ninguna palabra vigilada.',
    started: 'Descarga en curso: el widget se actualizará al terminar.',
    status: 'La agenda de Toulouse no se puede descargar en este momento.',
  },
};

export const SOURCE_NAMES = { openagenda: 'OpenAgenda', so_toulouse: 'So Toulouse' };

const formatters = new Map();

function formatter(language, options) {
  const key = `${language}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
      timeZone: EVENT_TIME_ZONE,
      ...options,
    });
    formatters.set(key, cached);
  }
  return cached;
}

/** "18:00" (24-hour clock everywhere: the Gladys languages all use it). */
export function formatTime(instant, language) {
  return formatter(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    instant,
  );
}

/** "sam. 18 oct." */
export function formatDay(instant, language) {
  return formatter(language, { weekday: 'short', day: 'numeric', month: 'short' }).format(instant);
}

/** "18 oct. 2026" */
export function formatDate(instant, language) {
  return formatter(language, { day: 'numeric', month: 'short', year: 'numeric' }).format(instant);
}

/**
 * When an outing happens, as short as possible, read in Toulouse:
 * "aujourd'hui, 20:00", "demain, 18:30", "sam. 18 oct., 20:00", a day without
 * hour for an all-day date, "jusqu'au 12 nov." for one already running over
 * several days.
 * @param {{ start: number, end: number, allDay: boolean }} slot
 */
export function formatWhen({ start, end, allDay }, language, now) {
  const text = pick(TEXT, language);
  const today = localParts(now).date;
  const startDay = localParts(start).date;
  // An all-day end is exclusive (midnight after the last day).
  const lastDay = localParts(allDay ? end - 1 : end).date;
  const multiDay = lastDay > startDay && (allDay || end - start > 20 * 60 * 60 * 1000);
  if (multiDay) {
    const endLabel = formatDay(allDay ? end - 1 : end, language);
    return start <= now ? text.until(endLabel) : `${formatDay(start, language)} → ${endLabel}`;
  }
  let day;
  if (startDay === today) {
    day = text.today;
  } else if (startDay === addDays(today, 1)) {
    day = text.tomorrow;
  } else {
    day = formatDay(start, language);
  }
  return allDay ? day : `${day}, ${formatTime(start, language)}`;
}
