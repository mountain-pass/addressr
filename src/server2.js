import debug from 'debug'
import { esConnect } from '../client/elasticsearch'
import { printVersion } from '../service/printVersion'
import { startRest2Server } from './waycharterServer'

const logger = debug('api')

startRest2Server().then(() => {
  logger('connecting es client')
  const p1 = esConnect().then(esClient => {
    global.esClient = esClient
    logger('es client connected')
  })
  p1.then(() => {
    console.log('=======================')
    console.log('Addressr - API Server 2')
    console.log('=======================')

    printVersion()
  })
})
