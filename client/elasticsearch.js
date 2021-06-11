const waitPort = require('wait-port')
const elasticsearch = require('@elastic/elasticsearch')
import debug from 'debug'
const logger = debug('api')
const error = debug('error')

const ES_INDEX_NAME = process.env.ES_INDEX_NAME || 'addressr'
export const ELASTIC_PORT = Number.parseInt(process.env.ELASTIC_PORT || '9200')
const ELASTIC_HOST = process.env.ELASTIC_HOST || '127.0.0.1'
const ELASTIC_USERNAME = process.env.ELASTIC_USERNAME || ''
const ELASTIC_PASSWORD = process.env.ELASTIC_PASSWORD || ''
const ELASTIC_PROTOCOL = process.env.ELASTIC_PROTOCOL || 'http'

export async function dropIndex (esClient) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  let exists = await esClient.indices.exists({ index: ES_INDEX_NAME })
  if (exists.body) {
    const deleteIndexResult = await esClient.indices.delete({
      index: ES_INDEX_NAME
    })
    logger({ deleteIndexResult })
  }
  logger('checking if index exists')
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  exists = await esClient.indices.exists({ index: ES_INDEX_NAME })
  logger('index exists:', exists)
}

export async function initIndex (esClient, clear, synonyms) {
  if (clear) {
    await dropIndex(esClient)
  }
  logger('checking if index exists')
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const exists = await esClient.indices.exists({ index: ES_INDEX_NAME })
  logger('index exists:', exists.body)
  const indexBody = {
    settings: {
      index: {
        analysis: {
          filter: {
            my_synonym_filter: {
              type: 'synonym',
              lenient: true,
              synonyms
            },
            comma_stripper: {
              type: 'pattern_replace',
              pattern: ',',
              replacement: ''
            }
          },
          analyzer: {
            // default: {
            //   tokenizer: 'my_tokenizer',
            //   filter: ['lowercase', 'asciifolding', 'synonym'],
            // },
            my_analyzer: {
              tokenizer: 'whitecomma',
              filter: [
                'uppercase',
                'asciifolding',
                'my_synonym_filter',
                'comma_stripper',
                'trim'
              ]
            }
          },
          tokenizer: {
            whitecomma: {
              type: 'pattern',
              pattern: '[\\W,]+',
              lowercase: false
            }
          }
        }
      }
    },
    aliases: {},
    mappings: {
      properties: {
        structured: {
          type: 'object',
          enabled: false
        },
        sla: {
          type: 'text',
          analyzer: 'my_analyzer',
          fielddata: true
        },
        ssla: {
          type: 'text',
          analyzer: 'my_analyzer'
        },
        confidence: { type: 'integer' }
      }
    }
  }

  if (!exists.body) {
    logger(`creating index: ${ES_INDEX_NAME}`)
    const indexCreateResult = await esClient.indices.create({
      index: ES_INDEX_NAME,
      body: indexBody
    })
    logger({ indexCreateResult })
  } else {
    // update the index
    const indexCloseResult = await esClient.indices.close({
      index: ES_INDEX_NAME
    })
    logger({ indexCloseResult })
    const indexPutSettingsResult = await esClient.indices.putSettings({
      index: ES_INDEX_NAME,
      body: indexBody
    })
    logger({ indexPutSettingsResult })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const indexOpenResult = await esClient.indices.open({
      index: ES_INDEX_NAME
    })
    logger({ indexOpenResult })
  }
  const indexGetResult = await esClient.indices.get({
    index: ES_INDEX_NAME,
    includeDefaults: true
  })
  logger({ indexGetResult })
}

export async function esConnect (
  esport = ELASTIC_PORT,
  eshost = ELASTIC_HOST,
  interval = 1000,
  timeout = 0
) {
  // we keep trying to connect, no matter what
  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log(`trying to reach elastic search on ${eshost}:${esport}...`)
    try {
      const open = await waitPort({
        host: eshost,
        port: esport,
        interval,
        timeout
      })
      if (open) {
        logger(`...${eshost}:${esport} is reachable`)

        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const esClientOptions = {
              node: `${ELASTIC_PROTOCOL}://${ELASTIC_USERNAME}:${ELASTIC_PASSWORD}@${eshost}:${esport}`
              // ...(ELASTIC_USERNAME &&
              //   ELASTIC_PASSWORD && {
              //     cloud: {
              //       username: ELASTIC_USERNAME,
              //       password: ELASTIC_PASSWORD
              //     }
              //   })

              // host: [
              //   {
              //     host: eshost,
              //     ...(ELASTIC_USERNAME &&
              //       ELASTIC_PASSWORD && {
              //         auth: `${ELASTIC_USERNAME}:${ELASTIC_PASSWORD}`,
              //       }),
              //     protocol: ELASTIC_PROTOCOL,
              //     port: esport,
              //   },
              // ],
              // log: 'info',
            }
            const esClient = new elasticsearch.Client(esClientOptions)
            logger(`connecting elastic search client on ${eshost}:${esport}...`)
            await esClient.ping()
            logger(`...connected to ${eshost}:${esport}`)
            global.esClient = esClient
            return esClient
          } catch (error_) {
            error(
              `An error occurred while trying to connect the elastic search client on ${eshost}:${esport}`,
              error_
            )
            await new Promise(resolve => {
              setTimeout(() => resolve(), interval)
            })
            logger('retrying...')
          }
        }
      }
    } catch (error_) {
      error(
        `An error occured while waiting to reach elastic search on ${eshost}:${esport}`,
        error_
      )
      await new Promise(resolve => {
        setTimeout(() => resolve(), interval)
      })
      logger('retrying...')
    }
  }
}
