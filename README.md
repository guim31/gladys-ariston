# Ariston NET for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that brings the **boilers,
heat pumps and water heaters of the Ariston group** (Ariston, Chaffoteaux, Elco) into Gladys through the
**Ariston NET** cloud (remotethermo), the service behind the Ariston NET and Chaffoteaux apps.

> **Developed without the hardware: feedback welcome.** The code is tested against answers reconstructed
> from the reference library (see [Limitations](#limitations)); please report what your appliance does.

## Features

- **Boilers and heat pumps** ("Galevo" system: Genus One, Alteas One, Nimbus, Chaffoteaux INOA, Thision
  S…): system mode (summer, winter, heating only, cooling, off, holiday — what the plant offers), hot water
  setpoint and temperature, burner and heat pump state, heating pressure, outside and flow temperatures,
  faults, last month's gas and electricity consumption (optional).
- **One device per heating zone**: room temperature, comfort setpoint (within the zone's own range and
  step), mode (off / heating / cooling / Auto = the app's schedule), heat demand.
- **Water heaters** (Velis Evo, Lux, Lux 2, Lydos, Lydos Hybrid, Nuos Split, Andris 2): on/off, water
  temperature, setpoint, mode (iMemory, Green, Program, Boost, Manual… mapped onto the Gladys water heater
  modes), heating, showers available.
- **Dashboard widget** "Ariston": one zone, the boiler or a water heater, with setpoint and mode buttons.
- **Scene trigger** "Ariston fault detected": fires once per new fault code, with the code, its description
  and whether it is blocking.
- Four languages (English, French, German, Spanish) for every text and the documentation.

## Requirements

- Gladys Assistant **5.1.0** or later.
- An appliance already working in the Ariston NET (or Chaffoteaux) app, and the email and password of that
  account. The cloud is reached over the internet (`transports: cloud`).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and give this repository (or install it from the
   catalog once listed).
2. In **Configuration**, enter the email and password of the Ariston NET account, then **Test the
   connection**.
3. Open the **Discovery** tab and add the appliances you want.

The user guide is in [`docs/en.md`](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md));
Gladys links it from the Configuration screen.

## How it works

- The integration logs in with the account (`accounts/login`), lists the plants (`remote/plants`,
  `velis/plants`) and reads each appliance with **one request per refresh**: the `dataItems` of a Galevo
  plant (plant and every zone at once), the `plantData` of a water heater.
- **Rate limits.** Since May 2024 the cloud answers `429 Requests are blocked for N seconds` to busy
  accounts, and Ariston support states that it does not support third-party use of its API. So: one request
  at a time, at least one second apart; on a 429, no request until the block is over; refresh every
  5 minutes by default (3 at the fastest); faults every 30 minutes; water heater settings and consumption
  every 6 hours; only the appliances added to Gladys are read. An expired token (HTTP 405) triggers one new
  login. The token is kept under `/data` so that restarts do not log in again.
- **Refreshing does not rely on the core**: Gladys does not reliably poll external devices
  (GladysAssistant/Gladys#3198), so the container runs its own timer and the core's `onPoll` is only a
  fallback. Only changed values are published, with a 12-hour heartbeat.
- **Commands** are checked against the appliance's own range, step and offered modes before anything is
  sent; nothing that opens, unlocks or disarms exists on these appliances.

## Limitations

- **Developed without the hardware nor a real account.** No real answer of the Ariston NET cloud is
  published under a licence that allows reusing it, and the cloud is not reachable from the development
  environment: the fixtures (`test/fixtures/ariston/`) are reconstructed from the field names and codes of
  the reference library. `scripts/probe.mjs` checks the real login path (with an invented account, it must be
  refused) and, with a real account, prints the shape of the real answers, read-only.
- Elco / Remocon heat pumps of the **BSB** system are not supported yet: they are listed as unsupported.
- No schedule editing (the app's schedule is followed in Auto), no Velis Evo shower count, no advanced
  settings (anti-legionella, heating curve, Lydos Hybrid night mode).
- The consumption is last month's report, not a real-time meter.
- Some mode mappings are choices: iMemory = Auto, Green = Eco, Velis Evo "Night" = Eco, Nuos Split
  "Comfort" = Manual and "Fast" = Boost; a zone in "manual night" shows as Heating.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test: fake Gladys (SDK) + fake Ariston NET cloud
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
node scripts/probe.mjs                           # real cloud, invented account: must be refused
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            handlers: discovery, commands, poll, action, widget
src/hub.js            login, discovery, refresh timer, states, faults trigger
src/devices.js        Ariston appliances -> Gladys devices and states
src/commands.js       Gladys commands -> Ariston NET writes, with range checks
src/widgets.js        "Ariston" dashboard widget
src/ariston/client.js HTTP client of the cloud (single queue, 429 and 405 handling)
src/ariston/model.js  reading the cloud's answers, families and mode mappings
src/store.js          token and plant layouts under /data
test/                 node --test; test/fixtures/ariston/ (reconstructed answers)
```

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="ariston" \
ARISTON_DATA_DIR=./data \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit the versions by hand. A
hand-pushed `vX.Y.Z` tag also builds the image and the GitHub Release, but then `version` in `package.json`
and in the manifest (with the `docker_image` tag) must be bumped and committed before tagging. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [python-ariston-api](https://github.com/fustom/python-ariston-api) by fustom and contributors (MIT): the
  endpoints, payloads, field names and mode codes of the Ariston NET API come from it.
- [ariston-remotethermo-home-assistant-v3](https://github.com/fustom/ariston-remotethermo-home-assistant-v3)
  by fustom (MIT): how the zones, modes and water heaters are presented, the refresh intervals chosen after
  the 2024 rate limits.
- [ariston_net](https://github.com/mauropriori/ariston_net) and its
  [library fork](https://github.com/mauropriori/python-ariston-api) by mauropriori (MIT): request
  serialization and spacing, the `blocked for N seconds` parsing, no immediate retry of 5xx, optional reads
  that must not fail the main one, the Lydos Hybrid modes garbled at the end of a boost.
- The earlier work of [chomupashchuk](https://github.com/chomupashchuk/ariston-remotethermo-home-assistant-v2).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Ariston Group (Ariston, Chaffoteaux, Elco).
The names are the trademarks of their owners and are used only to say which appliances work.

## License

Apache-2.0 — see [LICENSE](LICENSE).
