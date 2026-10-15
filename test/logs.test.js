// -----------------------------------------------------------------------------
// Quiet logs (Guilhem's rule): nothing at info for a normal reading cycle; the
// info level keeps the lifecycle, a repeated failure writes one line when it
// starts and one when it ends; no secret of the configuration ever appears.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT, GW, createFakeCloud } from './helpers/fakeCloud.js';
import { captureLogs, createAll, createWorld, discovered } from './helpers/world.js';

const id = (suffix) => `ext:test-integration:${suffix}`;
const MINUTE = 60 * 1000;
const atLevel = (lines, level) => lines.filter((line) => line.includes(`[${level}]`));

function clock() {
  const time = { now: 1_800_000_000_000 };
  time.read = () => time.now;
  return time;
}

test('a normal reading cycle writes nothing at info level', async () => {
  const time = clock();
  const cloud = createFakeCloud();
  const w = await createWorld({ cloud, now: time.read });
  try {
    await createAll(w);
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    const heater = discovered(w, id(`water_heater:${GW.LYDOS_HYBRID}`));
    const lines = await captureLogs(async () => {
      for (let i = 0; i < 3; i += 1) {
        cloud.item(GW.GENUS, 'ZoneMeasuredTemp', 1).value = 19 + i;
        time.now += 31 * MINUTE; // faults read too
        await w.gladys.fake.poll(zone);
        await w.gladys.fake.poll(heater);
        await w.hub.pollAll();
      }
    });
    assert.ok(atLevel(lines, 'DEBUG').length > 0, 'the cycle is visible in debug');
    assert.deepEqual(
      lines.filter((line) => /\[(INFO|WARN|ERROR)\]/.test(line)),
      [],
      'nothing above debug',
    );
  } finally {
    await w.app.stop();
  }
});

test('a failure that repeats is said once, and its end once', async () => {
  const time = clock();
  const cloud = createFakeCloud({ plants: [GW.GENUS] });
  const w = await createWorld({ cloud, now: time.read });
  try {
    await createAll(w);
    const zone = discovered(w, id(`zone:${GW.GENUS}-1`));
    const lines = await captureLogs(async () => {
      cloud.down = { status: 503, body: { message: 'unavailable' } };
      for (let i = 0; i < 4; i += 1) {
        time.now += 5 * MINUTE;
        await w.gladys.fake.poll(zone);
      }
      cloud.down = null;
      time.now += 5 * MINUTE;
      await w.gladys.fake.poll(zone);
      time.now += 5 * MINUTE;
      await w.gladys.fake.poll(zone);
    });
    const warnings = atLevel(lines, 'WARN');
    assert.equal(warnings.length, 1, warnings.join('\n'));
    assert.match(warnings[0], /HTTP 503/);
    const infos = atLevel(lines, 'INFO');
    assert.equal(infos.length, 1, infos.join('\n'));
    assert.match(infos[0], /read again/);

    // The Configuration screen said it, then said it was over.
    const statuses = w.gladys.fake.connectionStatuses.slice(-2);
    assert.equal(statuses[0].connected, false);
    assert.match(statuses[0].message.fr, /injoignable/);
    assert.equal(statuses[1].connected, true);
  } finally {
    await w.app.stop();
  }
});

test('a user command is one info line', async () => {
  const w = await createWorld({ cloud: createFakeCloud({ plants: [GW.GENUS] }) });
  try {
    await createAll(w);
    const device = discovered(w, id(`zone:${GW.GENUS}-1`));
    const feature = device.features.find((f) => f.type === 'target-temperature');
    const lines = await captureLogs(() => w.gladys.fake.setValue(device, feature, 21));
    const infos = atLevel(lines, 'INFO');
    assert.equal(infos.length, 1, infos.join('\n'));
    assert.match(infos[0], /zone 1 setpoint 21 °C/);
  } finally {
    await w.app.stop();
  }
});

test('no secret of the configuration appears in the logs, whatever happens', async () => {
  const time = clock();
  const cloud = createFakeCloud();
  const lines = await captureLogs(async () => {
    const w = await createWorld({ cloud, now: time.read });
    try {
      await createAll(w);
      cloud.expireTokens();
      time.now += 5 * MINUTE;
      await w.hub.pollAll();
      cloud.queued.push({ status: 429, body: 'Requests are blocked for 66 seconds' });
      time.now += 5 * MINUTE;
      await w.hub.pollAll();
      cloud.password = 'changed';
      cloud.expireTokens();
      time.now += 5 * MINUTE;
      await w.hub.pollAll();
      await w.gladys.fake.action('test_connection');
      await w.gladys.fake.configUpdated({ ...ACCOUNT, password: 'An0ther-Secret' });
    } finally {
      await w.app.stop();
    }
  });
  const all = lines.join('\n');
  assert.ok(lines.length > 10);
  for (const secret of [ACCOUNT.password, 'An0ther-Secret', 'token-1', 'token-2', 'token-3']) {
    assert.ok(!all.includes(secret), `"${secret}" found in the logs`);
  }
  assert.ok(!all.includes(ACCOUNT.username), 'the email address is not logged either');
});

test('the start and the connection are said at info level, once', async () => {
  const lines = await captureLogs(async () => {
    const w = await createWorld();
    await w.app.stop();
  });
  const infos = atLevel(lines, 'INFO');
  assert.ok(infos.some((line) => /Connected to Ariston NET: 6 appliance\(s\)/.test(line)));
  assert.ok(infos.some((line) => /"Elco Aerotop" \(system 5\) is not supported yet/.test(line)));
  assert.ok(infos.length <= 4, infos.join('\n'));
});
