//const logWhy = require('why-is-node-running');
// import chaiIterator from 'chai-iterator';
import {
  //   AfterAll, Before,
  AfterAll,
  BeforeAll,
  setWorldConstructor,
} from '@cucumber/cucumber';
import debug from 'debug';
import fs from 'node:fs';
import waitport from 'wait-port';
import {
  esConnect,
  ES_INDEX_NAME,
  ES_LOCALITY_INDEX_NAME,
} from '../../packages/addressr/client/elasticsearch.js';
import { awaitIndexReady } from './index-ready.js';
import { AddressrRest2Driver } from './drivers/AddressrRest2Driver.js';
import { AddressrRest2EmbeddedDriver } from './drivers/AddressrRest2EmbeddedDriver.js';
import {
  startRest2Server,
  stopServer as stopRest2Server,
} from '../../packages/addressr/src/waycharter-server.js';

const fsp = fs.promises;

const logger = debug('test');

// The driver the step definitions run against, chosen by profile in BeforeAll
// and read by the world constructor below. Module-scoped rather than a property
// on the global object: it has exactly one reader and it is in this file. The
// global existed because the profile switch and the world constructor are
// different scopes, which a module-level binding already solves.
//
// A field on a `const` holder rather than a bare `let`, for the same reason
// `createServerLifecycle()` closes over its handle: assigning a module-level
// binding from inside a function is the shape `unicorn/no-top-level-assignment-in-function`
// objects to, and the object form sidesteps it without a suppression.
const active = { driver: undefined };

const TEST_PROFILE = process.env.TEST_PROFILE || 'default';

var serverPort = process.env.PORT || 8080;

async function startExternalServer() {
  await waitport({
    port: Number.parseInt(serverPort),
    timeout: 60_000,
  });
  return `http://localhost:${serverPort}`;
}

BeforeAll({ timeout: 240_000 }, async function () {
  logger('BEFORE ALL');
  switch (TEST_PROFILE) {
    case 'rest2': {
      active.driver = new AddressrRest2Driver(await startRest2Server());
      break;
    }
    case 'cli2': {
      active.driver = new AddressrRest2Driver(await startExternalServer());
      break;
    }
    case 'default': {
      active.driver = new AddressrRest2EmbeddedDriver();
      break;
    }
    default: {
      return 'pending';
    }
  }

  await fsp.mkdir('./target/Elasticsearch/data', { recursive: true });
  const cwd = process.cwd();
  logger(`cwd`, cwd);
  this.containers = {};
  await esConnect();

  // P097. `startExternalServer` waits on the TCP port, and the port opens before
  // the index answers a query — so up to here the only readiness this suite has
  // ever asserted is "something is listening". Three legs started against an
  // index that was present and not yet searchable and failed as
  // `expected [] not to be empty` inside a step definition, which is a symptom
  // consistent with an absent index, an empty one and an unrefreshed one alike.
  // The gate below waits for the real precondition and, when it times out, says
  // which of those three happened. Placed AFTER esConnect() because it needs the
  // client that call installs.
  //
  // BOTH indices, not just the address one. `localitiesv2.feature` asserts the
  // same not-empty shape against `ES_LOCALITY_INDEX_NAME`, which is a separate
  // index with its own refresh. Gating on the address index alone would leave
  // that half exposed AND actively mislead: a locality-side recurrence would
  // print `index test-geo ready: N documents, searchable` immediately above an
  // empty locality list, which reads as evidence against the refresh race.
  await awaitIndexReady({ client: globalThis.esClient, index: ES_INDEX_NAME });
  await awaitIndexReady({
    client: globalThis.esClient,
    index: ES_LOCALITY_INDEX_NAME,
  });
});

AfterAll({ timeout: 30_000 }, async function () {
  // AWAITED deliberately. Unawaited, this returns a promise nobody holds, so
  // teardown reports success whether the drain completed or did nothing at all
  // — which made this tier unable to distinguish a working stopServer() from
  // one that resolves instantly on an untracked handle (P033). Awaiting means a
  // drain that never finishes fails here, against the 30s budget, instead of
  // passing quietly.
  await stopRest2Server();
  //delete global.esClient;
  if (this.logStream) {
    this.logStream.destroy();
  }
});

function world({ attach, parameters }) {
  logger('IN WORLD');
  this.attach = attach;
  this.parameters = parameters;
  this.driver = active.driver;
}

setWorldConstructor(world);

// Before(function (testCase) {
//   this.testCase = testCase;
//   this.scenarioId = `${this.testCase.sourceLocation.uri.replace(/\//g, '-')}-${this.testCase.sourceLocation.line}`;
//   this.normTitle = title => `${title}-${this.scenarioId}`;
// });
