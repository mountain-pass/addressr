//const logWhy = require('why-is-node-running');
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
import fs from 'fs';
import waitport from 'wait-port';
import { esConnect } from '../../client/elasticsearch';
import { mongoConnect } from '../../client/mongo';
import { startServer, stopServer } from '../../swagger';
import { AddressrEmbeddedDriver } from './drivers/AddressrEmbeddedDriver';
import { AddressrRestDriver } from './drivers/AddressrRestDriver';
const fsp = fs.promises;

const logger = debug('test');
const esLogger = debug('es');
const mongoLogger = debug('mongo');

global.expect = chai.expect;
global.PendingError = PendingError;

const TEST_PROFILE = process.env.TEST_PROFILE || 'default';

const SEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch-oss:7.2.0';
const STORE_IMAGE = 'mongo:4.0.11';

const INDEX_NAME = process.env.INDEX_NAME || 'addressr';
const STORE_NAME = process.env.STORE_NAME || 'addressr';

// const clearIndex = true;

async function initIndex(esClient, index, clear) {
  if (await esClient.indices.exists({ index })) {
    if (clear) {
      await esClient.indices.delete({ index });
    }
  }
  logger('checking if index exists');
  const exists = await esClient.indices.exists({ index });
  logger('index exists:', exists);

  if (!exists) {
    await esClient.indices.create({
      index,
      body: {
        settings: {
          index: {
            analysis: {
              analyzer: {
                default: {
                  tokenizer: 'my_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
                synonym: {
                  tokenizer: 'my_tokenizer',
                  filter: ['lowercase', 'synonym'],
                },
                my_analyzer: {
                  tokenizer: 'my_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
              },
              tokenizer: {
                my_tokenizer: {
                  type: 'edge_ngram',
                  min_gram: 3,
                  max_gram: 15,
                  //token_chars: ['letter', 'digit'],
                },
              },
              filter: {
                synonym: {
                  type: 'synonym',
                  lenient: true,
                  synonyms: [
                    'SUPER, super, superannuation',
                    'SMSF, smsf, self-managed superannuation funds, self managed superannuation funds',
                  ],
                },
              },
            },
          },
        },
        aliases: {},
        mappings: {
          properties: {
            sla: {
              type: 'text',
              analyzer: 'my_analyzer',
            },
            ssla: {
              type: 'text',
              analyzer: 'my_analyzer',
            },
          },
        },
      },
    });
  }
  await esClient.indices.get({ index, includeDefaults: true });
}

async function initStore(mongoClient, dbName, clear) {
  const db = await mongoClient.db(dbName);
  if (clear) {
    try {
      await db.dropCollection(dbName);
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound') {
        // already dropped. Ignore error.
      } else {
        throw err;
      }
    }
  }

  return db.collection(dbName);
}

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
  await initIndex(global.esClient, INDEX_NAME, true);

  await startMongo(docker, this);
  // eslint-disable-next-line require-atomic-updates
  global.addressrCollection = await initStore(
    global.mongoClient,
    STORE_NAME,
    true,
  );
});

AfterAll({ timeout: 30000 }, async function() {
  stopServer();
  //delete global.esClient;
  this.logStream.destroy();
  this.mongoLogStream.destroy();
  global.mongoClient.close();
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
        '9300/tcp': {},
      },
      HostConfig: {
        PortBindings: {
          '9200/tcp': [{ HostPort: '9200' }],
          '9300/tcp': [{ HostPort: '9300' }],
        },
        Binds: [
          // When we used the local file system, ES freaked out about the lack of space 🤷‍♂️
          // `${cwd}/target/Elasticsearch/data:/var/data/elasticsearch`,
          // `${cwd}/target/Elasticsearch/log:/var/log/elasticsearch`,
          // `${cwd}/test/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml`,
        ],
      },
      Env: ['discovery.type=single-node', 'ES_JAVA_OPTS=-Xms1g -Xmx1g'],
      name: 'qc-elasticsearch-test',
    },
    () =>
      waitport({
        port: 9200,
        timeout: 60000,
      }),
  );
  const cont = docker.getContainer('qc-elasticsearch-test');
  context.logStream = await cont.logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: 50,
  });
  context.logStream.setEncoding('utf8');
  context.logStream.on('data', function(data) {
    esLogger(data);
  });
  await esConnect();
}

async function startMongo(docker, context) {
  await qc.ensurePulled(docker, STORE_IMAGE, logger);
  context.containers.mongo = await qc.ensureStarted(
    docker,
    {
      Image: STORE_IMAGE,
      Tty: false,
      ExposedPorts: {
        '27017/tcp': {},
      },
      HostConfig: {
        PortBindings: {
          '27017/tcp': [{ HostPort: '27017' }],
        },
      },
      Env: [
        'MONGO_INITDB_ROOT_USERNAME=root',
        'MONGO_INITDB_ROOT_PASSWORD=example',
      ],
      name: 'qc-mongo-test',
    },
    () =>
      waitport({
        port: 27017,
        timeout: 60000,
      }),
  );
  const cont = docker.getContainer('qc-mongo-test');
  context.mongoLogStream = await cont.logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: 50,
  });
  context.mongoLogStream.setEncoding('utf8');
  context.mongoLogStream.on('data', function(data) {
    mongoLogger(data);
  });
  await mongoConnect();
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
