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
import { esConnect } from '../../client/elasticsearch.js';
import { AddressrRest2Driver } from './drivers/AddressrRest2Driver.js';
import { AddressrRest2EmbeddedDriver } from './drivers/AddressrRest2EmbeddedDriver.js';
import {
  startRest2Server,
  stopServer as stopRest2Server,
} from '../../src/waycharter-server.js';

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
