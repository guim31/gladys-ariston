// -----------------------------------------------------------------------------
// Commands from Gladys, end to end: the fake Gladys calls onSetValue, the
// integration writes to the fake cloud. Each test checks the request the
// official app would send, the state published back, and that a value out of
// the appliance's range, or a mode it does not offer, never reaches the cloud.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GW } from './helpers/fakeCloud.js';
import { createAll, createWorld, discovered } from './helpers/world.js';

const id = (suffix) => `ext:test-integration:${suffix}`;

async function world(config) {
  const w = await createWorld({ config });
  await createAll(w);
  return w;
}

/** Runs onSetValue for one feature of a discovered device. */
async function set(w, deviceId, featureKey, value) {
  const device = discovered(w, id(deviceId));
  const feature = device.features.find(
    (f) => f.external_id === `${device.external_id}:${featureKey}`,
  );
  assert.ok(feature, `${deviceId}:${featureKey} exists`);
  return w.gladys.fake.setValue(device, feature, value);
}

const writes = (w) =>
  w.cloud.requests.filter(
    (request) =>
      request.method === 'POST' &&
      !request.path.endsWith('/get?umsys=si') &&
      request.path !== 'accounts/login',
  );

test('a zone setpoint is written as ZoneComfortTemp, previous value along', async () => {
  const w = await world();
  try {
    const ack = await set(w, `zone:${GW.GENUS}-1`, 'target', 21.5);
    assert.deepEqual(ack, { success: true });
    assert.deepEqual(writes(w).at(-1), {
      ...writes(w).at(-1),
      path: `remote/dataItems/${GW.GENUS}/set?umsys=si`,
      body: {
        items: [{ id: 'ZoneComfortTemp', prevValue: 20.5, value: 21.5, zone: 1 }],
        features: w.cloud.state.features[GW.GENUS],
      },
    });
    assert.equal(w.gladys.fake.lastState(id(`zone:${GW.GENUS}-1:target`)), 21.5);
  } finally {
    await w.app.stop();
  }
});

test('a setpoint is rounded to the appliance step; out of its range it is refused', async () => {
  const w = await world();
  try {
    await set(w, `zone:${GW.GENUS}-1`, 'target', 21.3);
    assert.equal(writes(w).at(-1).body.items[0].value, 21.5, 'step 0.5');
    const before = writes(w).length;
    const ack = await set(w, `zone:${GW.GENUS}-1`, 'target', 35);
    assert.equal(ack.success, false);
    assert.match(ack.error, /10 à 30 °C/, 'the message says the range, in the configured language');
    assert.equal(writes(w).length, before, 'nothing sent to the cloud');
  } finally {
    await w.app.stop();
  }
});

test('zone modes: off, manual, schedule, among the modes the zone offers', async () => {
  const w = await world();
  try {
    await set(w, `zone:${GW.GENUS}-1`, 'mode', 0);
    assert.deepEqual(writes(w).at(-1).body.items, [
      { id: 'ZoneMode', prevValue: 3, value: 0, zone: 1 },
    ]);
    assert.equal(w.gladys.fake.lastState(id(`zone:${GW.GENUS}-1:mode`)), 0);
    await set(w, `zone:${GW.GENUS}-1`, 'mode', 1);
    assert.equal(writes(w).at(-1).body.items[0].value, 2, 'manual');
    await set(w, `zone:${GW.GENUS}-1`, 'mode', 3);
    assert.equal(writes(w).at(-1).body.items[0].value, 3, 'time program');
    const before = writes(w).length;
    const ack = await set(w, `zone:${GW.GENUS}-1`, 'mode', 2);
    assert.equal(ack.success, false, 'this boiler cannot cool');
    assert.equal(writes(w).length, before);
  } finally {
    await w.app.stop();
  }
});

test('the zone mode feature offers what the zone offers, cooling only on a heat pump', async () => {
  const w = await world();
  try {
    const options = (deviceId) =>
      discovered(w, id(deviceId))
        .features.find((f) => f.type === 'mode')
        .supported_options.map((option) => option.value);
    assert.deepEqual(options(`zone:${GW.GENUS}-1`), [0, 1, 3]);
    assert.deepEqual(options(`zone:${GW.NIMBUS}-1`), [0, 1, 2, 3]);
    assert.equal(w.gladys.fake.lastState(id(`zone:${GW.NIMBUS}-1:mode`)), 2, 'cooling now');
    assert.equal(w.gladys.fake.lastState(id(`zone:${GW.NIMBUS}-1:heat_request`)), 2, 'cooling');
  } finally {
    await w.app.stop();
  }
});

test('the system mode is a select of the modes the plant offers', async () => {
  const w = await world();
  try {
    const feature = discovered(w, id(`plant:${GW.GENUS}`)).features.find(
      (f) => f.type === 'select',
    );
    assert.deepEqual(feature.supported_options, [
      { value: 'summer', label: 'Été (eau chaude seule)' },
      { value: 'winter', label: 'Hiver (chauffage et eau chaude)' },
      { value: 'off', label: 'Arrêt' },
    ]);
    await set(w, `plant:${GW.GENUS}`, 'plant_mode', 'summer');
    assert.deepEqual(writes(w).at(-1).body.items, [
      { id: 'PlantMode', prevValue: 1, value: 0, zone: 0 },
    ]);
    assert.equal(w.gladys.fake.lastState(id(`plant:${GW.GENUS}:plant_mode`)), 'summer');
    const ack = await set(w, `plant:${GW.GENUS}`, 'plant_mode', 'holiday');
    assert.equal(ack.success, false, 'not offered by this plant');
  } finally {
    await w.app.stop();
  }
});

test('the hot water setpoint of a boiler is DhwTemp, within its range', async () => {
  const w = await world();
  try {
    await set(w, `plant:${GW.GENUS}`, 'dhw_target', 55);
    assert.deepEqual(writes(w).at(-1).body.items, [
      { id: 'DhwTemp', prevValue: 50, value: 55, zone: 0 },
    ]);
    const ack = await set(w, `plant:${GW.GENUS}`, 'dhw_target', 70);
    assert.equal(ack.success, false);
  } finally {
    await w.app.stop();
  }
});

test('water heater power: the switch endpoint of its family, with a bare boolean', async () => {
  const w = await world();
  try {
    await set(w, `water_heater:${GW.LYDOS_HYBRID}`, 'power', 0);
    assert.equal(writes(w).at(-1).path, `velis/sePlantData/${GW.LYDOS_HYBRID}/switch`);
    assert.equal(writes(w).at(-1).body, false);
    assert.equal(w.gladys.fake.lastState(id(`water_heater:${GW.LYDOS_HYBRID}:power`)), 0);
    await set(w, `water_heater:${GW.EVO}`, 'power', 1);
    assert.equal(writes(w).at(-1).path, `velis/plantData/${GW.EVO}/switch`);
    assert.equal(writes(w).at(-1).body, true);
  } finally {
    await w.app.stop();
  }
});

test('water heater setpoints: one endpoint per family, bounded by its max setting', async () => {
  const w = await world();
  try {
    await set(w, `water_heater:${GW.LYDOS_HYBRID}`, 'target', 60);
    assert.deepEqual(
      { path: writes(w).at(-1).path, body: writes(w).at(-1).body },
      { path: `velis/sePlantData/${GW.LYDOS_HYBRID}/temperature`, body: { new: 60 } },
    );
    const target = discovered(w, id(`water_heater:${GW.LYDOS_HYBRID}`)).features.find(
      (f) => f.type === 'target-temperature',
    );
    assert.deepEqual([target.min, target.max, target.step], [40, 62, 1]);
    const ack = await set(w, `water_heater:${GW.LYDOS_HYBRID}`, 'target', 65);
    assert.equal(ack.success, false, 'above SeMaxSetpointTemperature');

    await set(w, `water_heater:${GW.LUX}`, 'target', 75);
    assert.equal(writes(w).at(-1).path, `velis/medPlantData/${GW.LUX}/temperature`);

    // The Nuos Split writes comfort and reduced together, the reduced kept.
    await set(w, `water_heater:${GW.NUOS}`, 'target', 58);
    assert.deepEqual(
      { path: writes(w).at(-1).path, body: writes(w).at(-1).body },
      {
        path: `velis/slpPlantData/${GW.NUOS}/temperatures`,
        body: { new: { comfort: 58, reduced: 45 }, old: { comfort: 55, reduced: 45 } },
      },
    );
  } finally {
    await w.app.stop();
  }
});

test('water heater modes: the native code of each family, only the modes it has', async () => {
  const w = await world();
  try {
    await set(w, `water_heater:${GW.LYDOS_HYBRID}`, 'mode', 2);
    assert.deepEqual(
      { path: writes(w).at(-1).path, body: writes(w).at(-1).body },
      { path: `velis/sePlantData/${GW.LYDOS_HYBRID}/mode`, body: { new: 2 } },
    );
    await set(w, `water_heater:${GW.LUX}`, 'mode', 3);
    assert.deepEqual(writes(w).at(-1).body, { new: 9 }, 'Lux boost is 9');
    await set(w, `water_heater:${GW.NUOS}`, 'mode', 1);
    assert.deepEqual(
      { path: writes(w).at(-1).path, body: writes(w).at(-1).body },
      { path: `velis/slpPlantData/${GW.NUOS}/operativeMode`, body: { new: 3 } },
    );
    await set(w, `water_heater:${GW.EVO}`, 'mode', 6);
    assert.deepEqual(
      { path: writes(w).at(-1).path, body: writes(w).at(-1).body },
      { path: `velis/medPlantData/${GW.EVO}/mode`, body: { new: 5 } },
      'the Velis Evo writes its mode on medPlantData, as the app does',
    );
    const before = writes(w).length;
    const ack = await set(w, `water_heater:${GW.LUX}`, 'mode', 1);
    assert.equal(ack.success, false, 'no iMemory on a Lux');
    assert.equal(writes(w).length, before);
    const modes = discovered(w, id(`water_heater:${GW.LYDOS_HYBRID}`))
      .features.find((f) => f.type === 'mode')
      .supported_options.map((option) => option.value);
    assert.deepEqual(modes, [1, 2, 6, 3]);
  } finally {
    await w.app.stop();
  }
});

test('the Velis Evo has no degree setpoint (it is set in showers)', async () => {
  const w = await world();
  try {
    const features = discovered(w, id(`water_heater:${GW.EVO}`)).features.map((f) => f.type);
    assert.ok(!features.includes('target-temperature'));
  } finally {
    await w.app.stop();
  }
});

test('a command for an unknown device fails cleanly', async () => {
  const w = await world();
  try {
    const ack = await w.gladys.fake.setValue(
      { external_id: id('zone:NOPE-1') },
      { external_id: id('zone:NOPE-1:target') },
      20,
    );
    assert.equal(ack.success, false);
  } finally {
    await w.app.stop();
  }
});

test('a write blocked by the rate limit is refused with a clear message', async () => {
  const w = await world();
  try {
    w.cloud.queued.push({ status: 429, body: 'Requests are blocked for 66 seconds' });
    const ack = await set(w, `zone:${GW.GENUS}-1`, 'target', 21);
    assert.equal(ack.success, false);
    assert.match(ack.error, /66 seconds/);
  } finally {
    await w.app.stop();
  }
});

test('the Eco switch of a Med water heater writes switchEco with a bare boolean', async () => {
  const w = await world();
  try {
    await set(w, `water_heater:${GW.LUX}`, 'eco', 1);
    assert.deepEqual(
      { path: writes(w).at(-1).path, body: writes(w).at(-1).body },
      { path: `velis/medPlantData/${GW.LUX}/switchEco`, body: true },
    );
    await set(w, `water_heater:${GW.LUX}`, 'eco', 0);
    assert.equal(writes(w).at(-1).body, false);
  } finally {
    await w.app.stop();
  }
});
