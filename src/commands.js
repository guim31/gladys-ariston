// -----------------------------------------------------------------------------
// Commands from Gladys (onSetValue), turned into Ariston NET writes. Every
// value is checked against what the appliance itself declares (setpoint range
// and step, offered modes) before anything is sent: the cloud would refuse it
// or, worse, accept it. On success the record is updated in memory, so the new
// value shows at once; the next poll confirms it.
// -----------------------------------------------------------------------------

import {
  ZONE_MODE,
  gladysModeToWaterHeater,
  gladysModeToZone,
  plantModeCode,
  WATER_HEATER_DEFAULT_MAX_SETPOINT,
  WATER_HEATER_MODE,
  WATER_HEATER_MIN_SETPOINT,
  waterHeaterMaxSetpoint,
  zoneGladysModes,
  zoneModeToGladys,
} from './ariston/model.js';
import { FEATURE } from './devices.js';
import { MESSAGES, pick } from './i18n.js';

export class CommandError extends Error {}

const fail = (text, language) => new CommandError(pick(text, language));

/** Rounds a setpoint to the appliance's step, refusing one out of its range. */
export function checkSetpoint(value, range, language) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw fail(MESSAGES.setpointOutOfRange(range.min, range.max), language);
  }
  const step = range.step > 0 ? range.step : 1;
  const rounded = Math.round((number - range.min) / step) * step + range.min;
  const clean = Number(rounded.toFixed(2));
  if (clean < range.min - 1e-9 || clean > range.max + 1e-9) {
    throw fail(MESSAGES.setpointOutOfRange(range.min, range.max), language);
  }
  return clean;
}

/**
 * Runs one command.
 * @param {object} client AristonClient
 * @param {object} record the hub's record of the plant
 * @param {{ type: string, zone?: number }} target parsed device id
 * @param {string} key feature key
 * @param {number|string} value
 * @param {object} config
 * @returns {Promise<string>} a short description, for the log
 */
export async function runCommand(client, record, target, key, value, config) {
  const { language } = config;
  if (!record.reading) {
    throw fail(MESSAGES.notReadYet, language);
  }
  if (record.info.kind === 'galevo') {
    return target.type === 'zone'
      ? zoneCommand(client, record, target.zone, key, value, language)
      : plantCommand(client, record, key, value, language);
  }
  return waterHeaterCommand(client, record, key, value, language);
}

async function plantCommand(client, record, key, value, language) {
  const { info, plantFeatures, reading } = record;
  if (key === FEATURE.PLANT_MODE) {
    const name = String(value);
    const code = plantModeCode(name);
    if (code === undefined || !reading.plantModeOptions.includes(name)) {
      throw fail(MESSAGES.modeNotOffered, language);
    }
    await client.setPlantItem(info.gw, plantFeatures, {
      id: 'PlantMode',
      zone: 0,
      value: code,
      prevValue: plantModeCode(reading.plantMode) ?? code,
    });
    reading.plantMode = name;
    reading.cooling = name.startsWith('cooling');
    return `system mode ${name}`;
  }
  if (key === FEATURE.DHW_TARGET && record.hasDhw) {
    const setpoint = checkSetpoint(value, reading.dhwTargetRange, language);
    await client.setPlantItem(info.gw, plantFeatures, {
      id: 'DhwTemp',
      zone: 0,
      value: setpoint,
      prevValue: reading.dhwTarget ?? setpoint,
    });
    reading.dhwTarget = setpoint;
    return `hot water setpoint ${setpoint} °C`;
  }
  throw fail(MESSAGES.modeNotOffered, language);
}

async function zoneCommand(client, record, num, key, value, language) {
  const { info, plantFeatures, reading } = record;
  const zone = reading.zones.find((candidate) => candidate.num === num);
  if (!zone) {
    throw fail(MESSAGES.unknownDevice, language);
  }
  if (key === FEATURE.TARGET) {
    const setpoint = checkSetpoint(value, zone.targetRange, language);
    await client.setPlantItem(info.gw, plantFeatures, {
      id: 'ZoneComfortTemp',
      zone: num,
      value: setpoint,
      prevValue: zone.target ?? setpoint,
    });
    zone.target = setpoint;
    return `zone ${num} setpoint ${setpoint} °C`;
  }
  if (key === FEATURE.MODE) {
    // Only the modes the feature offers (cooling needs a plant that cools).
    const coolingAvailable = reading.plantModeOptions.some((mode) => mode.startsWith('cooling'));
    const offered = zoneGladysModes(zone.modeOptions, coolingAvailable).includes(Number(value));
    const code = offered ? gladysModeToZone(value, zone.modeOptions) : null;
    if (code === null) {
      throw fail(MESSAGES.modeNotOffered, language);
    }
    await client.setPlantItem(info.gw, plantFeatures, {
      id: 'ZoneMode',
      zone: num,
      value: code,
      prevValue: zone.mode ?? code,
    });
    zone.mode = code;
    const label = Object.keys(ZONE_MODE).find((name) => ZONE_MODE[name] === code);
    return `zone ${num} mode ${label} (${zoneModeToGladys(code, reading.cooling)})`;
  }
  throw fail(MESSAGES.modeNotOffered, language);
}

async function waterHeaterCommand(client, record, key, value, language) {
  const { info, reading, raw, settings } = record;
  const { family, gw } = info;
  if (key === FEATURE.POWER) {
    const on = Number(value) === 1;
    await client.setWaterHeater(family.plantData, gw, 'switch', on);
    reading.on = on;
    return `power ${on ? 'on' : 'off'}`;
  }
  if (key === FEATURE.TARGET && family.targetField && family.temperatureWrite) {
    const max = waterHeaterMaxSetpoint(family, settings) ?? WATER_HEATER_DEFAULT_MAX_SETPOINT;
    const setpoint = checkSetpoint(
      value,
      { min: WATER_HEATER_MIN_SETPOINT, max: Math.max(WATER_HEATER_MIN_SETPOINT, max), step: 1 },
      language,
    );
    const write = family.temperatureWrite;
    if (write.nuos) {
      // The Nuos Split writes its comfort and reduced setpoints together:
      // the reduced one is sent back unchanged.
      const reduced = typeof raw?.reducedTemp === 'number' ? raw.reducedTemp : 0;
      await client.setWaterHeater(write.plantData, gw, write.action, {
        new: { comfort: setpoint, reduced },
        old: { comfort: reading.target, reduced },
      });
    } else {
      await client.setWaterHeater(write.plantData, gw, write.action, { new: setpoint });
    }
    reading.target = setpoint;
    return `setpoint ${setpoint} °C`;
  }
  if (key === FEATURE.MODE) {
    const code = gladysModeToWaterHeater(family, value);
    if (code === null) {
      throw fail(MESSAGES.modeNotOffered, language);
    }
    await client.setWaterHeater(family.modeWrite.plantData, gw, family.modeWrite.action, {
      new: code,
    });
    reading.mode = Number(value);
    // The mode the Boost of the widget goes back to (src/widgets.js).
    if (reading.mode !== WATER_HEATER_MODE.BOOST) {
      record.lastMode = reading.mode;
    }
    return `mode ${code} (${value})`;
  }
  throw fail(MESSAGES.modeNotOffered, language);
}
