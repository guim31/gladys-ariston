// -----------------------------------------------------------------------------
// The "Ariston" dashboard widget: one appliance (a zone, the plant or a water
// heater, chosen in the widget settings), its temperatures as live tiles, its
// state as a status list, and a few buttons.
//
// Budget of the core: 8 components, 6 tiles, 1 status, 4 buttons. Tiles bound
// to a device feature follow the published states live; the status list is
// built from the hub's last reading (no cloud request for a widget).
// The setpoint buttons are actions (relative to the current setpoint); the
// mode and power buttons are device-feature buttons, the only ones with a
// native "active" state. The current choice is marked by the check-circle
// icon, never by the `primary` style, invisible in dark mode (Gladys#3153).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WATER_HEATER_MODE, zoneGladysModes, zoneModeToGladys } from './ariston/model.js';
import { FEATURE, DEVICE_TYPE, faultsText, plantIds, waterHeaterIds, zoneIds } from './devices.js';
import { labels, names, pick, TEXT } from './i18n.js';

export const WIDGET_ACTIONS = { DOWN: 'setpoint_down', UP: 'setpoint_up' };

const TTL_SECONDS = 120;

const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const textContent = (message, language) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text: pick(message, language) }],
});

function yesNo(value, language) {
  if (value === null || value === undefined) {
    return pick(TEXT.unknown, language);
  }
  return pick(value ? TEXT.on : TEXT.off, language);
}

function faultsRow(record, language) {
  if (!record.faults) {
    return null;
  }
  return {
    label: pick(TEXT.faults, language),
    value: truncate(faultsText(record.faults, language), 40),
    icon: record.faults.length > 0 ? 'alert-triangle' : 'check',
    color: record.faults.length > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
  };
}

function setpointButtons(language) {
  return [
    {
      type: 'button',
      label: pick(TEXT.down, language),
      icon: 'minus',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.DOWN },
    },
    {
      type: 'button',
      label: pick(TEXT.up, language),
      icon: 'plus',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.UP },
    },
  ];
}

function zoneContent(gladys, record, zone, language) {
  const { reading, info } = record;
  const ids = zoneIds(gladys, info.gw, zone.num);
  const l = labels(language);
  const mode = zoneModeToGladys(zone.mode, reading.cooling);
  const plantMode = reading.plantMode ? l[`plant_${reading.plantMode}`] : null;
  const items = [
    {
      label: pick(TEXT.mode, language),
      value: mode === null ? pick(TEXT.unknown, language) : l[`thermostat_${mode}`],
      icon: 'sliders',
    },
    {
      label: pick(TEXT.heating, language),
      value: yesNo(zone.heatRequest, language),
      icon: 'thermometer',
      color: zone.heatRequest ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (plantMode) {
    items.push({
      label: pick(TEXT.system, language),
      value: truncate(plantMode, 40),
      icon: 'home',
    });
  }
  const faults = faultsRow(record, language);
  if (faults) {
    items.push(faults);
  }
  const offered = zoneGladysModes(zone.modeOptions, false);
  const modeButtons = [
    [3, TEXT.schedule],
    [1, TEXT.manual],
  ]
    .filter(([value]) => offered.includes(value))
    .map(([value, label]) => ({
      type: 'button',
      label: pick(label, language),
      icon: mode === value || (value === 1 && mode === 2) ? 'check-circle' : 'circle',
      style: 'secondary',
      device_feature: ids.feature(FEATURE.MODE),
      value,
    }));
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'value',
        label: pick(TEXT.temperature, language),
        icon: 'thermometer',
        device_feature: ids.feature(FEATURE.TEMPERATURE),
      },
      {
        type: 'value',
        label: pick(TEXT.setpoint, language),
        icon: 'target',
        device_feature: ids.feature(FEATURE.TARGET),
      },
      { type: 'status', items },
      ...setpointButtons(language),
      ...modeButtons,
    ],
  };
}

function plantContent(gladys, record, language) {
  const { reading, info, layout, hasDhw } = record;
  const ids = plantIds(gladys, info.gw);
  const l = labels(language);
  const components = [];
  if (hasDhw && layout.dhwTemperature) {
    components.push({
      type: 'value',
      label: pick(TEXT.hotWater, language),
      icon: 'droplet',
      device_feature: ids.feature(FEATURE.DHW_TEMPERATURE),
    });
  }
  if (hasDhw) {
    components.push({
      type: 'value',
      label: pick(TEXT.setpoint, language),
      icon: 'target',
      device_feature: ids.feature(FEATURE.DHW_TARGET),
    });
  }
  if (layout.pressure) {
    components.push({
      type: 'value',
      label: pick(TEXT.pressure, language),
      icon: 'activity',
      device_feature: ids.feature(FEATURE.PRESSURE),
    });
  }
  const items = [];
  if (reading.plantMode) {
    items.push({
      label: pick(TEXT.system, language),
      value: truncate(l[`plant_${reading.plantMode}`], 40),
      icon: 'home',
    });
  }
  if (layout.flame) {
    items.push({
      label: pick(TEXT.burner, language),
      value: yesNo(reading.flame, language),
      icon: 'zap',
      color: reading.flame ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (layout.heatPump) {
    items.push({
      label: pick(TEXT.heatPump, language),
      value: yesNo(reading.heatPump, language),
      icon: 'wind',
    });
  }
  const faults = faultsRow(record, language);
  if (faults) {
    items.push(faults);
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  if (hasDhw) {
    components.push(...setpointButtons(language));
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

function waterHeaterContent(gladys, record, language) {
  const { reading, info } = record;
  const { family } = info;
  const ids = waterHeaterIds(gladys, info.gw);
  const l = labels(language);
  const components = [
    {
      type: 'value',
      label: pick(TEXT.temperature, language),
      icon: 'thermometer',
      device_feature: ids.feature(FEATURE.TEMPERATURE),
    },
  ];
  const settable = Boolean(family.targetField && family.temperatureWrite);
  if (settable) {
    components.push({
      type: 'value',
      label: pick(TEXT.setpoint, language),
      icon: 'target',
      device_feature: ids.feature(FEATURE.TARGET),
    });
  }
  if (family.showersField) {
    components.push({
      type: 'value',
      label: pick(TEXT.showers, language),
      icon: 'droplet',
      device_feature: ids.feature(FEATURE.SHOWERS),
    });
  }
  const items = [
    {
      label: pick(TEXT.mode, language),
      value: reading.mode === null ? pick(TEXT.unknown, language) : l[`water_${reading.mode}`],
      icon: 'sliders',
    },
  ];
  if (family.heatingField) {
    items.push({
      label: pick(TEXT.heating, language),
      value: yesNo(reading.heating, language),
      icon: 'thermometer',
      color: reading.heating ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  // Med water heaters (Velis Lux, Evo…): Eco, time left, anti-legionella.
  if (reading.eco !== null && reading.eco !== undefined) {
    items.push({
      label: names(language).eco,
      value: yesNo(reading.eco, language),
      icon: 'feather',
      color: reading.eco ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (reading.remaining > 0) {
    items.push({
      label: names(language).remaining_time,
      value: `${reading.remaining} min`,
      icon: 'clock',
    });
  }
  if (reading.antiLegionella) {
    items.push({
      label: names(language).anti_legionella,
      value: pick(TEXT.inProgress, language),
      icon: 'shield',
      color: WIDGET_COLORS.WARNING,
    });
  }
  const faults = faultsRow(record, language);
  if (faults) {
    items.push(faults);
  }
  components.push({ type: 'status', items });
  if (settable) {
    components.push(...setpointButtons(language));
  }
  if (Object.values(family.modes).includes(WATER_HEATER_MODE.BOOST)) {
    // A tap on the Boost while boosting ends it (forum t/10385/254): back to
    // the mode seen before it, else the first mode of the family.
    const boosting = reading.mode === WATER_HEATER_MODE.BOOST;
    const back =
      record.lastMode ??
      Object.values(family.modes).find((mode) => mode !== WATER_HEATER_MODE.BOOST);
    components.push({
      type: 'button',
      label: boosting ? pick(TEXT.stopBoost, language) : l[`water_${WATER_HEATER_MODE.BOOST}`],
      icon: boosting ? 'check-circle' : 'zap',
      style: 'secondary',
      device_feature: ids.feature(FEATURE.MODE),
      value: boosting ? back : WATER_HEATER_MODE.BOOST,
    });
  }
  components.push({
    type: 'button',
    label: pick(reading.on === false ? TEXT.on : TEXT.off, language),
    icon: 'power',
    style: 'secondary',
    device_feature: ids.feature(FEATURE.POWER),
    value: reading.on === false ? 1 : 0,
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * The widget content for the device chosen in its settings.
 * @param {object} gladys
 * @param {object|null} data from hub.widgetData(), null if unknown
 * @param {string} language the user's language, given by the core
 */
export function buildWidgetContent(gladys, data, language) {
  if (!data) {
    return textContent(TEXT.pickDevice, language);
  }
  const { type, record, zone } = data;
  if (!record.reading || (type === DEVICE_TYPE.ZONE && !zone)) {
    return textContent(TEXT.notRead, language);
  }
  if (type === DEVICE_TYPE.ZONE) {
    return zoneContent(gladys, record, zone, language);
  }
  if (type === DEVICE_TYPE.PLANT) {
    return plantContent(gladys, record, language);
  }
  return waterHeaterContent(gladys, record, language);
}

/**
 * The setpoint feature a widget acts on, and the new value one step away.
 * @returns {{ featureExternalId: string, value: number } | null}
 */
export function nextSetpoint(gladys, data, actionKey) {
  if (!data?.record?.reading) {
    return null;
  }
  const direction =
    actionKey === WIDGET_ACTIONS.UP ? 1 : actionKey === WIDGET_ACTIONS.DOWN ? -1 : 0;
  if (direction === 0) {
    return null;
  }
  const { type, record, zone } = data;
  const { gw } = record.info;
  let current;
  let range;
  let featureExternalId;
  if (type === DEVICE_TYPE.ZONE && zone) {
    current = zone.target;
    range = zone.targetRange;
    featureExternalId = zoneIds(gladys, gw, zone.num).feature(FEATURE.TARGET);
  } else if (type === DEVICE_TYPE.PLANT && record.hasDhw) {
    current = record.reading.dhwTarget;
    range = record.reading.dhwTargetRange;
    featureExternalId = plantIds(gladys, gw).feature(FEATURE.DHW_TARGET);
  } else if (type === DEVICE_TYPE.WATER_HEATER) {
    current = record.reading.target;
    range = { step: 1 };
    featureExternalId = waterHeaterIds(gladys, gw).feature(FEATURE.TARGET);
  }
  if (typeof current !== 'number') {
    return null;
  }
  return { featureExternalId, value: Number((current + direction * range.step).toFixed(2)) };
}
