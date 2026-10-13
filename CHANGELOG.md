# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The cultural events of Toulouse and its suburbs (5 to 25 km around the Capitole) from the open data of
  OpenAgenda and Toulouse Métropole, downloaded every 1 to 12 hours, no account needed.
- Dashboard widget "Outings in Toulouse": today, tonight, tomorrow, this weekend, the next 7 or 30 days,
  filtered by themes, keywords, towns, free only, with or without exhibitions and long runs; thumbnail,
  "Free" / "Sold out" badges, description, price and link behind a tap.
- Scene trigger "New event announced": a new event contains one of the watched words of the
  configuration, with its title, date, place, town, link, price and description.
- Scene action "Outings in Toulouse": a ready-to-send list of the outings of a period, with the same
  filters as the widget.
- Hidden words, to leave out what does not interest you everywhere.
- "Download now" button, with the count of events matching each watched word.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-toulouse-agenda/commits/main
