// -----------------------------------------------------------------------------
// Entry point of the Ariston NET integration for Gladys Assistant.
//
// The SDK reads GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR from the environment the supervisor provides.
// Every handler lives in src/app.js, so the tests run the same wiring.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const app = registerHandlers(gladys);

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}, stopping`);
  return app.stop(); // stops the timer, waits for the last write under /data
});

logger.info('Starting the Ariston NET integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
