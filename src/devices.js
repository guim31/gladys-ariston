// -----------------------------------------------------------------------------
// Gladys devices and states, built from what the cloud reported. Pure: the hub
// (src/hub.js) reads the cloud and publishes, these functions only translate.
//
// Three device types, their external ids built on the Ariston gateway id (the
// cloud's unique id of the appliance; never a name):
//   - plant:<gw>          a boiler or heat pump (Galevo): system mode, hot
//                         water, burner, pressure, faults, consumption;
//   - zone:<gw>-<num>     one heating zone of that plant: room temperature,
//                         setpoint, mode, heat demand;
//   - water_heater:<gw>   a Velis water heater.
// The feature keys below are stored by Gladys and users' scenes: never rename
// one, never move one to another device.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import {
  OPERATING_STATE,
  WATER_HEATER_DEFAULT_MAX_SETPOINT,
  WATER_HEATER_MIN_SETPOINT,
  waterHeaterGladysModes,
  waterHeaterMaxSetpoint,
  zoneGladysModes,
  zoneModeToGladys,
} from './ariston/model.js';
import { labels, names, pick, TEXT } from './i18n.js';

export const DEVICE_TYPE = { PLANT: 'plant', ZONE: 'zone', WATER_HEATER: 'water_heater' };

export const FEATURE = {
  // plant
  PLANT_MODE: 'plant_mode',
  PRESSURE: 'pressure',
  FLAME: 'flame',
  HEAT_PUMP: 'heat_pump',
  OUTSIDE_TEMPERATURE: 'outside_temperature',
  FLOW_TEMPERATURE: 'flow_temperature',
  DHW_TEMPERATURE: 'dhw_temperature',
  DHW_TARGET: 'dhw_target',
  FAULTS: 'faults',
  ENERGY_HEATING_GAS: 'energy_heating_gas',
  ENERGY_HEATING_ELECTRICITY: 'energy_heating_electricity',
  ENERGY_DHW_GAS: 'energy_dhw_gas',
  ENERGY_DHW_ELECTRICITY: 'energy_dhw_electricity',
  // zone
  TEMPERATURE: 'temperature',
  TARGET: 'target',
  MODE: 'mode',
  HEAT_REQUEST: 'heat_request',
  // water heater (also TEMPERATURE, TARGET, MODE, FAULTS)
  POWER: 'power',
  HEATING: 'heating',
  SHOWERS: 'showers',
  ECO: 'eco',
  REMAINING_TIME: 'remaining_time',
  ANTI_LEGIONELLA: 'anti_legionella',
};

const ENERGY_FEATURES = [
  [FEATURE.ENERGY_HEATING_GAS, 'heatingGas'],
  [FEATURE.ENERGY_HEATING_ELECTRICITY, 'heatingElectricity'],
  [FEATURE.ENERGY_DHW_GAS, 'dhwGas'],
  [FEATURE.ENERGY_DHW_ELECTRICITY, 'dhwElectricity'],
];

// The states change slowly; Gladys polls every minute at most and the
// container skips the polls it does not need (src/hub.js).
const POLLING = { should_poll: true, poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES };

/** The ids of a plant, a zone, a water heater. */
export const plantIds = (gladys, gw) => gladys.externalIds(DEVICE_TYPE.PLANT, gw);
export const zoneIds = (gladys, gw, num) => gladys.externalIds(DEVICE_TYPE.ZONE, `${gw}-${num}`);
export const waterHeaterIds = (gladys, gw) => gladys.externalIds(DEVICE_TYPE.WATER_HEATER, gw);

/**
 * Reads back a device external id: its type, gateway and zone.
 * @returns {{ type: string, gw: string, zone?: number } | null}
 */
export function parseDeviceId(gladys, externalId) {
  const prefix = gladys.externalId('');
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const [type, ...rest] = externalId.slice(prefix.length).split(':');
  const platformId = rest.join(':');
  if (type === DEVICE_TYPE.PLANT || type === DEVICE_TYPE.WATER_HEATER) {
    return platformId ? { type, gw: platformId } : null;
  }
  if (type === DEVICE_TYPE.ZONE) {
    const match = /^(.+)-(\d+)$/.exec(platformId);
    return match ? { type, gw: match[1], zone: Number(match[2]) } : null;
  }
  return null;
}

/** The feature key at the end of a feature external id. */
export function featureKey(externalId) {
  return String(externalId).split(':').pop();
}

function feature(ids, key, spec) {
  return {
    external_id: ids.feature(key),
    read_only: true,
    has_feedback: false,
    min: 0,
    max: 0,
    ...spec,
  };
}

const temperatureSensor = (ids, key, name) =>
  feature(ids, key, {
    name,
    category: 'temperature-sensor',
    type: 'decimal',
    unit: 'celsius',
    min: -50,
    max: 100,
  });

const binarySensor = (ids, key, name, category, type) =>
  feature(ids, key, { name, category, type, min: 0, max: 1 });

const textFeature = (ids, key, name) => feature(ids, key, { name, category: 'text', type: 'text' });

/**
 * What a plant shows: a feature appears once the cloud reported its item,
 * and stays (the layout is kept under /data), so a probe that misses one
 * reading does not change the device structure.
 * @param {object} [previous] the layout known so far
 * @param {object} reading from readGalevo
 * @param {object} plantFeatures from getPlantFeatures
 */
export function plantLayout(previous = {}, reading, plantFeatures) {
  return {
    pressure: Boolean(previous.pressure || reading.pressure !== null),
    flame: Boolean(previous.flame || reading.flame !== null),
    heatPump: Boolean(
      previous.heatPump ||
      ((plantFeatures?.hybridSys || plantFeatures?.hpSys) && reading.heatPump !== null),
    ),
    outsideTemperature: Boolean(previous.outsideTemperature || reading.outsideTemperature !== null),
    flowTemperature: Boolean(previous.flowTemperature || reading.flowTemperature !== null),
    dhwTemperature: Boolean(previous.dhwTemperature || reading.dhwTemperature !== null),
    plantMode: Boolean(previous.plantMode || reading.plantModeOptions.length > 0),
  };
}

/** The Galevo plant device. */
export function buildPlantDevice(gladys, plant, config) {
  const { info, reading, layout, hasDhw, plantFeatures } = plant;
  const n = names(config.language);
  const l = labels(config.language);
  const ids = plantIds(gladys, info.gw);
  const features = [];

  if (layout.plantMode) {
    features.push(
      feature(ids, FEATURE.PLANT_MODE, {
        name: n.plant_mode,
        category: 'text',
        type: 'select',
        read_only: false,
        has_feedback: true,
        supported_options: reading.plantModeOptions.map((mode) => ({
          value: mode,
          label: l[`plant_${mode}`],
        })),
      }),
    );
  }
  if (hasDhw) {
    const range = reading.dhwTargetRange;
    features.push(
      feature(ids, FEATURE.DHW_TARGET, {
        name: n.dhw_target,
        category: 'water-heater',
        type: 'target-temperature',
        unit: 'celsius',
        read_only: false,
        has_feedback: true,
        min: range.min,
        max: range.max,
        step: range.step,
      }),
    );
    if (layout.dhwTemperature) {
      features.push(temperatureSensor(ids, FEATURE.DHW_TEMPERATURE, n.dhw_temperature));
    }
  }
  if (layout.flame) {
    features.push(binarySensor(ids, FEATURE.FLAME, n.flame, 'input', 'binary'));
  }
  if (layout.heatPump) {
    features.push(binarySensor(ids, FEATURE.HEAT_PUMP, n.heat_pump, 'input', 'binary'));
  }
  if (layout.pressure) {
    features.push(
      feature(ids, FEATURE.PRESSURE, {
        name: n.pressure,
        category: 'pressure-sensor',
        type: 'decimal',
        unit: 'bar',
        min: 0,
        max: 4,
      }),
    );
  }
  if (layout.outsideTemperature) {
    features.push(temperatureSensor(ids, FEATURE.OUTSIDE_TEMPERATURE, n.outside_temperature));
  }
  if (layout.flowTemperature) {
    features.push(temperatureSensor(ids, FEATURE.FLOW_TEMPERATURE, n.flow_temperature));
  }
  if (config.faults) {
    features.push(textFeature(ids, FEATURE.FAULTS, n.faults));
  }
  if (config.energy && plantFeatures?.hasMetering) {
    for (const [key] of ENERGY_FEATURES) {
      if (!hasDhw && key.startsWith('energy_dhw')) {
        continue;
      }
      features.push(
        feature(ids, key, {
          name: n[key],
          category: 'energy-sensor',
          type: 'energy',
          unit: 'kilowatt-hour',
          min: 0,
          max: 100000,
        }),
      );
    }
  }

  return {
    name: info.name,
    external_id: ids.device,
    model: info.firmware ? `Ariston NET (${info.firmware})` : 'Ariston NET',
    ...POLLING,
    features,
  };
}

/** The device of one zone of a Galevo plant. */
export function buildZoneDevice(gladys, plant, zone, config) {
  const { info, reading } = plant;
  const n = names(config.language);
  const l = labels(config.language);
  const ids = zoneIds(gladys, info.gw, zone.num);
  const zoneName = zone.name ?? n.zone.replace('{n}', zone.num);
  const coolingAvailable = reading.plantModeOptions.some((mode) => mode.startsWith('cooling'));
  const modes = zoneGladysModes(zone.modeOptions, coolingAvailable);
  const features = [
    temperatureSensor(ids, FEATURE.TEMPERATURE, n.temperature),
    feature(ids, FEATURE.TARGET, {
      name: n.target,
      category: 'thermostat',
      type: 'target-temperature',
      unit: 'celsius',
      read_only: false,
      has_feedback: true,
      min: zone.targetRange.min,
      max: zone.targetRange.max,
      step: zone.targetRange.step,
    }),
  ];
  if (modes.length > 0) {
    features.push(
      feature(ids, FEATURE.MODE, {
        name: n.mode,
        category: 'thermostat',
        type: 'mode',
        read_only: false,
        has_feedback: true,
        min: 0,
        max: 3,
        supported_options: modes.map((mode) => ({ value: mode, label: l[`thermostat_${mode}`] })),
      }),
    );
  }
  features.push(
    feature(ids, FEATURE.HEAT_REQUEST, {
      name: n.heat_request,
      category: 'thermostat',
      type: 'operating-state',
      min: 0,
      max: 2,
    }),
  );
  return {
    name: `${info.name} – ${zoneName}`,
    external_id: ids.device,
    model: 'Ariston NET',
    ...POLLING,
    features,
  };
}

/** The device of a Velis water heater. */
export function buildWaterHeaterDevice(gladys, heater, config) {
  const { info, settings } = heater;
  const { family } = info;
  const n = names(config.language);
  const l = labels(config.language);
  const ids = waterHeaterIds(gladys, info.gw);
  const features = [
    feature(ids, FEATURE.POWER, {
      name: n.power,
      category: 'water-heater',
      type: 'binary',
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 1,
    }),
    temperatureSensor(ids, FEATURE.TEMPERATURE, n.water_temperature),
  ];
  if (family.targetField && family.temperatureWrite) {
    const max = waterHeaterMaxSetpoint(family, settings) ?? WATER_HEATER_DEFAULT_MAX_SETPOINT;
    features.push(
      feature(ids, FEATURE.TARGET, {
        name: n.target,
        category: 'water-heater',
        type: 'target-temperature',
        unit: 'celsius',
        read_only: false,
        has_feedback: true,
        min: WATER_HEATER_MIN_SETPOINT,
        max: Math.max(WATER_HEATER_MIN_SETPOINT, max),
        step: 1,
      }),
    );
  }
  features.push(
    feature(ids, FEATURE.MODE, {
      name: n.mode,
      category: 'water-heater',
      type: 'mode',
      read_only: false,
      has_feedback: true,
      min: 0,
      max: 6,
      supported_options: waterHeaterGladysModes(family).map((mode) => ({
        value: mode,
        label: l[`water_${mode}`],
      })),
    }),
  );
  if (family.heatingField) {
    features.push(binarySensor(ids, FEATURE.HEATING, n.heating, 'water-heater', 'heating'));
  }
  if (family.showersField) {
    features.push(
      feature(ids, FEATURE.SHOWERS, {
        name: n.showers,
        category: 'water-heater',
        type: 'remaining-hot-water',
        min: 0,
        max: 10,
      }),
    );
  }
  if (family.ecoField && family.ecoWrite) {
    features.push(
      feature(ids, FEATURE.ECO, {
        name: n.eco,
        category: 'switch',
        type: 'binary',
        read_only: false,
        has_feedback: true,
        min: 0,
        max: 1,
      }),
    );
  }
  if (family.remainingField) {
    features.push(
      feature(ids, FEATURE.REMAINING_TIME, {
        name: n.remaining_time,
        category: 'duration',
        type: 'integer',
        unit: 'minutes',
        min: 0,
        max: 1440,
      }),
    );
  }
  if (family.antiLegionellaField) {
    features.push(binarySensor(ids, FEATURE.ANTI_LEGIONELLA, n.anti_legionella, 'input', 'binary'));
  }
  if (config.faults) {
    features.push(textFeature(ids, FEATURE.FAULTS, n.faults));
  }
  return {
    name: info.name,
    external_id: ids.device,
    model: `Ariston ${family.label}`,
    ...POLLING,
    features,
  };
}

/** Every device of a plant record (plant + zones, or the water heater). */
export function buildDevices(gladys, record, config) {
  if (record.info.kind === 'galevo') {
    return [
      buildPlantDevice(gladys, record, config),
      ...record.reading.zones.map((zone) => buildZoneDevice(gladys, record, zone, config)),
    ];
  }
  return [buildWaterHeaterDevice(gladys, record, config)];
}

// --- States ------------------------------------------------------------------

const state = (externalId, value) => ({ device_feature_external_id: externalId, state: value });
const text = (externalId, value) => ({ device_feature_external_id: externalId, text: value });
const bit = (value) => (value ? 1 : 0);

/** The faults as one line of text, never empty (Gladys ignores an empty text). */
export function faultsText(faults, language) {
  if (!faults || faults.length === 0) {
    return pick(TEXT.noFault, language);
  }
  const line = faults
    .map(({ code, description }) => (description ? `${code} – ${description}` : code))
    .join(' ; ');
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

/**
 * The states of a Galevo plant and its zones. A value the cloud did not
 * report is left out (never published as 0).
 */
export function plantStates(gladys, record, config) {
  const { info, reading, layout, hasDhw } = record;
  const ids = plantIds(gladys, info.gw);
  const states = [];
  const push = (key, value) => {
    if (value !== null && value !== undefined) {
      states.push(state(ids.feature(key), value));
    }
  };
  if (layout.plantMode && reading.plantMode) {
    states.push(text(ids.feature(FEATURE.PLANT_MODE), reading.plantMode));
  }
  if (hasDhw) {
    push(FEATURE.DHW_TARGET, reading.dhwTarget);
    if (layout.dhwTemperature) {
      push(FEATURE.DHW_TEMPERATURE, reading.dhwTemperature);
    }
  }
  if (layout.flame && reading.flame !== null) {
    push(FEATURE.FLAME, bit(reading.flame));
  }
  if (layout.heatPump && reading.heatPump !== null) {
    push(FEATURE.HEAT_PUMP, bit(reading.heatPump));
  }
  if (layout.pressure) {
    push(FEATURE.PRESSURE, reading.pressure);
  }
  if (layout.outsideTemperature) {
    push(FEATURE.OUTSIDE_TEMPERATURE, reading.outsideTemperature);
  }
  if (layout.flowTemperature) {
    push(FEATURE.FLOW_TEMPERATURE, reading.flowTemperature);
  }
  if (config.faults && record.faults) {
    states.push(text(ids.feature(FEATURE.FAULTS), faultsText(record.faults, config.language)));
  }
  if (config.energy && record.plantFeatures?.hasMetering && record.energy) {
    for (const [key, field] of ENERGY_FEATURES) {
      if (!hasDhw && key.startsWith('energy_dhw')) {
        continue;
      }
      push(key, record.energy[field]);
    }
  }

  for (const zone of reading.zones) {
    const zIds = zoneIds(gladys, info.gw, zone.num);
    const zPush = (key, value) => {
      if (value !== null && value !== undefined) {
        states.push(state(zIds.feature(key), value));
      }
    };
    zPush(FEATURE.TEMPERATURE, zone.temperature);
    zPush(FEATURE.TARGET, zone.target);
    zPush(FEATURE.MODE, zoneModeToGladys(zone.mode, reading.cooling));
    if (zone.heatRequest !== null) {
      const running = reading.cooling ? OPERATING_STATE.COOLING : OPERATING_STATE.HEATING;
      zPush(FEATURE.HEAT_REQUEST, zone.heatRequest ? running : OPERATING_STATE.IDLE);
    }
  }
  return states;
}

/** The states of a water heater. */
export function waterHeaterStates(gladys, record, config) {
  const { info, reading } = record;
  const { family } = info;
  const ids = waterHeaterIds(gladys, info.gw);
  const states = [];
  const push = (key, value) => {
    if (value !== null && value !== undefined) {
      states.push(state(ids.feature(key), value));
    }
  };
  if (reading.on !== null) {
    push(FEATURE.POWER, bit(reading.on));
  }
  push(FEATURE.TEMPERATURE, reading.temperature);
  if (family.targetField && family.temperatureWrite) {
    push(FEATURE.TARGET, reading.target);
  }
  push(FEATURE.MODE, reading.mode);
  if (family.heatingField && reading.heating !== null) {
    push(FEATURE.HEATING, bit(reading.heating));
  }
  if (family.showersField) {
    push(FEATURE.SHOWERS, reading.showers);
  }
  if (family.ecoField && family.ecoWrite && reading.eco !== null) {
    push(FEATURE.ECO, bit(reading.eco));
  }
  if (family.remainingField) {
    push(FEATURE.REMAINING_TIME, reading.remaining);
  }
  if (family.antiLegionellaField && reading.antiLegionella !== null) {
    push(FEATURE.ANTI_LEGIONELLA, bit(reading.antiLegionella));
  }
  if (config.faults && record.faults) {
    states.push(text(ids.feature(FEATURE.FAULTS), faultsText(record.faults, config.language)));
  }
  return states;
}

/** Every state of a plant record. */
export function buildStates(gladys, record, config) {
  if (!record.reading) {
    return [];
  }
  return record.info.kind === 'galevo'
    ? plantStates(gladys, record, config)
    : waterHeaterStates(gladys, record, config);
}
