// -----------------------------------------------------------------------------
// What the cloud's answers mean (src/ariston/model.js), on the fixtures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  THERMOSTAT_MODE,
  WATER_HEATER_FAMILIES,
  WATER_HEATER_MODE,
  ZONE_MODE,
  classifyPlant,
  galevoHasDhw,
  gladysModeToWaterHeater,
  gladysModeToZone,
  readEnergyAccount,
  readFaults,
  readGalevo,
  readWaterHeater,
  waterHeaterMaxSetpoint,
  zoneGladysModes,
  zoneModeToGladys,
} from '../src/ariston/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ariston/${name}`, import.meta.url), 'utf8'));

test('sorts the plants: Galevo boilers, Velis water heaters, the rest unsupported', () => {
  const [genus, nimbus, bsb] = fixture('remote-plants.json').map(classifyPlant);
  assert.equal(genus.kind, 'galevo');
  assert.equal(genus.name, 'Chaudière');
  assert.equal(genus.firmware, '1.2.30');
  assert.equal(nimbus.kind, 'galevo');
  assert.equal(bsb.kind, 'unsupported', 'the BSB system is not supported yet');

  const heaters = fixture('velis-plants.json').map(classifyPlant);
  assert.deepEqual(
    heaters.map((heater) => heater.family.key),
    ['lydos_hybrid', 'lux', 'nuos_split', 'velis_evo'],
  );
  assert.equal(classifyPlant({ gw: 'X', sys: 4, wheType: 99 }).kind, 'unsupported');
  assert.equal(classifyPlant({ sys: 3 }).kind, 'unsupported', 'no gateway id, no device');
  assert.equal(classifyPlant({ gw: 'X', sys: 3, name: '  ' }).name, 'X', 'name falls back on gw');
});

test('reads a Genus One boiler: plant, hot water, one zone', () => {
  const features = fixture('features-genus-one.json');
  const reading = readGalevo(features, fixture('dataitems-genus-one.json'));
  assert.equal(galevoHasDhw(features), true);
  assert.equal(reading.plantMode, 'winter');
  assert.deepEqual(reading.plantModeOptions, ['summer', 'winter', 'off']);
  assert.equal(reading.cooling, false);
  assert.equal(reading.flame, true);
  assert.equal(reading.heatPump, null, 'no heat pump on a gas boiler');
  assert.equal(reading.pressure, 1.4);
  assert.equal(reading.outsideTemperature, 9.5);
  assert.equal(reading.flowTemperature, 55);
  assert.equal(reading.dhwTemperature, null, 'a probe at its maximum is not fitted');
  assert.equal(reading.dhwTarget, 50);
  assert.deepEqual(reading.dhwTargetRange, { min: 36, max: 60, step: 1 });
  assert.equal(reading.zones.length, 1);
  const [zone] = reading.zones;
  assert.deepEqual(
    { ...zone },
    {
      num: 1,
      name: null,
      temperature: 19.6,
      target: 20.5,
      targetRange: { min: 10, max: 30, step: 0.5 },
      mode: ZONE_MODE.TIME_PROGRAM,
      modeOptions: [0, 2, 3],
      heatRequest: true,
    },
  );
});

test('reads a Nimbus heat pump: cooling, two named zones, a hot water tank', () => {
  const reading = readGalevo(fixture('features-nimbus.json'), fixture('dataitems-nimbus.json'));
  assert.equal(reading.plantMode, 'cooling');
  assert.equal(reading.cooling, true);
  assert.equal(reading.heatPump, true);
  assert.equal(reading.dhwTemperature, 48.3);
  assert.deepEqual(
    reading.zones.map((zone) => zone.name),
    ['Rez-de-chaussée', 'Étage'],
  );
});

test('an answer without items reads as nothing known, never as zeros', () => {
  const reading = readGalevo(fixture('features-genus-one.json'), {});
  assert.equal(reading.plantMode, null);
  assert.equal(reading.pressure, null);
  assert.equal(reading.zones[0].temperature, null);
  assert.equal(reading.zones[0].heatRequest, null);
  assert.deepEqual(reading.zones[0].targetRange, { min: 5, max: 30, step: 0.5 });
});

test('zone modes: Ariston to Gladys and back, within the modes the zone offers', () => {
  assert.equal(zoneModeToGladys(ZONE_MODE.OFF, false), THERMOSTAT_MODE.OFF);
  assert.equal(zoneModeToGladys(ZONE_MODE.MANUAL, false), THERMOSTAT_MODE.HEATING);
  assert.equal(zoneModeToGladys(ZONE_MODE.MANUAL_NIGHT, true), THERMOSTAT_MODE.COOLING);
  assert.equal(zoneModeToGladys(ZONE_MODE.TIME_PROGRAM, false), THERMOSTAT_MODE.AUTO);
  assert.equal(zoneModeToGladys(-1, false), null);

  assert.equal(gladysModeToZone(THERMOSTAT_MODE.OFF, [0, 2, 3]), ZONE_MODE.OFF);
  assert.equal(gladysModeToZone(THERMOSTAT_MODE.HEATING, [0, 2, 3]), ZONE_MODE.MANUAL);
  assert.equal(
    gladysModeToZone(THERMOSTAT_MODE.HEATING, [0, 1, 2, 3]),
    ZONE_MODE.MANUAL_NIGHT,
    'manual-night preferred, as the Home Assistant integration does',
  );
  assert.equal(gladysModeToZone(THERMOSTAT_MODE.AUTO, [0, 2, 3]), ZONE_MODE.TIME_PROGRAM);
  assert.equal(gladysModeToZone(THERMOSTAT_MODE.OFF, [2, 3]), null, 'off not offered');
  assert.equal(gladysModeToZone(7, [0, 2, 3]), null);

  assert.deepEqual(zoneGladysModes([0, 2, 3], false), [0, 1, 3]);
  assert.deepEqual(zoneGladysModes([0, 1, 2, 3], true), [0, 1, 2, 3]);
  assert.deepEqual(zoneGladysModes([], false), []);
});

test('water heaters: state, modes mapped onto the Gladys modes, both ways', () => {
  const lydos = WATER_HEATER_FAMILIES[2];
  const reading = readWaterHeater(lydos, fixture('se-plantdata.json'));
  assert.deepEqual(reading, {
    on: true,
    temperature: 51,
    target: 53,
    mode: WATER_HEATER_MODE.AUTO,
    heating: true,
    showers: 3,
    eco: null,
    remaining: null,
    antiLegionella: null,
  });
  assert.equal(gladysModeToWaterHeater(lydos, WATER_HEATER_MODE.ECO), 2, 'Green');
  assert.equal(gladysModeToWaterHeater(lydos, WATER_HEATER_MODE.BOOST), 7);
  assert.equal(gladysModeToWaterHeater(lydos, WATER_HEATER_MODE.MANUAL), null);
  assert.equal(waterHeaterMaxSetpoint(lydos, fixture('se-plantsettings.json')), 62);

  const nuos = WATER_HEATER_FAMILIES[4];
  const nuosReading = readWaterHeater(nuos, fixture('slp-plantdata.json'));
  assert.equal(nuosReading.temperature, 47.5);
  assert.equal(nuosReading.target, 55);
  assert.equal(nuosReading.mode, WATER_HEATER_MODE.ECO, 'Green');
  assert.equal(nuosReading.heating, null);
  assert.equal(nuosReading.showers, null);

  const evo = WATER_HEATER_FAMILIES[1];
  const evoReading = readWaterHeater(evo, fixture('pd-plantdata-evo.json'));
  assert.equal(evoReading.on, false);
  assert.equal(evoReading.mode, WATER_HEATER_MODE.ECO, 'Night is heating on off-peak hours');
  assert.equal(evoReading.target, null, 'a Velis Evo is set in showers, not degrees');
  assert.equal(waterHeaterMaxSetpoint(evo, {}), null);

  // Lux and Lux 2 do not share their modes: Lux has a Boost, Lux 2 has not.
  assert.ok(Object.values(WATER_HEATER_FAMILIES[8].modes).includes(WATER_HEATER_MODE.BOOST));
  assert.ok(!Object.values(WATER_HEATER_FAMILIES[7].modes).includes(WATER_HEATER_MODE.BOOST));
});

test('a mode the cloud garbles (end of a Lydos boost) reads as unknown, not as a mode', () => {
  const lydos = WATER_HEATER_FAMILIES[2];
  for (const mode of [null, 0, 42, '1', true, [], {}]) {
    assert.equal(readWaterHeater(lydos, { mode }).mode, null, JSON.stringify(mode));
  }
});

test('faults: de-duplicated by code, with their description and blocking flag', () => {
  assert.deepEqual(readFaults(fixture('bus-errors-none.json')), []);
  const list = [...fixture('bus-errors-501.json'), ...fixture('bus-errors-501.json')];
  assert.deepEqual(readFaults(list), [
    { code: '501', description: 'Pas de flamme détectée', blocking: true },
  ]);
  assert.deepEqual(readFaults([{ code: null }, { errDex: 'no code' }]), []);
  assert.deepEqual(readFaults(null), []);
});

test('last month consumption: heating and hot water, gas and electricity', () => {
  assert.deepEqual(readEnergyAccount(fixture('energy-account.json')), {
    heatingGas: 412.6,
    heatingElectricity: 18.2,
    dhwGas: 96.4,
    dhwElectricity: 4.1,
  });
  assert.deepEqual(readEnergyAccount({}), {
    heatingGas: null,
    heatingElectricity: null,
    dhwGas: null,
    dhwElectricity: null,
  });
});

test('Med water heaters: Eco, time left to heat, anti-legionella cycle (t/10385/267)', () => {
  const lux = WATER_HEATER_FAMILIES[8];
  const data = { ...fixture('med-plantdata-lux.json'), eco: true, antiLeg: true, rmTm: '01:25:00' };
  const reading = readWaterHeater(lux, data);
  assert.equal(reading.eco, true);
  assert.equal(reading.antiLegionella, true);
  assert.equal(reading.remaining, 85);
  assert.equal(readWaterHeater(lux, { ...data, rmTm: 'garbage' }).remaining, null);
  assert.equal(readWaterHeater(lux, { ...data, eco: undefined }).eco, null);
});
