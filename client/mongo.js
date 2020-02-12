import debug from 'debug';
import mongodb from 'mongodb';
import waitPort from 'wait-port';
const logger = debug('api');
const error = debug('error');

let MONGO_PORT = parseInt(process.env.MONGO_PORT || '27017');
let MONGO_HOST = process.env.MONGO_HOST || '127.0.0.1';

export const MONGO_URL =
  process.env.MONGO_URL || `mongodb://${MONGO_HOST}:${MONGO_PORT}`;
const MONGO_URL_url = new URL(MONGO_URL);
MONGO_HOST = MONGO_URL_url.hostname;
MONGO_PORT = parseInt(MONGO_URL_url.port || '27017');
const MONGO_USERNAME = process.env.MONGO_USERNAME || 'root';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'example';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'addressr';
const MONGO_COLLECTION_NAME = process.env.MONGO_COLLECTION_NAME || 'addressr';

// - dec
// - 4th dec

export async function mongoConnect(
  port = MONGO_PORT,
  host = MONGO_HOST,
  username = MONGO_USERNAME,
  password = MONGO_PASSWORD,
  dbName = MONGO_DB_NAME,
  collectionName = MONGO_COLLECTION_NAME,
  interval = 1000,
  timeout = 0
) {
  // we keep trying to connect, no matter what
  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log(`trying to reach mongo on ${MONGO_URL} ...`);
    try {
      const open = await waitPort({
        host: host,
        port: port,
        interval,
        timeout
      });
      if (open) {
        logger(`...${host}:${port} is reachable`);

        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            logger(
              `connecting mongo client on ${host}:${port} using ${username}:${password}...`
            );
            const client = await mongodb.MongoClient.connect(
              `mongodb://${host}:${port}`,
              {
                auth: {
                  user: username,
                  password: password
                },
                reconnectTries: -1,
                reconnectInterval: interval
              }
            );
            logger(`...connected to ${host}:${port}`);

            const db = client.db(dbName);
            logger(`connected to database ${dbName}`);
            const collection = await db.collection(collectionName);
            logger(`got collection ${collectionName}`);
            global.mongoClient = client;
            global.mongoDb = db;
            global.addressrCollection = collection;
            return { client, db, collection };
          } catch (err) {
            error(
              `An error occured while trying to connect the mongo client on ${host}:${port}`,
              err
            );
            await new Promise(resolve => {
              setTimeout(() => resolve(), interval);
            });
            logger('retrying...');
          }
        }
      }
    } catch (err) {
      error(
        `An error occured while waiting to reach mongo on ${host}:${port}`,
        err
      );
      await new Promise(resolve => {
        setTimeout(() => resolve(), interval);
      });
      logger('retrying...');
    }
  }
}
