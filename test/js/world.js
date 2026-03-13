//const logWhy = require('why-is-node-running');
import chai from 'chai';
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
import { esConnect } from '../../client/elasticsearch';
import { startServer, stopServer } from '../../swagger';
import { AddressrEmbeddedDriver } from './drivers/AddressrEmbeddedDriver';
import { AddressrRestDriver } from './drivers/AddressrRestDriver';
import { AddressrRest2Driver } from './drivers/AddressrRest2Driver';
import { startRest2Server } from '../../src/waycharterServer';

const fsp = fs.promises;

const logger = debug('test');

global.expect = chai.expect;

const TEST_PROFILE = process.env.TEST_PROFILE || 'default';

var serverPort = process.env.PORT || 8080;

async function startExternalServer() {
  await waitport({
    port: Number.parseInt(serverPort),
    timeout: 60_000,
  });
  return `http://localhost:${serverPort}`;
}

async function ensureDockerServerStarted() {
  // wait till running
  return 'pending';
}

BeforeAll({ timeout: 240_000 }, async function () {
  logger('BEFORE ALL');
  switch (TEST_PROFILE) {
    case 'rest': {
      global.driver = new AddressrRestDriver(await startServer());
      break;
    }
    case 'rest2': {
      global.driver = new AddressrRest2Driver(await startRest2Server());
      break;
    }
    case 'cli': {
      global.driver = new AddressrRestDriver(await startExternalServer());
      break;
    }
    case 'cli2': {
      global.driver = new AddressrRest2Driver(await startExternalServer());
      break;
    }
    case 'docker': {
      global.driver = new AddressrRestDriver(await ensureDockerServerStarted());
      break;
    }
    case 'default': {
      global.driver = new AddressrEmbeddedDriver();
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
  stopServer();
  //delete global.esClient;
  if (this.logStream) {
    this.logStream.destroy();
  }
});

function world({ attach, parameters }) {
  logger('IN WORLD');
  this.attach = attach;
  this.parameters = parameters;
  this.driver = global.driver;
}

setWorldConstructor(world);

// Before(function (testCase) {
//   this.testCase = testCase;
//   this.scenarioId = `${this.testCase.sourceLocation.uri.replace(/\//g, '-')}-${this.testCase.sourceLocation.line}`;
//   this.normTitle = title => `${title}-${this.scenarioId}`;
// });
