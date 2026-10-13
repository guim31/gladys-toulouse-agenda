# Toulouse Agenda for Gladys Assistant

The cultural outings of Toulouse and its suburbs in
[Gladys Assistant](https://gladysassistant.com): concerts, shows, exhibitions, screenings, talks and
workshops, from open data — no account, no API key.

This is an **external integration** of type `provider` (Gladys 5.1.0 or later): it runs in its own
sandboxed container, publishes no device, and brings a dashboard widget, a scene trigger and a scene action.

> Tested with its automated test suite, real records of both sources and the real APIs, not yet on many
> real Gladys instances: feedback welcome on the Gladys forum or in the issues.

## Features

- **Dashboard widget "Outings in Toulouse"**: the outings of today, tonight, tomorrow, this weekend or the
  coming days, with thumbnail, time and place, a "Free" or "Sold out" badge, and the description, price
  and link behind a tap. Each widget has its own filters: themes (music, show, exhibition, cinema,
  festival, family, talk, workshop, visit), keywords, towns, free only, exhibitions and long runs or not.
- **Scene trigger "New event announced"**: a new event contains one of your watched words (an artist, a
  venue, "jazz", "gratuit"…); filters on the word, the main theme, free or not, the town; the title, date,
  place, link, price and description passed on to the scene.
- **Scene action "Outings in Toulouse"**: a ready-to-send list of the outings of a period with the same
  filters — e.g. every Friday at 18:00, the weekend's concerts by message.
- **Download now** button, with the count of events matching each watched word.
- Hidden words, to drop what does not interest you everywhere.
- Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- Internet access from Gladys (`public.opendatasoft.com`, `data.toulouse-metropole.fr`,
  `img.openagenda.com`).

## Installation

In Gladys: **Integrations → Install from GitHub**, address `https://github.com/guim31/gladys-toulouse-agenda`
(or from the store, category Services). Then add the **Outings in Toulouse** widget to a dashboard. The
complete guide is in [`docs/en.md`](docs/en.md) (also in [French](docs/fr.md), [German](docs/de.md) and
[Spanish](docs/es.md)).

## How it works

Every 3 hours by default, the integration downloads the events to come within 15 km of the Capitole (5 to
25 km) from two open datasets, one request each through the Opendatasoft Explore API v2.1 (`exports/json`):

- OpenAgenda public events (`evenements-publics-openagenda` on `public.opendatasoft.com`), about 1,500
  events around Toulouse: city libraries, museums and monuments, Quai des Savoirs, Cratère, Shotgun, town
  agendas… Cancelled, postponed and online-only events, leftover test entries and the job centre's
  sessions are left out.
- "Agenda des manifestations culturelles - So Toulouse" of Toulouse Métropole
  (`data.toulouse-metropole.fr`). As of October 2026 this dataset has not been updated since December 2025;
  it is read anyway, for the day it comes back. An event listed by both on the same day is shown once.

The themes are deduced from the titles, keywords and categories (OpenAgenda has no common category). Dates
are read in Europe/Paris, whatever the time zone of Gladys. The events of the last download and the ids
already seen are kept in `/data`: a restart shows the widget at once and announces nothing twice; the
first download, and a change of radius, only take note of what exists. Thumbnails are served to Gladys by
the container (the dashboard never loads a third-party picture), downloaded from the OpenAgenda image
hosts only.

## Limitations

- Coverage depends on what venues publish on OpenAgenda: not every concert hall does.
- Titles and descriptions stay in French.
- A watched word fires once per new event; at most 20 scene events per download.
- The trigger's filters are exact (equality): write the watched word as in the configuration.

## Development

Node.js 22+, ESM, no build step, one runtime dependency:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys; no network
npm run lint
npm run format:check
npx -y github:GladysAssistant/integration-store --skip-image-check .   # store validator
```

```
index.js                   SDK wiring (src/app.js registers the handlers)
src/app.js                 every SDK handler, the periodic download, the scene events
src/catalog.js             both sources merged, persisted, new events detected
src/sources/opendatasoft.js  the Explore API v2.1 export client, bounded in size and time
src/sources/openagenda.js  OpenAgenda records -> events
src/sources/sotoulouse.js  So Toulouse records -> events
src/events.js              the event model: free, long runs, search text
src/themes.js              themes from titles and keywords
src/filters.js             periods (tonight, weekend…) and filters
src/widgets.js             "Outings in Toulouse" widget; src/images.js: thumbnails
src/scenes.js              trigger data and the summary action
src/i18n.js                every text of the code, in four languages; src/time.js: Toulouse time
src/config.js              DEFAULT_CONFIG (mirrors the manifest) + normalization
src/store.js               /data/state.json
test/fixtures/             real records of both sources, downloaded in October 2026
```

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="toulouse-agenda" \
DATA_DIR=./data \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by hand. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Event data: [OpenAgenda](https://openagenda.com) and its organisers, through the
  [Opendatasoft open data portal](https://public.opendatasoft.com/explore/dataset/evenements-publics-openagenda/),
  and [Toulouse Métropole open data](https://data.toulouse-metropole.fr/explore/dataset/agenda-des-manifestations-culturelles-so-toulouse/),
  both under the [Licence Ouverte / Etalab](https://www.etalab.gouv.fr/licence-ouverte-open-licence/). The
  test fixtures are extracts of these datasets.
- There is no Home Assistant equivalent of this integration.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by OpenAgenda, Opendatasoft, Toulouse
Métropole or the City of Toulouse.

## License

[Apache-2.0](LICENSE)
