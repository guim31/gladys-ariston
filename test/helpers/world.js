// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake Ariston NET cloud, a
// temporary /data, and the integration wired on top through registerHandlers.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ACCOUNT, createFakeCloud } from './fakeCloud.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config (the account is added)
 * @param {object} [options.cloud] from createFakeCloud
 * @param {Array} [options.gladysDevices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] run the hub's refresh timer
 * @param {() => number} [options.now]
 * @param {string} [options.dataDir]
 */
export async function createWorld({
  config = {},
  cloud = createFakeCloud(),
  gladysDevices = [],
  connect = true,
  timers = false,
  now,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-ariston-')),
} = {}) {
  const gladys = createFakeGladys({
    config: { ...ACCOUNT, ...config },
    devices: gladysDevices,
  });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: cloud.fetch,
    timers,
    now,
    clientOptions: { spacingMs: 0, sleep: async () => {} },
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, cloud, app, hub: app.hub, store, dataDir };
}

/** Creates every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.gladys.fake.discoveredDevices) {
    await world.gladys.fake.deviceCreated(device);
  }
}

/** The discovered device with this external id. */
export function discovered(world, externalId) {
  return world.gladys.fake.discoveredDevices.find((device) => device.external_id === externalId);
}

/** Captures the integration's log lines (console) while `run` runs. */
export async function captureLogs(run) {
  const lines = [];
  const original = { log: console.log, error: console.error, level: process.env.LOG_LEVEL };
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  process.env.LOG_LEVEL = 'debug';
  try {
    await run();
  } finally {
    console.log = original.log;
    console.error = original.error;
    process.env.LOG_LEVEL = original.level;
  }
  return lines;
}
