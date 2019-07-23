import {
  PendingError,
  stepDefinitionWrapper,
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
  setWorldConstructor,
} from 'cucumber';
import debug from 'debug';
import Docker from 'dockerode';
import waitport from 'wait-port';
import esStarter from '../../service/elasticsearch';
import { startServer, stopServer } from '../../swagger';
import { AddressrEmbeddedDriver } from './drivers/AddressrEmbeddedDriver';
import { AddressrRestDriver } from './drivers/AddressrRestDriver';
const logger = debug('test');

// import fastify from 'fastify';
// import mysql from 'mysql';
// import ShutdownHook from 'shutdown-hook';
// import { RyvrApp } from '../../main/js/model/RyvrApp';
// import routes from '../../main/js/routes';
// import RyvrEmbeddedDriver from './drivers/RyvrEmbeddedDriver';
// import RyvrRestDriver from './drivers/RyvrRestDriver';

// chai.use(chaiIterator);

// const shutdownHook = new ShutdownHook();
// shutdownHook.register();
// shutdownHook.on('ShutdownStarted', () => logger('it has began'));
// shutdownHook.on('ComponentShutdown', e => logger('shutting down', e.name));
// shutdownHook.on('ShutdownEnded', () => logger('it has ended'));

global.expect = chai.expect;
global.PendingError = PendingError;

const TEST_PROFILE = process.env.TEST_PROFILE || 'default';

const SEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch-oss:7.2.0';

const esport = parseInt(process.env.ELASTIC_PORT || '9200');
const eshost = process.env.ELASTIC_HOST || '127.0.0.1';
const esnode = process.env.ELASTIC_NODE || 'local';
const esstart = process.env.ELASTIC_START || 1;

const INDEX_NAME = 'addressr';
const clearIndex = true;

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
  //   logger(swaggerDoc);

  this.containers = {};
  const docker = new Docker();
  await qc.ensurePulled(docker, SEARCH_IMAGE, logger);
  this.containers.es = await qc.ensureStarted(
    docker,
    {
      Image: SEARCH_IMAGE,
      Tty: false,
      ExposedPorts: {
        '9200/tcp': {},
        '9300/tcp': {},
      },
      HostConfig: {
        PortBindings: {
          '9200/tcp': [{ HostPort: '9200' }],
          '9300/tcp': [{ HostPort: '9300' }],
        },
      },
      Env: ['discovery.type=single-node'],
      name: 'qc-elasticsearch-test',
    },
    () =>
      waitport({
        port: 9200,
        timeout: 60000,
      }),
  );

  global.esClient = await esStarter(
    esport,
    eshost,
    esnode,
    esstart,
    INDEX_NAME,
    clearIndex,
  );
});

//   this.containers.mysql = await qc.ensureMySqlStarted(docker, '5.7.26');

//   global.mysqlTestConn = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: 'my-secret-pw',
//     port: 3306,
//   });

//   await new Promise((resolve, reject) => {
//     global.mysqlTestConn.connect((err) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve();
//       }
//     });
//   });

//   global.fastifyServer = fastify({
//     logger: false,
//   });
//   global.ryvrApp = new RyvrApp();
//   global.fastifyServer.register(routes, { ryvrApp: global.ryvrApp });
//   global.serverUrl = await global.fastifyServer.listen(3000);
// });

AfterAll({ timeout: 30000 }, async function() {
  stopServer();
});
//   await new Promise((resolve, reject) => {
//     global.mysqlTestConn.end((err) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve();
//       }
//     });
//   });

//   if (global.fastifyServer) {
//     await global.fastifyServer.close();
//   }
// });

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
