// -----------------------------------------------------------------------------
// Entry point: wires the Gladys SDK to the agenda (src/app.js). No agenda
// logic here. Handlers are registered before connect().
//
// Environment provided by the Gladys supervisor: GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR (read by the SDK).
// Dates are read in Europe/Paris whatever TZ says: the events are in Toulouse.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
const app = registerHandlers(gladys, {
  userAgent: `gladys-toulouse-agenda/${version} (+https://github.com/guim31/gladys-toulouse-agenda)`,
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal}, stopping`);
  return app.stop();
});

logger.info(`Starting the Toulouse agenda integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
