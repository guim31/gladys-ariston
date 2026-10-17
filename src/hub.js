// -----------------------------------------------------------------------------
// The hub: reads the Ariston NET cloud, keeps what it read, publishes it.
//
// Refreshing. The devices are published with `should_poll: true` and a poll
// frequency of one minute, but the core cannot be trusted to call onPoll
// (GladysAssistant/Gladys#3198: a device keeps the polling fields it was
// created with). So the hub polls by itself on a timer, at the pace chosen in
// the configuration (5 minutes by default, 3 at the fastest), and the core's
// onPoll is a fallback that only reads a plant not read for 90 % of a period.
//
// Cost, per appliance and per period: ONE request (a Galevo plant reads its
// zones and hot water in the same dataItems call; a water heater reads its
// plantData). On top: the faults every 30 minutes, a water heater's settings
// every 6 hours, the monthly consumption every 6 hours when enabled. Every
// request goes through the client's single queue, one second apart.
//
// States: publishChangedStates (only what changed), with a 12-hour heartbeat
// so a stable value never shows "no recent value". Only the devices the user
// added are read and published: Gladys drops the states of the others.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { AristonClient, ERROR_KIND } from './ariston/client.js';
import {
  classifyPlant,
  galevoHasDhw,
  PLANT_ITEMS,
  readEnergyAccount,
  readFaults,
  readGalevo,
  readWaterHeater,
  WATER_HEATER_MODE,
  ZONE_ITEMS,
} from './ariston/model.js';
import { runCommand } from './commands.js';
import { isConfigured, refreshMs } from './config.js';
import {
  buildDevices,
  buildStates,
  DEVICE_TYPE,
  featureKey,
  parseDeviceId,
  plantIds,
  plantLayout,
  waterHeaterIds,
  zoneIds,
} from './devices.js';
import { MESSAGES, TEXT, pick } from './i18n.js';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'ariston' });

export const FAULT_TRIGGER = 'fault_detected';
export const WIDGET_KEY = 'overview';

const HOUR = 60 * 60 * 1000;
export const TIMINGS = {
  faultsMs: 30 * 60 * 1000,
  settingsMs: 6 * HOUR,
  energyMs: 6 * HOUR,
  heartbeatMs: 12 * HOUR,
};

const CULTURES = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

export class AristonHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch] the cloud transport (tests: a fake cloud)
   * @param {boolean} [options.timers] run the refresh timer (tests turn it off)
   * @param {() => number} [options.now]
   * @param {object} [options.clientOptions] extra AristonClient options (tests: no spacing)
   */
  constructor({ gladys, store, fetch, timers = true, now = () => Date.now(), clientOptions = {} }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetch;
    this.timers = timers;
    this.now = now;
    this.clientOptions = clientOptions;
    this.config = null;
    this.client = null;
    /** @type {Map<string, object>} gateway id -> record */
    this.records = new Map();
    this.unsupported = [];
    this.timer = null;
    this.stopped = false;
    this.inFlight = new Map();
    this.issues = createIssueLog(logger);
    this.statusOk = null;
    this.discovered = false;
    this.starting = Promise.resolve();
  }

  // --- Lifecycle -------------------------------------------------------------

  /**
   * (Re)starts with a configuration: logs in, discovers, reads, publishes.
   * Serialized: a configuration update arriving during a (re)connection waits.
   */
  start(config) {
    const run = this.starting.then(() => this.startNow(config));
    this.starting = run.catch(() => {});
    return run;
  }

  async startNow(config) {
    const credentialsChanged =
      !this.config ||
      this.config.username !== config.username ||
      this.config.password !== config.password;
    this.config = config;
    this.stopped = false;
    clearTimeout(this.timer);
    if (credentialsChanged) {
      this.client = null;
      this.records.clear();
      this.discovered = false;
    }
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for the Ariston NET account');
      await this.publishDevices();
      await this.setStatus(false, TEXT.notConfigured, true);
      return;
    }
    if (!this.client) {
      this.client = new AristonClient({
        username: config.username,
        password: config.password,
        fetch: this.fetch,
        tokenStore: this.store.tokenStore(),
        now: this.now,
        ...this.clientOptions,
      });
    }
    try {
      await this.discover();
    } catch (err) {
      await this.reportFailure('discovery', err);
    }
    this.schedule();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timers || this.stopped || !isConfigured(this.config)) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        if (!this.discovered) {
          await this.discover();
        }
        await this.pollAll();
      } catch (err) {
        await this.reportFailure('discovery', err);
      } finally {
        this.schedule();
      }
    }, refreshMs(this.config));
    this.timer.unref?.();
  }

  // --- Discovery -------------------------------------------------------------

  /** Lists the account's appliances, reads each once, publishes the devices. */
  async discover() {
    const raw = await this.client.listPlants();
    const layouts = (await this.store.get('layouts')) ?? {};
    const seen = new Set();
    this.unsupported = [];
    for (const plant of raw) {
      const info = classifyPlant(plant);
      if (info.kind === 'unsupported') {
        this.unsupported.push(info.name);
        logger.info(`Appliance "${info.name}" (system ${info.sys}) is not supported yet`);
        continue;
      }
      seen.add(info.gw);
      const record = this.records.get(info.gw) ?? { lastPolledAt: null };
      record.info = info;
      if (info.kind === 'galevo') {
        record.plantFeatures = await this.client.getPlantFeatures(info.gw);
        record.hasDhw = galevoHasDhw(record.plantFeatures);
        await this.readRecord(record);
        record.layout = plantLayout(layouts[info.gw], record.reading, record.plantFeatures);
      } else {
        record.settings = await this.client.getWaterHeaterSettings(info.family.plantData, info.gw);
        record.settingsAt = this.now();
        await this.readRecord(record);
      }
      // This read counts: the timer and the core's poll need not read again now.
      record.lastPolledAt = this.now();
      this.records.set(info.gw, record);
    }
    for (const gw of [...this.records.keys()]) {
      if (!seen.has(gw)) {
        this.records.delete(gw);
      }
    }
    const newLayouts = Object.fromEntries(
      [...this.records.values()]
        .filter((record) => record.layout)
        .map((record) => [record.info.gw, record.layout]),
    );
    if (JSON.stringify(newLayouts) !== JSON.stringify(layouts)) {
      await this.store.set('layouts', newLayouts);
    }
    this.discovered = true;
    await this.publishDevices();
    // The states just read, for the devices already added (no second read).
    for (const record of this.records.values()) {
      if (this.isCreated(record)) {
        await this.publishStates(record);
      }
    }
    this.issues.ok('discovery', 'Ariston NET answers again');
    const names = [...this.records.values()].map((record) => record.info.name);
    logger.info(`Connected to Ariston NET: ${names.length} appliance(s)`);
    await this.setStatus(names.length > 0, names.length > 0 ? undefined : TEXT.noDevice, true);
    return { names, unsupported: this.unsupported };
  }

  /** The devices of every known appliance, in the configured language. */
  devices() {
    if (!this.config) {
      return [];
    }
    return [...this.records.values()]
      .filter((record) => record.reading)
      .flatMap((record) => buildDevices(this.gladys, record, this.config));
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.devices());
  }

  // --- Reading ---------------------------------------------------------------

  /** One read of the cloud for a record (no publication). */
  async readRecord(record) {
    const { info } = record;
    const culture = CULTURES[this.config.language] ?? 'en-US';
    if (info.kind === 'galevo') {
      const data = await this.client.getPlantData(
        info.gw,
        record.plantFeatures,
        PLANT_ITEMS,
        ZONE_ITEMS,
        culture,
      );
      record.reading = readGalevo(record.plantFeatures, data);
    } else {
      if (this.now() - (record.settingsAt ?? 0) >= TIMINGS.settingsMs) {
        record.settings = await this.client.getWaterHeaterSettings(info.family.plantData, info.gw);
        record.settingsAt = this.now();
      }
      record.raw = await this.client.getWaterHeaterData(info.family.plantData, info.gw);
      record.reading = readWaterHeater(info.family, record.raw);
      // The mode to go back to when the Boost of the widget is tapped again.
      if (record.reading.mode !== null && record.reading.mode !== WATER_HEATER_MODE.BOOST) {
        record.lastMode = record.reading.mode;
      }
    }
    if (this.config.faults && this.now() - (record.faultsAt ?? -Infinity) >= TIMINGS.faultsMs) {
      await this.optional(record, 'faults', async () => {
        const faults = readFaults(await this.client.getBusErrors(info.gw, culture));
        this.noticeFaults(record, faults);
        record.faults = faults;
      });
    }
    if (
      this.config.energy &&
      info.kind === 'galevo' &&
      record.plantFeatures?.hasMetering &&
      this.now() - (record.energyAt ?? -Infinity) >= TIMINGS.energyMs
    ) {
      await this.optional(record, 'energy', async () => {
        record.energy = readEnergyAccount(await this.client.getEnergyAccount(info.gw));
      });
    }
  }

  /**
   * A secondary read (faults, consumption): its failure does not fail the
   * poll (the Lydos energy report is known to answer HTTP 500), and it is not
   * retried before its own period. A rate limit still stops the poll.
   */
  async optional(record, what, read) {
    try {
      await read();
      this.issues.ok(`${what}:${record.info.gw}`, `${record.info.name}: ${what} read again`);
    } catch (err) {
      if (err.kind === ERROR_KIND.RATE_LIMIT || err.kind === ERROR_KIND.AUTH) {
        throw err;
      }
      this.issues.fail(
        `${what}:${record.info.gw}`,
        `${record.info.name}: ${what} not read (${err.message})`,
      );
    } finally {
      record[`${what}At`] = this.now();
    }
  }

  /** The device external ids of a record. */
  deviceIdsOf(record) {
    const { gw, kind } = record.info;
    if (kind === 'galevo') {
      return [
        plantIds(this.gladys, gw).device,
        ...(record.reading?.zones ?? []).map((zone) => zoneIds(this.gladys, gw, zone.num).device),
      ];
    }
    return [waterHeaterIds(this.gladys, gw).device];
  }

  /** Whether the user added at least one device of this record to Gladys. */
  isCreated(record) {
    const created = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    return this.deviceIdsOf(record).some((id) => created.has(id));
  }

  /**
   * Reads one record and publishes its states, unless it was read less than
   * `minGap` periods ago. A second caller waits for the read in progress.
   */
  async pollRecord(record, { force = false, minGap = 0.5 } = {}) {
    const gw = record.info.gw;
    const running = this.inFlight.get(gw);
    if (running) {
      return running;
    }
    const period = refreshMs(this.config);
    if (
      !force &&
      record.lastPolledAt !== null &&
      this.now() - record.lastPolledAt < period * minGap
    ) {
      logger.debug(`${record.info.name}: read ${this.now() - record.lastPolledAt} ms ago, skipped`);
      return undefined;
    }
    record.lastPolledAt = this.now();
    const run = (async () => {
      try {
        await this.readRecord(record);
        await this.publishStates(record);
        this.issues.ok(`poll:${gw}`, `${record.info.name}: read again`);
        await this.setStatus(true);
      } catch (err) {
        await this.reportFailure(`poll:${gw}`, err, record.info.name);
        throw err;
      }
    })();
    this.inFlight.set(gw, run);
    try {
      return await run;
    } finally {
      this.inFlight.delete(gw);
    }
  }

  /** One cycle: every record whose devices were added; errors logged, not thrown. */
  async pollAll({ force = false } = {}) {
    if (this.gladys.connected === false || !this.client) {
      logger.debug('Gladys or the account unavailable: poll skipped');
      return;
    }
    for (const record of this.records.values()) {
      if (!this.isCreated(record)) {
        continue;
      }
      await this.pollRecord(record, { force }).catch(() => {});
    }
  }

  async publishStates(record) {
    const states = buildStates(this.gladys, record, this.config);
    if (states.length === 0) {
      return;
    }
    const { count } = await this.gladys.publishChangedStates(states, {
      heartbeat: TIMINGS.heartbeatMs,
    });
    logger.debug(`${record.info.name}: ${count} state(s) published`);
    if (count > 0) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Faults ----------------------------------------------------------------

  /**
   * Fires the fault trigger for every code that was not there at the previous
   * reading. The first reading only sets the baseline: a fault already present
   * when the integration starts does not fire again at each restart.
   */
  noticeFaults(record, faults) {
    const previous = record.faults;
    if (!previous) {
      return;
    }
    const known = new Set(previous.map((fault) => fault.code));
    const deviceId = this.deviceIdsOf(record)[0];
    for (const fault of faults) {
      if (known.has(fault.code)) {
        continue;
      }
      logger.info(`${record.info.name}: fault ${fault.code} ${fault.description}`.trim());
      if (!this.isCreated(record)) {
        continue;
      }
      this.gladys
        .publishSceneEvent(FAULT_TRIGGER, {
          device: deviceId,
          code: fault.code,
          appliance: record.info.name,
          description: fault.description,
          blocking: fault.blocking,
        })
        .catch((err) => logger.warn(`Fault trigger not sent: ${err.message}`));
    }
  }

  // --- Gladys events ---------------------------------------------------------

  /** The record of a Gladys device, with the parsed id. */
  locate(externalId) {
    const target = parseDeviceId(this.gladys, externalId);
    const record = target ? this.records.get(target.gw) : undefined;
    return record ? { target, record } : null;
  }

  /** onSetValue: one command, one info line. */
  async setValue(device, feature, value) {
    const found = this.locate(device.external_id);
    if (!found || !this.client) {
      throw new Error(pick(MESSAGES.unknownDevice, this.config?.language ?? 'en'));
    }
    const { target, record } = found;
    try {
      const done = await runCommand(
        this.client,
        record,
        target,
        featureKey(feature.external_id),
        value,
        this.config,
      );
      logger.info(`${record.info.name}: ${done}`);
    } catch (err) {
      logger.warn(`${record.info.name}: command refused (${err.message})`);
      throw err;
    }
    await this.publishStates(record).catch((err) =>
      logger.debug(`States not published after the command: ${err.message}`),
    );
  }

  /** The core's onPoll: a fallback, skipped while the timer keeps up. */
  async pollFromCore(device) {
    const found = this.locate(device.external_id);
    if (!found || !this.client) {
      return;
    }
    await this.pollRecord(found.record, { minGap: 0.9 }).catch(() => {});
  }

  /**
   * A device was just added (or updated) in Gladys: the SDK forgot its states,
   * Gladys had dropped the ones sent before. Publish what is known now,
   * without asking the cloud again; read it if nothing is known yet.
   */
  async deviceCreated(device) {
    const found = this.locate(device.external_id);
    if (!found) {
      return;
    }
    const { record } = found;
    if (record.reading) {
      await this.publishStates(record).catch((err) =>
        logger.debug(`States not published for the new device: ${err.message}`),
      );
    } else {
      await this.pollRecord(record, { force: true }).catch(() => {});
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** "Test the connection" action: logs in again, lists, re-publishes. */
  async testConnection() {
    if (!isConfigured(this.config)) {
      return TEXT.notConfigured;
    }
    try {
      await this.client.login();
      const { names, unsupported } = await this.discover();
      logger.info(`Action test_connection: ${names.length} appliance(s)`);
      return MESSAGES.connected(names, unsupported);
    } catch (err) {
      await this.reportFailure('discovery', err);
      return this.failureText(err);
    }
  }

  // --- Status ----------------------------------------------------------------

  failureText(err) {
    if (err.kind === ERROR_KIND.AUTH) {
      return TEXT.loginRefused;
    }
    if (err.kind === ERROR_KIND.RATE_LIMIT) {
      return MESSAGES.rateLimited(err.retryAfterSeconds ?? 60);
    }
    return MESSAGES.unreachable(err.message);
  }

  /** A failure: one warning while it lasts, and the status of the Configuration screen. */
  async reportFailure(key, err, name) {
    const what = name ? `${name}: ` : '';
    this.issues.fail(key, `${what}${err.message}`);
    if (err.kind) {
      await this.setStatus(false, this.failureText(err));
    } else {
      logger.debug(err.stack ?? String(err));
      await this.setStatus(false, TEXT.initFailed);
    }
  }

  /** Sets the Configuration screen status, only when it changes. */
  async setStatus(ok, message, force = false) {
    const key = `${ok}:${message ? JSON.stringify(message) : ''}`;
    if (!force && key === this.statusOk) {
      return;
    }
    this.statusOk = key;
    await this.gladys.setConnectionStatus(ok, message).catch(() => {});
  }

  /** What the widget shows for a device: the record and the device type. */
  widgetData(externalId) {
    const found = this.locate(externalId);
    if (!found) {
      return null;
    }
    const { target, record } = found;
    if (target.type === DEVICE_TYPE.ZONE) {
      const zone = record.reading?.zones.find((candidate) => candidate.num === target.zone);
      return { type: target.type, record, zone };
    }
    return { type: target.type, record };
  }
}
