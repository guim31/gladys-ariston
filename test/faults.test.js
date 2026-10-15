// -----------------------------------------------------------------------------
// Faults: a text state on the appliance, and the "fault detected" scene
// trigger, fired once per new code — never for a fault already there when the
// integration starts, never again while it lasts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAULT_TRIGGER } from '../src/hub.js';
import { GW, createFakeCloud } from './helpers/fakeCloud.js';
import { createAll, createWorld, discovered } from './helpers/world.js';

const id = (suffix) => `ext:test-integration:${suffix}`;
const MINUTE = 60 * 1000;
const fault501 = JSON.parse(
  readFileSync(new URL('./fixtures/ariston/bus-errors-501.json', import.meta.url), 'utf8'),
);

function clock() {
  const time = { now: 1_800_000_000_000 };
  time.read = () => time.now;
  return time;
}

test('a new fault fires the trigger once and shows in the faults text', async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read });
  try {
    await createAll(w);
    const faults = id(`plant:${GW.GENUS}:faults`);
    assert.equal(w.gladys.fake.lastState(faults), 'Aucun défaut');

    cloud.state.faults[GW.GENUS] = fault501;
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    time.now += 30 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(w.gladys.fake.lastState(faults), '501 – Pas de flamme détectée');
    assert.deepEqual(w.gladys.fake.sceneEvents, [
      {
        key: FAULT_TRIGGER,
        data: {
          device: id(`plant:${GW.GENUS}`),
          code: '501',
          appliance: 'Chaudière',
          description: 'Pas de flamme détectée',
          blocking: true,
        },
      },
    ]);

    // Still there 30 minutes later: no second event.
    time.now += 30 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(w.gladys.fake.sceneEvents.length, 1);

    // Gone, then back: a new event.
    cloud.state.faults[GW.GENUS] = [];
    time.now += 30 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(w.gladys.fake.lastState(faults), 'Aucun défaut');
    cloud.state.faults[GW.GENUS] = fault501;
    time.now += 30 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(w.gladys.fake.sceneEvents.length, 2);
  } finally {
    await w.app.stop();
  }
});

test('a fault already present at startup does not fire (no event at each restart)', async () => {
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  cloud.state.faults[GW.GENUS] = fault501;
  const w = await createWorld({ cloud });
  try {
    await createAll(w);
    assert.equal(
      w.gladys.fake.lastState(id(`plant:${GW.GENUS}:faults`)),
      '501 – Pas de flamme détectée',
    );
    assert.deepEqual(w.gladys.fake.sceneEvents, []);
  } finally {
    await w.app.stop();
  }
});

test('the faults are localized by the cloud in the configured language', async () => {
  const cloud = createFakeCloud({ plants: [GW.LUX] });
  const w = await createWorld({ cloud, config: { language: 'de' } });
  try {
    const call = cloud.requests.find((r) => r.path.startsWith('busErrors'));
    assert.match(call.path, /culture=de-DE$/);
  } finally {
    await w.app.stop();
  }
});

test('with the faults disabled, no feature, no request', async () => {
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, config: { faults: false } });
  try {
    assert.equal(cloud.requests.filter((r) => r.path.startsWith('busErrors')).length, 0);
    const features = discovered(w, id(`plant:${GW.GENUS}`)).features.map((f) => f.external_id);
    assert.ok(!features.includes(id(`plant:${GW.GENUS}:faults`)));
  } finally {
    await w.app.stop();
  }
});
