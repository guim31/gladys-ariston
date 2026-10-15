// -----------------------------------------------------------------------------
// Refreshing. The core does not reliably poll external devices
// (GladysAssistant/Gladys#3198), so the integration refreshes on its own
// timer; the core's onPoll is a fallback that does nothing while the timer
// keeps up. Only the devices the user added are read, only the changed
// values are published, with a 12-hour heartbeat.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMINGS } from '../src/hub.js';
import { GW, createFakeCloud } from './helpers/fakeCloud.js';
import { createAll, createWorld, discovered } from './helpers/world.js';

const id = (suffix) => `ext:test-integration:${suffix}`;
const MINUTE = 60 * 1000;

/** Lets the async work started by a timer finish. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function clock() {
  const time = { now: 1_800_000_000_000 };
  time.read = () => time.now;
  return time;
}

const dataReads = (cloud, gw) =>
  cloud.requests.filter((r) => r.path === `remote/dataItems/${gw}/get?umsys=si`).length;

test('the states refresh on the integration timer, without any onPoll from the core', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, timers: true, now: time.read });
  try {
    await createAll(w);
    const temperature = id(`zone:${GW.GENUS}-1:temperature`);
    assert.equal(w.gladys.fake.lastState(temperature), 19.6);

    cloud.item(GW.GENUS, 'ZoneMeasuredTemp', 1).value = 20.2;
    time.now += 5 * MINUTE;
    t.mock.timers.tick(5 * MINUTE);
    await settle();
    assert.equal(w.gladys.fake.lastState(temperature), 20.2, 'read again by the timer');

    cloud.item(GW.GENUS, 'ZoneMeasuredTemp', 1).value = 20.6;
    time.now += 5 * MINUTE;
    t.mock.timers.tick(5 * MINUTE);
    await settle();
    assert.equal(w.gladys.fake.lastState(temperature), 20.6, 'and again, every period');
    const polls = w.gladys.fake.wsMessages.filter((message) => message.type.includes('poll'));
    assert.deepEqual(polls, [], 'the core never had to poll');
  } finally {
    await w.app.stop();
  }
});

test('the refresh pace follows the configuration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({
    cloud,
    timers: true,
    now: time.read,
    config: { refresh_minutes: '15' },
  });
  try {
    await createAll(w);
    const before = dataReads(cloud, GW.GENUS);
    time.now += 5 * MINUTE;
    t.mock.timers.tick(5 * MINUTE);
    await settle();
    assert.equal(dataReads(cloud, GW.GENUS), before, 'not read after 5 minutes');
    time.now += 10 * MINUTE;
    t.mock.timers.tick(10 * MINUTE);
    await settle();
    assert.equal(dataReads(cloud, GW.GENUS), before + 1, 'read after 15 minutes');
  } finally {
    await w.app.stop();
  }
});

test("the core's onPoll is a fallback: skipped while the timer keeps up", async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read });
  try {
    await createAll(w);
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    const before = dataReads(cloud, GW.GENUS);

    time.now += MINUTE;
    assert.deepEqual(await w.gladys.fake.poll(zone), { success: true });
    assert.equal(dataReads(cloud, GW.GENUS), before, 'read a minute ago: skipped');

    // The timer stalled: past 90 % of a period, the core's poll reads.
    time.now += 4 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(dataReads(cloud, GW.GENUS), before + 1);
  } finally {
    await w.app.stop();
  }
});

test('only the appliances added to Gladys are read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS, GW.LYDOS_HYBRID] });
  const w = await createWorld({ cloud, timers: true, now: time.read });
  try {
    await w.gladys.fake.deviceCreated(discovered(w, id(`water_heater:${GW.LYDOS_HYBRID}`)));
    const genus = dataReads(cloud, GW.GENUS);
    time.now += 5 * MINUTE;
    t.mock.timers.tick(5 * MINUTE);
    await settle();
    assert.equal(dataReads(cloud, GW.GENUS), genus, 'the boiler was not added: not read');
    const lydos = cloud.requests.filter((r) => r.path === `velis/sePlantData/${GW.LYDOS_HYBRID}`);
    assert.equal(lydos.length, 2, 'discovery, then the timer');
  } finally {
    await w.app.stop();
  }
});

test('only the values that changed are published', async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read });
  try {
    await createAll(w);
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    const before = w.gladys.fake.states.length;
    cloud.item(GW.GENUS, 'ZoneMeasuredTemp', 1).value = 21;
    time.now += 5 * MINUTE;
    await w.gladys.fake.poll(zone);
    const published = w.gladys.fake.states.slice(before);
    assert.deepEqual(
      published.map((s) => [s.device_feature_external_id, s.state]),
      [[id(`zone:${GW.GENUS}-1:temperature`), 21]],
    );
  } finally {
    await w.app.stop();
  }
});

test('a stable value is published again at least every 12 hours (heartbeat)', async (t) => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read });
  const options = [];
  const original = w.gladys.publishChangedStates.bind(w.gladys);
  t.mock.method(w.gladys, 'publishChangedStates', (states, opts) => {
    options.push(opts);
    return original(states, opts);
  });
  try {
    await createAll(w);
    assert.ok(options.length > 0);
    for (const opts of options) {
      assert.ok(opts.heartbeat > 0 && opts.heartbeat <= 12 * 60 * MINUTE);
    }
    assert.equal(TIMINGS.heartbeatMs, 12 * 60 * MINUTE);
  } finally {
    await w.app.stop();
  }
});

test('a device added to Gladys gets its states at once, without asking the cloud', async () => {
  const cloud = createFakeCloud({ plants: [GW.LYDOS_HYBRID] });
  const w = await createWorld({ cloud });
  try {
    const requests = cloud.requests.length;
    await w.gladys.fake.deviceCreated(discovered(w, id(`water_heater:${GW.LYDOS_HYBRID}`)));
    assert.equal(cloud.requests.length, requests, 'published from memory');
    assert.equal(w.gladys.fake.lastState(id(`water_heater:${GW.LYDOS_HYBRID}:temperature`)), 51);
    assert.equal(w.gladys.fake.lastState(id(`water_heater:${GW.LYDOS_HYBRID}:mode`)), 1);
    assert.ok(w.gladys.fake.widgetRefreshes.includes('overview'), 'the widget is nudged');
  } finally {
    await w.app.stop();
  }
});

test('the faults are read every 30 minutes, not at every refresh', async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read });
  try {
    await createAll(w);
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    const faultReads = () => cloud.requests.filter((r) => r.path.startsWith('busErrors')).length;
    const before = faultReads();
    for (let i = 0; i < 5; i += 1) {
      time.now += 5 * MINUTE;
      await w.gladys.fake.poll(zone);
    }
    assert.equal(faultReads(), before, '25 minutes: no new read');
    time.now += 5 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(faultReads(), before + 1);
  } finally {
    await w.app.stop();
  }
});

test('the consumption is read only when enabled, every 6 hours', async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read, config: { energy: true } });
  try {
    await createAll(w);
    assert.equal(w.gladys.fake.lastState(id(`plant:${GW.GENUS}:energy_heating_gas`)), 412.6);
    assert.equal(w.gladys.fake.lastState(id(`plant:${GW.GENUS}:energy_dhw_electricity`)), 4.1);
    const energyReads = () =>
      cloud.requests.filter((r) => r.path.endsWith('/energyAccount')).length;
    assert.equal(energyReads(), 1);
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    time.now += 5 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(energyReads(), 1);
    time.now += 6 * 60 * MINUTE;
    await w.gladys.fake.poll(zone);
    assert.equal(energyReads(), 2);
  } finally {
    await w.app.stop();
  }

  const off = await createWorld({ cloud: createFakeCloud({ plants: [GW.GENUS] }) });
  try {
    await createAll(off);
    assert.equal(off.cloud.requests.filter((r) => r.path.endsWith('/energyAccount')).length, 0);
  } finally {
    await off.app.stop();
  }
});

test('a failing consumption report does not stop the temperatures', async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  cloud.state.energy[GW.GENUS] = undefined;
  const w = await createWorld({ cloud, now: time.read, config: { energy: true } });
  try {
    await createAll(w);
    assert.equal(w.gladys.fake.lastState(id(`zone:${GW.GENUS}-1:temperature`)), 19.6);
  } finally {
    await w.app.stop();
  }
});
