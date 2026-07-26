import debug from 'debug';
import { esConnect } from '../client/elasticsearch';
import { printVersion } from '../service/print-version';
import {
  startRest2Server,
  stopServer,
  forceCloseConnections,
} from './waycharter-server';
import { installShutdownHandlers } from './graceful-shutdown';

const logger = debug('api');

// Before listen(), so a bad ADDRESSR_SHUTDOWN_TIMEOUT_MS fails startup rather
// than binding the port and then crashing, and so a signal arriving during
// startup drains rather than killing the process (P067).
installShutdownHandlers({ stop: stopServer, force: forceCloseConnections });

startRest2Server()
  .then(async () => {
    logger('connecting es client');
    const esClient = await esConnect();
    globalThis.esClient = esClient;
    logger('es client connected');

    console.log('=======================');
    console.log('Addressr - API Server 2');
    console.log('=======================');

    printVersion();
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    throw error;
  });
