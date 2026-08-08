import debug from 'debug';
import { esConnect } from '../client/elasticsearch.js';
import { printVersion } from '../service/print-version.js';
import {
  startRest2Server,
  stopServer,
  forceCloseConnections,
} from './waycharter-server.js';
import { installShutdownHandlers } from './graceful-shutdown.js';

const logger = debug('api');

// Before listen(), so a bad ADDRESSR_SHUTDOWN_TIMEOUT_MS fails startup rather
// than binding the port and then crashing, and so a signal arriving during
// startup drains rather than killing the process (P067).
installShutdownHandlers({ stop: stopServer, force: forceCloseConnections });

/* eslint-disable unicorn/prefer-await -- This is a top-level entry-point chain, not
   a function body. Converting it to `await` at module top level changes when the
   process settles and how an unhandled rejection surfaces on a CLI whose exit
   code is its contract, for no behavioural gain. The `.catch` at the end is the
   process's error handler. Tracked on P084. */
startRest2Server()
  .then(async () => {
    logger('connecting es client');
    const esClient = await esConnect();
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- pre-existing: `globalThis.esClient` is how the OpenSearch client is shared with step definitions and the shutdown path. Rewiring it is a change to how the app shares state, not part of the module-system migration. Tracked on P084.
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
/* eslint-enable unicorn/prefer-await */
