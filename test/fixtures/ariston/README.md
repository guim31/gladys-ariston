# Ariston NET fixtures

**Reconstructed, not captured.** No real Ariston NET answer is published with a
licence that allows copying it (the reference library,
[fustom/python-ariston-api](https://github.com/fustom/python-ariston-api), MIT,
ships no test data, and the cloud is not reachable from the development
session). These files follow the field names, codes and shapes that library
reads and writes (`ariston/const.py`, `ariston/*_device.py`), with invented
values:

| File                    | Endpoint                                      | Appliance                                                 |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `remote-plants.json`    | `GET remote/plants`                           | a Genus One boiler, a Nimbus heat pump, an Elco BSB plant |
| `velis-plants.json`     | `GET velis/plants`                            | Lydos Hybrid, Velis Lux, Nuos Split, Velis Evo            |
| `features-*.json`       | `GET remote/plants/<gw>/features`             | zones and capabilities of the two Galevo plants           |
| `dataitems-*.json`      | `POST remote/dataItems/<gw>/get`              | plant and zone data items                                 |
| `se-*.json`             | `GET velis/sePlantData/<gw>[/plantSettings]`  | Lydos Hybrid                                              |
| `med-*.json`            | `GET velis/medPlantData/<gw>[/plantSettings]` | Velis Lux                                                 |
| `slp-*.json`            | `GET velis/slpPlantData/<gw>[/plantSettings]` | Nuos Split                                                |
| `pd-plantdata-evo.json` | `GET velis/plantData/<gw>`                    | Velis Evo (shower-based)                                  |
| `bus-errors-*.json`     | `GET busErrors?gatewayId=<gw>`                | no fault, one blocking fault                              |
| `energy-account.json`   | `GET remote/reports/<gw>/energyAccount`       | last month's gas and electricity                          |

Gateway ids and serial numbers are invented. `DhwStorageTemperature` at its
maximum (655.35) in `dataitems-genus-one.json` is the library's sign of a probe
that is not fitted: the integration must not create that sensor.

`scripts/probe.mjs`, run with a real account, prints the shape of the real
answers (keys and types, no values): compare it with these files and correct
them when they differ.
