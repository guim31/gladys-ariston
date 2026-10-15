// -----------------------------------------------------------------------------
// The Ariston NET client against the fake cloud: login and token reuse, the
// 405 of an expired token, the 429 "blocked for N seconds", the spacing of
// the requests, and what never leaves the client (password, token) in logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AristonClient,
  ERROR_KIND,
  USER_AGENT,
  accountKey,
  parseBlockSeconds,
} from '../src/ariston/client.js';
import { ACCOUNT, GW, createFakeCloud } from './helpers/fakeCloud.js';
import { captureLogs } from './helpers/world.js';

/** A clock the test moves, and a sleep that moves it. */
function clock(start = 1_000_000) {
  const time = { now: start, slept: [] };
  time.read = () => time.now;
  time.sleep = async (ms) => {
    time.slept.push(ms);
    time.now += ms;
  };
  return time;
}

function memoryTokenStore(initial = {}) {
  const store = { data: initial, saves: 0 };
  store.load = async () => store.data;
  store.save = async (data) => {
    store.data = data;
    store.saves += 1;
  };
  return store;
}

function client(cloud, overrides = {}) {
  const time = overrides.time ?? clock();
  return new AristonClient({
    ...ACCOUNT,
    fetch: cloud.fetch,
    now: time.read,
    sleep: time.sleep,
    ...overrides,
  });
}

test('logs in with the app user agent, then lists the boilers and the water heaters', async () => {
  const cloud = createFakeCloud();
  const plants = await client(cloud).listPlants();
  assert.equal(plants.length, 7);
  const [login] = cloud.requests;
  assert.equal(login.path, 'accounts/login');
  assert.deepEqual(login.body, { usr: ACCOUNT.username, pwd: ACCOUNT.password });
  assert.equal(login.headers['User-Agent'], USER_AGENT);
  assert.equal(login.headers['ar.authToken'], undefined, 'no token sent to log in');
  assert.equal(cloud.requests[1].headers['ar.authToken'], 'token-1');
});

test('keeps the token in the store and reuses it after a restart, without logging in', async () => {
  const cloud = createFakeCloud();
  const tokenStore = memoryTokenStore();
  await client(cloud, { tokenStore }).listPlants();
  assert.equal(cloud.logins, 1);
  assert.deepEqual(tokenStore.data, { account: accountKey(ACCOUNT.username), token: 'token-1' });
  assert.ok(!JSON.stringify(tokenStore.data).includes(ACCOUNT.username), 'no username stored');

  await client(cloud, { tokenStore }).listPlants();
  assert.equal(cloud.logins, 1, 'the stored token is reused');
});

test('ignores a stored token of another account', async () => {
  const cloud = createFakeCloud();
  const tokenStore = memoryTokenStore({ account: accountKey('other@example.com'), token: 'x' });
  await client(cloud, { tokenStore }).listPlants();
  assert.equal(cloud.logins, 1);
  assert.equal(cloud.requests[1].headers['ar.authToken'], 'token-1');
});

test('an expired token (HTTP 405) logs in again once and retries the request', async () => {
  const cloud = createFakeCloud();
  const ariston = client(cloud);
  await ariston.getWaterHeaterData('sePlantData', GW.LYDOS_HYBRID);
  cloud.expireTokens();
  const data = await ariston.getWaterHeaterData('sePlantData', GW.LYDOS_HYBRID);
  assert.equal(data.reqTemp, 53);
  assert.equal(cloud.logins, 2);
  assert.deepEqual(
    cloud.requests.slice(-3).map((request) => request.path),
    ['velis/sePlantData/C0FFEE000001', 'accounts/login', 'velis/sePlantData/C0FFEE000001'],
  );
});

test('refused credentials are an AUTH error, and the password changed is noticed', async () => {
  const cloud = createFakeCloud();
  cloud.password = 'another one';
  await assert.rejects(client(cloud).listPlants(), (err) => err.kind === ERROR_KIND.AUTH);
  assert.equal(cloud.requests.length, 1, 'nothing else asked after a refused login');
});

test('a 429 blocks the whole account for the time the cloud asks, without retrying', async () => {
  const cloud = createFakeCloud();
  const time = clock();
  const ariston = client(cloud, { time });
  await ariston.listPlants();
  const before = cloud.requests.length;
  cloud.queued.push({ status: 429, body: 'Requests are blocked for 66 seconds' });
  await assert.rejects(
    ariston.getPlantFeatures(GW.GENUS),
    (err) => err.kind === ERROR_KIND.RATE_LIMIT && err.retryAfterSeconds === 66,
  );
  assert.equal(cloud.requests.length, before + 1, 'no retry storm');

  // While blocked, nothing leaves the container.
  time.now += 30_000;
  await assert.rejects(ariston.getPlantFeatures(GW.GENUS), (err) => err.kind === 'rate_limit');
  assert.equal(cloud.requests.length, before + 1);
  assert.ok(ariston.blockedForSeconds() > 0);

  // 66 s plus a margin later, the requests go again.
  time.now += 40_000;
  assert.equal(ariston.blockedForSeconds(), 0);
  await ariston.getPlantFeatures(GW.GENUS);
  assert.equal(cloud.requests.length, before + 2);
});

test('the block duration comes from Retry-After, else from the body, else 60 s', () => {
  assert.equal(parseBlockSeconds('12', 'Requests are blocked for 66 seconds'), 12);
  assert.equal(parseBlockSeconds(null, 'Requests are blocked for 66 seconds'), 66);
  assert.equal(parseBlockSeconds(undefined, ''), 60);
  assert.equal(parseBlockSeconds('soon', 'nothing'), 60);
});

test('a 5xx is reported, not retried at once', async () => {
  const cloud = createFakeCloud();
  const ariston = client(cloud);
  await ariston.listPlants();
  const before = cloud.requests.length;
  cloud.queued.push({ status: 503, body: { message: 'Service unavailable' } });
  await assert.rejects(
    ariston.getEnergyAccount(GW.GENUS),
    (err) => err.kind === ERROR_KIND.HTTP && err.status === 503,
  );
  assert.equal(cloud.requests.length, before + 1);
});

test('a network failure is a NETWORK error', async () => {
  const cloud = createFakeCloud();
  cloud.down = 'network';
  await assert.rejects(client(cloud).listPlants(), (err) => err.kind === ERROR_KIND.NETWORK);
});

test('a 404 is "nothing here", not an error', async () => {
  const cloud = createFakeCloud();
  assert.deepEqual(await client(cloud).getEnergyAccount('UNKNOWN'), {});
});

test('requests go one at a time, one second apart at least', async () => {
  const cloud = createFakeCloud();
  const time = clock();
  const ariston = client(cloud, { time, spacingMs: 1000 });
  await Promise.all([
    ariston.getWaterHeaterData('sePlantData', GW.LYDOS_HYBRID),
    ariston.getWaterHeaterData('medPlantData', GW.LUX),
    ariston.getWaterHeaterData('slpPlantData', GW.NUOS),
  ]);
  // login, then three reads: each waits for the previous one plus the gap.
  assert.equal(cloud.requests.length, 4);
  assert.deepEqual(time.slept, [1000, 1000, 1000]);
});

test('neither the password nor the token reach the logs, even in debug', async () => {
  const cloud = createFakeCloud();
  const lines = await captureLogs(async () => {
    const ariston = client(cloud);
    await ariston.listPlants();
    cloud.expireTokens();
    await ariston.listPlants();
    cloud.password = 'wrong';
    cloud.expireTokens();
    await ariston.listPlants().catch(() => {});
  });
  assert.ok(lines.length > 0, 'debug lines were written');
  const all = lines.join('\n');
  assert.ok(!all.includes(ACCOUNT.password), 'password logged');
  assert.ok(!all.includes('token-1') && !all.includes('token-2'), 'token logged');
  assert.ok(!all.includes(ACCOUNT.username), 'username logged');
});
