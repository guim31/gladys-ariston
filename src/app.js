// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys
// in the tests) and returns the hub, so index.js stays a few lines and the
// tests drive the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { AristonHub, WIDGET_KEY } from './hub.js';
import { pick, TEXT } from './i18n.js';
import { Store } from './store.js';
import { buildWidgetContent, nextSetpoint } from './widgets.js';

const logger = createLogger({ name: 'ariston-app' });

export const ACTION_KEYS = { TEST_CONNECTION: 'test_connection' };
export const WIDGET_KEYS = [WIDGET_KEY];

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, fetch, timers, now, clientOptions
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new AristonHub({
    gladys,
    store: options.store ?? new Store(),
    fetch: options.fetch,
    timers: options.timers ?? true,
    now: options.now,
    clientOptions: options.clientOptions,
  });

  // Discovery tab: the account is listed again (the user asked for it).
  gladys.onScanRequest(async () => {
    logger.info('Scan requested from the Discovery tab');
    if (hub.client) {
      await hub.discover().catch((err) => hub.reportFailure('discovery', err));
    } else {
      await hub.publishDevices();
    }
  });

  gladys.onSetValue((device, feature, value) => hub.setValue(device, feature, value));

  // The core's poll is a fallback: the hub refreshes on its own timer.
  gladys.onPoll((device) => hub.pollFromCore(device));
  gladys.onDeviceCreated((device) => hub.deviceCreated(device));
  gladys.onDeviceUpdated((device) => hub.deviceCreated(device));

  gladys.onAction(ACTION_KEYS.TEST_CONNECTION, () => hub.testConnection());

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language }) =>
    buildWidgetContent(gladys, hub.widgetData(settings?.device), language),
  );

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, _params, { settings } = {}) => {
    const language = hub.config?.language ?? 'en';
    const next = nextSetpoint(gladys, hub.widgetData(settings?.device), actionKey);
    if (!next) {
      throw new Error(pick(TEXT.notRead, language));
    }
    await hub.setValue(
      { external_id: settings.device },
      { external_id: next.featureExternalId },
      next.value,
    );
    return `${pick(TEXT.setpoint, language)}: ${next.value} °C`;
  });

  gladys.onConfigUpdated(async (raw) => {
    logger.info('Configuration updated');
    await hub.start(normalizeConfig(raw));
  });

  gladys.on('connected', async () => {
    try {
      await hub.start(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  gladys.on('disconnected', () => hub.stop());

  return {
    hub,
    async stop() {
      hub.stop();
      await (options.store ?? hub.store).flush();
    },
  };
}
