import debug from 'debug';
import esStarter from './service/elasticsearch';
import { startServer } from './swagger';
const esport = parseInt(process.env.ELASTIC_PORT || '9200');
const eshost = process.env.ELASTIC_HOST || '127.0.0.1';
const esnode = process.env.ELASTIC_NODE || 'local';
const esstart = process.env.ELASTIC_START || 1;

const INDEX_NAME = 'addressr';
const clearIndex = true;

const logger = debug('api');

esStarter(esport, eshost, esnode, esstart, INDEX_NAME, clearIndex)
  .then(esclient => {
    global.esclient = esclient;
    logger('');
    //return require('./advisers')(app, esclient, esport, eshost, INDEX_NAME);
  })
  .then(() => {
    startServer();
  });
