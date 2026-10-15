// -----------------------------------------------------------------------------
// The dashboard widget: every content fits the core's vocabulary and budget
// (validateWidgetContent: [] means "rendered exactly as sent"), every tile and
// button points at a feature the device really has, and the setpoint buttons
// write one step away.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { GW } from './helpers/fakeCloud.js';
import { createAll, createWorld, discovered } from './helpers/world.js';

const id = (suffix) => `ext:test-integration:${suffix}`;

const DEVICES = [
  `plant:${GW.GENUS}`,
  `zone:${GW.GENUS}-1`,
  `plant:${GW.NIMBUS}`,
  `zone:${GW.NIMBUS}-2`,
  `water_heater:${GW.LYDOS_HYBRID}`,
  `water_heater:${GW.LUX}`,
  `water_heater:${GW.NUOS}`,
  `water_heater:${GW.EVO}`,
];

test('every widget content fits the vocabulary and points at existing features', async () => {
  const w = await createWorld({ config: { energy: true } });
  try {
    for (const deviceId of DEVICES) {
      const device = discovered(w, id(deviceId));
      const features = new Set(device.features.map((feature) => feature.external_id));
      for (const language of ['en', 'fr', 'de', 'es']) {
        const ack = await w.gladys.fake.widgetGet('overview', {
          settings: { device: id(deviceId) },
          language,
          units: 'metric',
        });
        assert.equal(ack.success, true, ack.error);
        const content = ack.data.content;
        assert.deepEqual(validateWidgetContent(content), [], `${deviceId} (${language})`);
        assert.ok(content.components.length >= 3, `${deviceId}: a real content`);
        for (const component of content.components) {
          if (component.device_feature) {
            assert.ok(
              features.has(component.device_feature),
              `${deviceId}: ${component.device_feature} is not a feature of the device`,
            );
          }
          if (component.type === 'button') {
            assert.notEqual(component.style, 'primary', 'invisible in dark mode (#3153)');
          }
        }
        const actions = content.components
          .filter((component) => component.action)
          .map((component) => component.action.key);
        assert.equal(new Set(actions).size, actions.length, 'distinct action keys');
      }
    }
  } finally {
    await w.app.stop();
  }
});

test('the widget asks to pick a device when none is set, or an unknown one', async () => {
  const w = await createWorld();
  try {
    for (const settings of [{}, { device: id('zone:UNKNOWN-1') }]) {
      const ack = await w.gladys.fake.widgetGet('overview', { settings, language: 'fr' });
      assert.deepEqual(validateWidgetContent(ack.data.content), []);
      assert.match(ack.data.content.components[0].text, /Choisissez un appareil/);
    }
  } finally {
    await w.app.stop();
  }
});

test('the current zone mode is marked by the check-circle icon', async () => {
  const w = await createWorld();
  try {
    const ack = await w.gladys.fake.widgetGet('overview', {
      settings: { device: id(`zone:${GW.GENUS}-1`) },
      language: 'en',
    });
    const buttons = ack.data.content.components.filter((c) => c.device_feature?.endsWith(':mode'));
    assert.deepEqual(
      buttons.map((button) => [button.label, button.icon, button.value]),
      [
        ['Schedule', 'check-circle', 3],
        ['Manual', 'circle', 1],
      ],
    );
  } finally {
    await w.app.stop();
  }
});

test('the setpoint buttons write one step away from the current setpoint', async () => {
  const w = await createWorld();
  try {
    await createAll(w);
    const zone = id(`zone:${GW.GENUS}-1`);
    const up = await w.gladys.fake.widgetAction(
      'overview',
      'setpoint_up',
      {},
      {
        settings: { device: zone },
      },
    );
    assert.equal(up.success, true, up.error);
    assert.equal(w.gladys.fake.lastState(`${zone}:target`), 21);
    await w.gladys.fake.widgetAction(
      'overview',
      'setpoint_down',
      {},
      { settings: { device: zone } },
    );
    await w.gladys.fake.widgetAction(
      'overview',
      'setpoint_down',
      {},
      { settings: { device: zone } },
    );
    assert.equal(w.gladys.fake.lastState(`${zone}:target`), 20);

    const heater = id(`water_heater:${GW.LYDOS_HYBRID}`);
    await w.gladys.fake.widgetAction(
      'overview',
      'setpoint_up',
      {},
      { settings: { device: heater } },
    );
    assert.equal(w.gladys.fake.lastState(`${heater}:target`), 54);

    const plant = id(`plant:${GW.GENUS}`);
    await w.gladys.fake.widgetAction(
      'overview',
      'setpoint_down',
      {},
      { settings: { device: plant } },
    );
    assert.equal(w.gladys.fake.lastState(`${plant}:dhw_target`), 49);
  } finally {
    await w.app.stop();
  }
});

test('a setpoint button beyond the range is refused, the toast says why', async () => {
  const w = await createWorld();
  try {
    await createAll(w);
    const heater = id(`water_heater:${GW.LYDOS_HYBRID}`);
    for (let i = 0; i < 9; i += 1) {
      await w.gladys.fake.widgetAction(
        'overview',
        'setpoint_up',
        {},
        { settings: { device: heater } },
      );
    }
    const refused = await w.gladys.fake.widgetAction(
      'overview',
      'setpoint_up',
      {},
      {
        settings: { device: heater },
      },
    );
    assert.equal(refused.success, false);
    assert.match(refused.error, /40 à 62 °C/);
    assert.equal(w.gladys.fake.lastState(`${heater}:target`), 62);
  } finally {
    await w.app.stop();
  }
});
