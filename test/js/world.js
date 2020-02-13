//const logWhy = require('why-is-node-running');
import {
  PendingError,
  stepDefinitionWrapper
} from '@windyroad/cucumber-js-throwables';
import qc from '@windyroad/quick-containers-js';
import chai from 'chai';
// import chaiIterator from 'chai-iterator';
import {
  // eslint-disable-next-line indent
  //   AfterAll, Before,
  AfterAll,
  BeforeAll,
  setDefinitionFunctionWrapper,
  setWorldConstructor
} from 'cucumber';
import debug from 'debug';
import Docker from 'dockerode';
import fs from 'fs';
import waitport from 'wait-port';
import { esConnect, initIndex } from '../../client/elasticsearch';
import { startServer, stopServer } from '../../swagger';
import { AddressrEmbeddedDriver } from './drivers/AddressrEmbeddedDriver';
import { AddressrRestDriver } from './drivers/AddressrRestDriver';

const fsp = fs.promises;

const logger = debug('test');
const esLogger = debug('es');

global.expect = chai.expect;
global.PendingError = PendingError;

const TEST_PROFILE = process.env.TEST_PROFILE || 'default';

const SEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch-oss:7.2.0';

BeforeAll({ timeout: 240000 }, async function() {
  logger('BEFORE ALL');
  switch (TEST_PROFILE) {
    case 'system':
      global.driver = new AddressrRestDriver(await startServer());
      break;
    default:
      global.driver = new AddressrEmbeddedDriver();
      break;
  }

  await fsp.mkdir('./target/Elasticsearch/data', { recursive: true });
  const cwd = process.cwd();
  logger(`cwd`, cwd);
  this.containers = {};
  const docker = new Docker();
  await startElasticSearch(docker, this);
  await initIndex(global.esClient, true);
});

AfterAll({ timeout: 30000 }, async function() {
  stopServer();
  //delete global.esClient;
  this.logStream.destroy();
});

async function startElasticSearch(docker, context) {
  await qc.ensurePulled(docker, SEARCH_IMAGE, logger);
  context.containers.es = await qc.ensureStarted(
    docker,
    {
      Image: SEARCH_IMAGE,
      Tty: false,
      ExposedPorts: {
        '9200/tcp': {},
        '9300/tcp': {}
      },
      HostConfig: {
        PortBindings: {
          '9200/tcp': [{ HostPort: '9200' }],
          '9300/tcp': [{ HostPort: '9300' }]
        },
        Binds: [
          // When we used the local file system, ES freaked out about the lack of space 🤷‍♂️
          // `${cwd}/target/Elasticsearch/data:/var/data/elasticsearch`,
          // `${cwd}/target/Elasticsearch/log:/var/log/elasticsearch`,
          // `${cwd}/test/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml`,
        ]
      },
      Env: ['discovery.type=single-node', 'ES_JAVA_OPTS=-Xms1g -Xmx1g'],
      name: 'qc-elasticsearch-test'
    },
    () =>
      waitport({
        port: 9200,
        timeout: 60000
      })
  );
  const cont = docker.getContainer('qc-elasticsearch-test');
  context.logStream = await cont.logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: 50
  });
  context.logStream.setEncoding('utf8');
  context.logStream.on('data', function(data) {
    esLogger(data);
  });
  await esConnect();
}

function world({ attach, parameters }) {
  logger('IN WORLD');
  this.attach = attach;
  this.parameters = parameters;
  this.driver = global.driver;
}

setWorldConstructor(world);

setDefinitionFunctionWrapper(stepDefinitionWrapper);

// Before(function (testCase) {
//   this.testCase = testCase;
//   this.scenarioId = `${this.testCase.sourceLocation.uri.replace(/\//g, '-')}-${this.testCase.sourceLocation.line}`;
//   this.normTitle = title => `${title}-${this.scenarioId}`;
// });
