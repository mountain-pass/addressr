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
import { startServer, stopServer } from '../../swagger';
import { AddressrEmbeddedDriver } from './drivers/AddressrEmbeddedDriver';
import { AddressrRestDriver } from './drivers/AddressrRestDriver';
const fsp = fs.promises;
const elasticsearch = require('elasticsearch');

const logger = debug('test');
const esLogger = debug('es');

// import ShutdownHook from 'shutdown-hook';

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
// const esnode = process.env.ELASTIC_NODE || 'local';
// const esstart = process.env.ELASTIC_START || 1;

const INDEX_NAME = 'addressr';
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
  this.logStream = await cont.logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: 50,
  });

  this.logStream.setEncoding('utf8');
  this.logStream.on('data', function(data) {
    esLogger(data);
  });

  // try {
  global.esClient = new elasticsearch.Client({
    host: `${eshost}:${esport}`,
    log: 'info',
  });

  await initIndex(global.esClient, INDEX_NAME, true);
});

AfterAll({ timeout: 30000 }, async function() {
  stopServer();
  //delete global.esClient;
  this.logStream.destroy();
});

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
