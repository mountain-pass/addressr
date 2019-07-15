import {
  PendingError,
  stepDefinitionWrapper,
} from '@windyroad/cucumber-js-throwables';
// import qc from '@windyroad/quick-containers-js';
import chai from 'chai';
// import chaiIterator from 'chai-iterator';
import {
  // eslint-disable-next-line indent
  //   AfterAll, Before,
  BeforeAll,
  setDefinitionFunctionWrapper,
  setWorldConstructor,
} from 'cucumber';
import debug from 'debug';
import { swaggerDoc, swaggerInit } from '../../swagger';
var logger = debug('test');

// import Docker from 'dockerode';
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
// shutdownHook.on('ShutdownStarted', () => console.log('it has began'));
// shutdownHook.on('ComponentShutdown', e => console.log('shutting down', e.name));
// shutdownHook.on('ShutdownEnded', () => console.log('it has ended'));

global.expect = chai.expect;
global.PendingError = PendingError;

// const DB_IMAGE = 'mysql:5.7.26';

BeforeAll({ timeout: 60000 }, async function() {
  await swaggerInit();
  logger(swaggerDoc);
});
//   this.containers = {};

//   const docker = new Docker();
//   await qc.ensurePulled(docker, DB_IMAGE, console.log);

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

// AfterAll({ timeout: 30000 }, async function () {
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
  this.attach = attach;
  this.parameters = parameters;
  //   switch (parameters.client) {
  //     case 'rest':
  //       this.driver = new AddressrRestDriver();
  //       break;
  //     default:
  //       this.driver = new AddressrEmbeddedDriver();
  //       break;
  //   }
}

setWorldConstructor(world);

setDefinitionFunctionWrapper(stepDefinitionWrapper);

// Before(function (testCase) {
//   this.testCase = testCase;
//   this.scenarioId = `${this.testCase.sourceLocation.uri.replace(/\//g, '-')}-${this.testCase.sourceLocation.line}`;
//   this.normTitle = title => `${title}-${this.scenarioId}`;
// });
