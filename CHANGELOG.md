# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.2] - 2026-10-17

### Fixed

- The Boost button of the widget could not end a boost: tapped again, it now
  goes back to the mode seen before the boost.

## [1.0.1] - 2026-10-15

### Added

- Ariston NET account connection (the account of the Ariston NET or Chaffoteaux
  app), with a "Test the connection" button listing the appliances found.
- Boilers and heat pumps (Genus One, Alteas One, Nimbus, Chaffoteaux INOA…):
  system mode, hot water setpoint and temperature, burner, heat pump, heating
  pressure, outside and flow temperatures.
- One device per heating zone: room temperature, setpoint within the zone's
  range and step, mode (off, heating, cooling, Auto = the app's schedule),
  heat demand.
- Water heaters (Velis Evo, Lux, Lux 2, Lydos, Lydos Hybrid, Nuos Split,
  Andris 2): on/off, water temperature, setpoint, mode, heating, showers
  available.
- Fault codes of every appliance, and the "Ariston fault detected" scene
  trigger.
- Last month's gas and electricity consumption, optional.
- The "Ariston" dashboard widget, with setpoint, mode and power buttons.
- Refresh every 3 to 30 minutes (5 by default) within the limits of the
  Ariston NET service: one request per appliance, one request at a time, a
  pause as long as the service asks when it blocks the account.
- Every text in English, French, German and Spanish, and the user guide in the
  four languages.

[Unreleased]: https://github.com/guim31/gladys-ariston/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/guim31/gladys-ariston/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/guim31/gladys-ariston/releases/tag/v1.0.1
