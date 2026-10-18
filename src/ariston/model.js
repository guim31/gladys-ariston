// -----------------------------------------------------------------------------
// What the Ariston NET answers mean: pure functions over the cloud's JSON, no
// I/O. The field names and codes come from the `ariston` Python library by
// fustom (MIT), the reference implementation of this undocumented API.
//
// Two systems are supported:
//   - "Galevo" (sys 3): boilers and heat pumps with an Ariston/Chaffoteaux/Elco
//     thermostat (Genus One, Alteas One, Nimbus, INOA...). One plant, its
//     hot water, and one or more heating zones, read in one dataItems request.
//   - "Velis" (sys 4): water heaters (Velis Evo, Lux, Lydos, Lydos Hybrid,
//     Nuos Split...). Each family has its own endpoints and mode codes.
// The BSB system (sys 5, Elco/Remocon heat pumps) is not supported yet.
// -----------------------------------------------------------------------------

/** Ariston system types (the `sys` attribute of a plant). */
export const SYSTEM = { GALEVO: 3, VELIS: 4, BSB: 5 };

/**
 * Gladys WATER_HEATER_MODE (server/utils/constants.js): the generic set the
 * water-heater `mode` feature carries, each appliance declaring its subset.
 */
export const WATER_HEATER_MODE = {
  OFF: 0,
  AUTO: 1,
  ECO: 2,
  BOOST: 3,
  MANUAL: 4,
  AWAY: 5,
  PROGRAM: 6,
};

/** Gladys THERMOSTAT_MODE and THERMOSTAT_OPERATING_STATE. */
export const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, COOLING: 2, AUTO: 3 };
export const OPERATING_STATE = { IDLE: 0, HEATING: 1, COOLING: 2 };

/**
 * Water heater families, by `wheType`. For each: where its state is read
 * (`plantData`), how a mode and a setpoint are written, and how its native
 * mode codes map onto the Gladys modes.
 *
 * Mode mapping choices (documented in docs/*.md):
 *   - iMemory (learns the household's use) is AUTO;
 *   - Green (heat pump only) is ECO, as the Gladys enum describes it;
 *   - Night (Velis Evo: heats during off-peak hours) is ECO too;
 *   - Comfort on a Nuos Split (fixed setpoint, heat pump and resistor) is MANUAL;
 *   - Fast on a Nuos Split is BOOST.
 */
export const WATER_HEATER_FAMILIES = {
  1: {
    key: 'velis_evo',
    label: 'Velis Evo',
    plantData: 'plantData',
    modeWrite: { plantData: 'medPlantData', action: 'mode' },
    temperatureWrite: null, // set by number of showers, not by temperature
    modeField: 'mode',
    modes: { 1: WATER_HEATER_MODE.MANUAL, 5: WATER_HEATER_MODE.PROGRAM, 8: WATER_HEATER_MODE.ECO },
    currentField: 'temp',
    targetField: null,
    heatingField: 'state',
    showersField: 'avShw',
    settingsPrefix: null,
  },
  2: {
    key: 'lydos_hybrid',
    label: 'Lydos Hybrid',
    plantData: 'sePlantData',
    modeWrite: { plantData: 'sePlantData', action: 'mode' },
    temperatureWrite: { plantData: 'sePlantData', action: 'temperature' },
    modeField: 'mode',
    modes: {
      1: WATER_HEATER_MODE.AUTO,
      2: WATER_HEATER_MODE.ECO,
      6: WATER_HEATER_MODE.PROGRAM,
      7: WATER_HEATER_MODE.BOOST,
    },
    currentField: 'temp',
    targetField: 'reqTemp',
    heatingField: 'heatReq',
    showersField: 'avShw',
    settingsPrefix: 'Se',
  },
  3: luxLike('lydos', 'Lydos'),
  4: {
    key: 'nuos_split',
    label: 'Nuos Split',
    plantData: 'slpPlantData',
    modeWrite: { plantData: 'slpPlantData', action: 'operativeMode' },
    temperatureWrite: { plantData: 'slpPlantData', action: 'temperatures', nuos: true },
    modeField: 'opMode',
    modes: {
      0: WATER_HEATER_MODE.ECO,
      1: WATER_HEATER_MODE.MANUAL,
      2: WATER_HEATER_MODE.BOOST,
      3: WATER_HEATER_MODE.AUTO,
    },
    currentField: 'waterTemp',
    targetField: 'comfortTemp',
    heatingField: null,
    showersField: null,
    settingsPrefix: 'Slp',
  },
  5: evoLike('andris2', 'Andris 2'),
  6: evoLike('velis_evo2', 'Velis Evo 2'),
  7: evoLike('lux2', 'Lux 2'),
  8: luxLike('lux', 'Lux'),
};

function medFamily(key, label, modes) {
  return {
    key,
    label,
    plantData: 'medPlantData',
    modeWrite: { plantData: 'medPlantData', action: 'mode' },
    temperatureWrite: { plantData: 'medPlantData', action: 'temperature' },
    modeField: 'mode',
    modes,
    currentField: 'temp',
    targetField: 'reqTemp',
    heatingField: 'heatReq',
    showersField: 'avShw',
    settingsPrefix: 'Med',
    // Med water heaters (Velis Evo, Lux, Andris…), as fustom/python-ariston-api
    // reads them: the Eco function (a switch of its own, beside the mode), the
    // time left to reach the setpoint ("HH:MM:SS") and the anti-legionella
    // cycle in progress (forum t/10385/267, Velis Tech Dry Wi-Fi).
    ecoField: 'eco',
    ecoWrite: { plantData: 'medPlantData', action: 'switchEco' },
    remainingField: 'rmTm',
    antiLegionellaField: 'antiLeg',
  };
}

function evoLike(key, label) {
  return medFamily(key, label, { 1: WATER_HEATER_MODE.MANUAL, 5: WATER_HEATER_MODE.PROGRAM });
}

function luxLike(key, label) {
  return medFamily(key, label, {
    1: WATER_HEATER_MODE.MANUAL,
    5: WATER_HEATER_MODE.PROGRAM,
    9: WATER_HEATER_MODE.BOOST,
  });
}

/** The lowest hot water setpoint of a Velis water heater (the app's, per the library). */
export const WATER_HEATER_MIN_SETPOINT = 40;
/** Used when the water heater's settings do not give its maximum setpoint. */
export const WATER_HEATER_DEFAULT_MAX_SETPOINT = 75;

/**
 * Sorts a raw plant of the plants lists.
 * @returns {{ gw: string, name: string, sys: number, kind: 'galevo'|'water_heater'|'unsupported', family?: object, serial?: string, firmware?: string }}
 */
export function classifyPlant(raw) {
  const gw = typeof raw?.gw === 'string' ? raw.gw : String(raw?.gw ?? '');
  const base = {
    gw,
    name: typeof raw?.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : gw,
    sys: Number(raw?.sys),
    serial: typeof raw?.sn === 'string' ? raw.sn : undefined,
    firmware: typeof raw?.fwVer === 'string' ? raw.fwVer : undefined,
  };
  if (gw === '') {
    return { ...base, kind: 'unsupported' };
  }
  if (base.sys === SYSTEM.GALEVO) {
    return { ...base, kind: 'galevo' };
  }
  if (base.sys === SYSTEM.VELIS) {
    const family = WATER_HEATER_FAMILIES[Number(raw.wheType)];
    return family ? { ...base, kind: 'water_heater', family } : { ...base, kind: 'unsupported' };
  }
  return { ...base, kind: 'unsupported' };
}

// --- Galevo ------------------------------------------------------------------

/** Data item ids read on the plant (zone 0). */
export const PLANT_ITEMS = [
  'PlantMode',
  'IsFlameOn',
  'IsHeatingPumpOn',
  'HeatingCircuitPressure',
  'OutsideTemp',
  'ChFlowTemp',
  'DhwTemp',
  'DhwStorageTemperature',
  'Holiday',
];

/** Data item ids read on every zone. */
export const ZONE_ITEMS = ['ZoneMeasuredTemp', 'ZoneComfortTemp', 'ZoneMode', 'ZoneHeatRequest'];

/** Ariston plant modes (PlantMode item), by code. */
export const PLANT_MODES = {
  0: 'summer',
  1: 'winter',
  2: 'heating_only',
  3: 'cooling',
  4: 'cooling_only',
  5: 'off',
  6: 'holiday',
};
const PLANT_MODE_CODES = Object.fromEntries(
  Object.entries(PLANT_MODES).map(([code, name]) => [name, Number(code)]),
);
/** Plant modes in which the zones cool instead of heating. */
const COOLING_PLANT_MODES = ['cooling', 'cooling_only'];

/** Ariston zone modes (ZoneMode item) of the Galevo system. */
export const ZONE_MODE = { OFF: 0, MANUAL_NIGHT: 1, MANUAL: 2, TIME_PROGRAM: 3 };

/** The code of a plant mode name, or undefined. */
export function plantModeCode(name) {
  return PLANT_MODE_CODES[name];
}

/** Items of a dataItems answer, by `<id>:<zone>`. */
export function indexItems(data) {
  const index = new Map();
  for (const item of Array.isArray(data?.items) ? data.items : []) {
    if (item && typeof item.id === 'string') {
      index.set(`${item.id}:${Number(item.zone ?? 0)}`, item);
    }
  }
  return index;
}

/** The zones of a plant, from its features. */
export function galevoZones(features) {
  return (Array.isArray(features?.zones) ? features.zones : [])
    .filter((zone) => Number.isInteger(Number(zone?.num)) && !zone.isHidden)
    .map((zone) => ({
      num: Number(zone.num),
      name: typeof zone.name === 'string' && zone.name.trim() !== '' ? zone.name.trim() : null,
    }));
}

/** Whether the plant produces domestic hot water (the library's rule). */
export function galevoHasDhw(features) {
  return Boolean(
    features?.hasBoiler ||
    features?.dhwBoilerPresent ||
    features?.dhwModeChangeable ||
    features?.dhwProgSupported,
  );
}

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * A sensor the library considers absent when its value sits at the top of its
 * range (the cloud fills unplugged probes that way).
 */
function probe(item) {
  const value = finite(item?.value);
  if (value === null) {
    return null;
  }
  const max = finite(item.max);
  return max !== null && value === max ? null : value;
}

/** The setpoint range an item declares, with sane fallbacks. */
export function itemRange(item, fallback) {
  const min = finite(item?.min) ?? fallback.min;
  const max = finite(item?.max) ?? fallback.max;
  const step = finite(item?.step);
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    step: step !== null && step > 0 ? step : fallback.step,
  };
}

/**
 * Everything a Galevo plant reports, read once per poll.
 * @param {object} features from getPlantFeatures
 * @param {object} data from getPlantData
 */
export function readGalevo(features, data) {
  const items = indexItems(data);
  const item = (id, zone = 0) => items.get(`${id}:${zone}`);

  const plantModeItem = item('PlantMode');
  const plantModeValue = finite(plantModeItem?.value);
  const plantMode = plantModeValue === null ? null : (PLANT_MODES[plantModeValue] ?? null);
  const plantModeOptions = (Array.isArray(plantModeItem?.options) ? plantModeItem.options : [])
    .map((code) => PLANT_MODES[code])
    .filter(Boolean);
  const cooling = COOLING_PLANT_MODES.includes(plantMode);

  const flame = finite(item('IsFlameOn')?.value);
  const heatPump = finite(item('IsHeatingPumpOn')?.value);
  const dhwTarget = item('DhwTemp');

  const zones = galevoZones(features).map(({ num, name }) => {
    const modeItem = item('ZoneMode', num);
    const mode = finite(modeItem?.value);
    const heatRequest = finite(item('ZoneHeatRequest', num)?.value);
    const comfort = item('ZoneComfortTemp', num);
    return {
      num,
      name,
      temperature: finite(item('ZoneMeasuredTemp', num)?.value),
      target: finite(comfort?.value),
      targetRange: itemRange(comfort, { min: 5, max: 30, step: 0.5 }),
      mode,
      modeOptions: (Array.isArray(modeItem?.options) ? modeItem.options : [])
        .map(Number)
        .filter((code) => Object.values(ZONE_MODE).includes(code)),
      heatRequest: heatRequest === null ? null : heatRequest !== 0,
    };
  });

  return {
    plantMode,
    plantModeOptions,
    cooling,
    flame: flame === null ? null : flame !== 0,
    heatPump: heatPump === null ? null : heatPump !== 0,
    pressure: finite(item('HeatingCircuitPressure')?.value),
    outsideTemperature: probe(item('OutsideTemp')),
    flowTemperature: finite(item('ChFlowTemp')?.value),
    dhwTemperature: probe(item('DhwStorageTemperature')),
    dhwTarget: finite(dhwTarget?.value),
    dhwTargetRange: itemRange(dhwTarget, { min: 35, max: 65, step: 1 }),
    holiday: Boolean(item('Holiday')?.value),
    zones,
  };
}

/** Gladys thermostat mode of a zone, from its Ariston zone mode. */
export function zoneModeToGladys(mode, cooling) {
  switch (mode) {
    case ZONE_MODE.OFF:
      return THERMOSTAT_MODE.OFF;
    case ZONE_MODE.MANUAL:
    case ZONE_MODE.MANUAL_NIGHT:
      return cooling ? THERMOSTAT_MODE.COOLING : THERMOSTAT_MODE.HEATING;
    case ZONE_MODE.TIME_PROGRAM:
      return THERMOSTAT_MODE.AUTO;
    default:
      return null;
  }
}

/**
 * The Ariston zone mode to write for a Gladys thermostat mode, among the
 * modes the zone offers, or null. Heating and cooling both mean "manual": the
 * plant mode, not the zone, says which one runs. Manual-night is preferred
 * when offered, as the Home Assistant integration does.
 */
export function gladysModeToZone(value, options) {
  const offered = (code) => options.length === 0 || options.includes(code);
  switch (Number(value)) {
    case THERMOSTAT_MODE.OFF:
      return offered(ZONE_MODE.OFF) ? ZONE_MODE.OFF : null;
    case THERMOSTAT_MODE.HEATING:
    case THERMOSTAT_MODE.COOLING:
      if (options.includes(ZONE_MODE.MANUAL_NIGHT)) {
        return ZONE_MODE.MANUAL_NIGHT;
      }
      return offered(ZONE_MODE.MANUAL) ? ZONE_MODE.MANUAL : null;
    case THERMOSTAT_MODE.AUTO:
      return offered(ZONE_MODE.TIME_PROGRAM) ? ZONE_MODE.TIME_PROGRAM : null;
    default:
      return null;
  }
}

/** The Gladys thermostat modes a zone offers, in display order. */
export function zoneGladysModes(modeOptions, coolingAvailable) {
  const modes = [];
  if (modeOptions.includes(ZONE_MODE.OFF)) {
    modes.push(THERMOSTAT_MODE.OFF);
  }
  if (modeOptions.includes(ZONE_MODE.MANUAL) || modeOptions.includes(ZONE_MODE.MANUAL_NIGHT)) {
    modes.push(THERMOSTAT_MODE.HEATING);
    if (coolingAvailable) {
      modes.push(THERMOSTAT_MODE.COOLING);
    }
  }
  if (modeOptions.includes(ZONE_MODE.TIME_PROGRAM)) {
    modes.push(THERMOSTAT_MODE.AUTO);
  }
  return modes;
}

/** Last month's consumption, kWh: heating and hot water, gas and electricity. */
export function readEnergyAccount(account) {
  const lastMonth = Array.isArray(account?.LastMonth) ? account.LastMonth : [];
  const heating = lastMonth[0] ?? {};
  const dhw = lastMonth[1] ?? {};
  return {
    heatingGas: finite(heating.gas),
    heatingElectricity: finite(heating.elect),
    dhwGas: finite(dhw.gas),
    dhwElectricity: finite(dhw.elect),
  };
}

// --- Velis -------------------------------------------------------------------

/** The maximum setpoint a water heater's settings allow, or null. */
export function waterHeaterMaxSetpoint(family, settings) {
  if (!family.settingsPrefix) {
    return null;
  }
  return finite(settings?.[`${family.settingsPrefix}MaxSetpointTemperature`]);
}

/**
 * Everything a water heater reports.
 * @param {object} family from WATER_HEATER_FAMILIES
 * @param {object} data from getWaterHeaterData
 */
export function readWaterHeater(family, data) {
  const rawMode = data?.[family.modeField];
  const mode = Number.isInteger(rawMode) ? (family.modes[rawMode] ?? null) : null;
  const heating = family.heatingField ? data?.[family.heatingField] : undefined;
  const showers = family.showersField ? finite(data?.[family.showersField]) : null;
  const on = data?.on;
  const eco = family.ecoField ? data?.[family.ecoField] : undefined;
  const antiLegionella = family.antiLegionellaField
    ? data?.[family.antiLegionellaField]
    : undefined;
  return {
    on: typeof on === 'boolean' ? on : null,
    temperature: finite(data?.[family.currentField]),
    target: family.targetField ? finite(data?.[family.targetField]) : null,
    mode,
    heating: typeof heating === 'boolean' ? heating : null,
    showers: showers === null ? null : Math.max(0, Math.round(showers)),
    eco: typeof eco === 'boolean' ? eco : null,
    remaining: family.remainingField ? minutesOf(data?.[family.remainingField]) : null,
    antiLegionella: typeof antiLegionella === 'boolean' ? antiLegionella : null,
  };
}

/** "01:25:00" → 85 (minutes), null when not a duration. */
export function minutesOf(value) {
  const match = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** The native mode code to write for a Gladys water heater mode, or null. */
export function gladysModeToWaterHeater(family, value) {
  const entry = Object.entries(family.modes).find(([, mode]) => mode === Number(value));
  return entry ? Number(entry[0]) : null;
}

/** The Gladys modes a water heater family offers, in its own order. */
export function waterHeaterGladysModes(family) {
  return Object.values(family.modes);
}

// --- Faults ------------------------------------------------------------------

/**
 * The faults of a busErrors answer, de-duplicated by code.
 * @returns {{ code: string, description: string, blocking: boolean }[]}
 */
export function readFaults(list) {
  const faults = new Map();
  for (const fault of Array.isArray(list) ? list : []) {
    const code = fault?.code === undefined || fault?.code === null ? '' : String(fault.code).trim();
    if (code === '' || faults.has(code)) {
      continue;
    }
    const description = typeof fault.errDex === 'string' ? fault.errDex.trim() : '';
    faults.set(code, { code, description, blocking: Boolean(fault.blk) });
  }
  return [...faults.values()];
}
