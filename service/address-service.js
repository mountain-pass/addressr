/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-non-literal-regexp */
/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-non-literal-fs-filename */
import debug from 'debug'
import directoryExists from 'directory-exists'
import fs from 'fs'
import got from 'got'
import LinkHeader from 'http-link-header'
import Papa from 'papaparse'
import path from 'path'
import stream from 'stream'
import unzip from 'unzip-stream'
import { initIndex, dropIndex as dropESIndex } from '../client/elasticsearch'
import download from '../utils/stream-down'
import { setLinkOptions } from './setLinkOptions'
import Keyv from 'keyv'
import { KeyvFile } from 'keyv-file'
import crypto from 'crypto'
import glob from 'glob-promise'

const fsp = fs.promises

var logger = debug('api')
var error = debug('error')

const cache = new Keyv({
  store: new KeyvFile({ filename: 'target/keyv-file.msgpack' })
})

const PAGE_SIZE = process.env.PAGE_SIZE || 8

function getCoveredStates() {
  const covered = process.env.COVERED_STATES || ''
  if (covered == '') {
    return []
  } else {
    return covered.split(',')
  }
}

const COVERED_STATES = getCoveredStates()

const ONE_DAY_S = 60 /*sec*/ * 60 /*min*/ * 24 /*hours*/

const ONE_DAY_MS = 1000 * ONE_DAY_S
const THIRTY_DAYS_MS = ONE_DAY_MS * 30

const ES_INDEX_NAME = process.env.ES_INDEX_NAME || 'addressr'

export async function dropIndex() {
  await dropESIndex(global.esClient)
}

export async function clearAddresses() {
  await initIndex(global.esClient, true)
}

export async function setAddresses(addr) {
  await clearAddresses()

  const indexingBody = []
  addr.forEach(row => {
    indexingBody.push({
      index: {
        _index: ES_INDEX_NAME,
        _id: row.links.self.href
      }
    })
    const { sla, ssla, ...structurted } = row
    indexingBody.push({
      sla,
      ssla,
      structurted,
      confidence: structurted.structurted.confidence
    })
  })

  if (indexingBody.length > 0) {
    await sendIndexRequest(indexingBody)
  }
  //  addresses = addr;
  // empty index
  // then index the provided addresses

  //logger(await searchForAddress('657 The Entrance Road')); //'2/25 TOTTERDE'; // 'UNT 2, BELCONNEN';);
}

// need to try proxying this to modify the headers if we want to use got's cache implementation

// SEE https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc
const GNAF_PACKAGE_URL =
  process.env.GNAF_PACKAGE_URL ||
  'https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc'

async function fetchPackageData() {
  const packageUrl = GNAF_PACKAGE_URL
  // See if we have the value in cache
  const cachedResponse = await cache.get(packageUrl)
  logger('cached gnaf package data', cachedResponse)
  let age = 0
  if (cachedResponse !== undefined) {
    cachedResponse.headers['x-cache'] = 'HIT'
    const created = new Date(cachedResponse.headers.date)
    logger('created', created)
    age = Date.now() - created
    if (age <= ONE_DAY_MS) {
      return cachedResponse
    }
  }
  // cached value was older than one day, so go fetch
  try {
    const response = await got.get(packageUrl)
    logger('response.isFromCache', response.fromCache)
    logger('fresh gnaf package data', {
      body: response.body,
      headers: response.headers
    })
    await cache.set(packageUrl, {
      body: response.body,
      headers: response.headers
    })
    response.headers['x-cache'] = 'MISS'
    return response
  } catch (error_) {
    // we were unable to fetch. if we have cached value that isn't stale, return in
    if (cachedResponse !== undefined) {
      if (age < THIRTY_DAYS_MS) {
        cachedResponse.headers['warning'] = '110	custom/1.0 "Response is Stale"'
        return cachedResponse
      }
    }
    // otherwise, throw the original network error
    throw error_
  }
}

const GNAF_DIR = process.env.GNAF_DIR || `target/gnaf`

export async function fetchGnafFile() {
  const response = await fetchPackageData()
  const pack = JSON.parse(response.body)
  // id as of 16/07 for zip is 4b084096-65e4-4c8e-abbe-5e54ff85f42f
  const dataResource = pack.result.resources.find(
    r => r.state === 'active' && r.mimetype === 'application/zip'
  )

  // id as of 16/07/2019 for zip is 4b084096-65e4-4c8e-abbe-5e54ff85f42f
  logger('dataResource', JSON.stringify(dataResource, undefined, 2))
  logger('url', dataResource.url)
  logger('headers', JSON.stringify(response.headers, undefined, 2))
  const basename = path.basename(dataResource.url)
  logger('basename', basename)
  const complete_path = GNAF_DIR
  const incomplete_path = `${complete_path}/incomplete`
  await new Promise((resolve, reject) => {
    fs.mkdir(incomplete_path, { recursive: true }, error_ => {
      if (error_) reject(error_)
      else resolve()
    })
  })
  const destination = `${complete_path}/${basename}`
  await new Promise((resolve, reject) => {
    fs.mkdir(incomplete_path, { recursive: true }, error_ => {
      if (error_) reject(error_)
      else resolve()
    })
  })
  // see if the file exists already
  try {
    await new Promise((resolve, reject) => {
      fs.access(destination, fs.constants.R_OK, error_ => {
        if (error_) reject(error_)
        else resolve()
      })
    })
    // it does exist, so don't bother trying to download it again
    return destination
  } catch {
    // file doesn't exist, so we need to download it.
    logger('Starting G-NAF download')
    try {
      await download(
        dataResource.url,
        `${incomplete_path}/${basename}`,
        dataResource.size
      )
      await fsp.rename(`${incomplete_path}/${basename}`, destination)
      logger('Finished downloading G-NAF', destination)
      return destination
    } catch (error_) {
      error('Error downloading G-NAF', error_)
      throw error_
    }
  }
}

export async function unzipFile(file) {
  const extname = path.extname(file)
  const basenameWithoutExtention = path.basename(file, extname)
  const incomplete_path = `${GNAF_DIR}/incomplete/${basenameWithoutExtention}`
  const complete_path = `${GNAF_DIR}/${basenameWithoutExtention}`

  const exists = await directoryExists(complete_path)
  if (exists) {
    logger('directory exits. Skipping extract', complete_path)
    // already extracted. Move along.
    return complete_path
  } else {
    await new Promise((resolve, reject) => {
      fs.mkdir(incomplete_path, { recursive: true }, error_ => {
        if (error_) reject(error_)
        else resolve()
      })
    })
    const readStream = fs.createReadStream(file)
    logger('before pipe')
    let prom = new Promise((resolve, reject) => {
      readStream
        .pipe(unzip.Parse())
        .pipe(
          stream.Transform({
            objectMode: true,
            transform: function (entry, encoding, callback) {
              const entryPath = `${incomplete_path}/${entry.path}`
              if (entry.isDirectory) {
                fs.mkdir(entryPath, { recursive: true }, error_ => {
                  if (error_) {
                    entry.autodrain()
                    callback(error_)
                  } else {
                    entry.autodrain()
                    callback()
                  }
                })
              } else {
                const dirname = path.dirname(entryPath)
                fs.mkdir(dirname, { recursive: true }, error_ => {
                  if (error_) {
                    entry.autodrain()
                    callback(error_)
                  } else {
                    fs.stat(entryPath, (error_, stats) => {
                      if (error_ && error_.code !== 'ENOENT') {
                        logger('error statting file', error_)
                        entry.autodrain()
                        callback(error_)
                        return
                      }
                      if (stats != undefined && stats.size === entry.size) {
                        // no need to extract again. Skip
                        logger('skipping extract for', entryPath)
                        entry.autodrain()
                        callback()
                      } else {
                        // size is different, so extract the file
                        logger('extracting', entryPath)
                        entry
                          .pipe(fs.createWriteStream(entryPath))
                          .on('finish', () => {
                            logger('finished extracting', entryPath)
                            callback()
                          })
                          .on('error', error => {
                            logger('error unzipping entry', error)
                            callback(error)
                          })
                      }
                    })
                  }
                })
              }
            }
          })
        )
        .on('finish', () => {
          logger('finish')
          resolve()
        })
        .on('error', error_ => {
          logger('error unzipping data file', error_)
          reject(error_)
        })
    })
    await prom

    return await new Promise((resolve, reject) => {
      fs.rename(incomplete_path, complete_path, error_ => {
        if (error_) reject(error_)
        else resolve(complete_path)
      })
    })
  }
}

// function cleanProperty(p, v) {
//   v !== '' && {
//     [p]: v,
//   };
// }

function levelTypeCodeToName(code, context, address) {
  const found = context['Authority_Code_LEVEL_TYPE_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Level Type Code: '${code}'`)
  error({ address })
  return
}

function flatTypeCodeToName(code, context, address) {
  const found = context['Authority_Code_FLAT_TYPE_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Flat Type Code: '${code}'`)
  error({ address })
  return
}

function streetTypeCodeToName(code, context) {
  const found = context['Authority_Code_STREET_TYPE_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Street Type Code: '${code}'`)
  return
}

function streetClassCodeToName(code, context) {
  const found = context['Authority_Code_STREET_CLASS_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Street Class Code: '${code}'`)
  return
}

function localityClassCodeToName(code, context) {
  const found = context['Authority_Code_LOCALITY_CLASS_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Locality Class Code: '${code}'`)
  return
}

function streetSuffixCodeToName(code, context) {
  const found = context['Authority_Code_STREET_SUFFIX_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Street Suffix Code: '${code}'`)
  return
}

function geocodeReliabilityCodeToName(code, context) {
  const found = context['Authority_Code_GEOCODE_RELIABILITY_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Geocode Reliability Code: '${code}'`)
  return
}

function geocodeTypeCodeToName(code, context) {
  const found = context['Authority_Code_GEOCODE_TYPE_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(`Unknown Geocode Type Code: '${code}'`)
  return
}

function levelGeocodedCodeToName(code, context) {
  const found = context['Authority_Code_GEOCODED_LEVEL_TYPE_AUT_psv'].find(
    entry => entry.CODE === code
  )
  if (found) {
    return found.NAME
  }
  error(
    `Unknown Geocoded Level Type Code: '${code}' in:\n${JSON.stringify(
      context['Authority_Code_GEOCODED_LEVEL_TYPE_AUT_psv'],
      undefined,
      2
    )}`
  )
  return
}

function mapLocality(l, context) {
  return {
    ...(l.LOCALITY_NAME !== '' && {
      name: l.LOCALITY_NAME
    }),
    ...(l.LOCALITY_CLASS_CODE !== '' && {
      class: {
        code: l.LOCALITY_CLASS_CODE,
        name: localityClassCodeToName(l.LOCALITY_CLASS_CODE, context)
      }
    })
  }
}

function mapStreetLocality(l, context) {
  return {
    ...(l.STREET_NAME !== '' && {
      name: l.STREET_NAME
    }),
    ...(l.STREET_TYPE_CODE !== '' && {
      type: {
        code: l.STREET_TYPE_CODE,
        name: streetTypeCodeToName(l.STREET_TYPE_CODE, context)
      }
    }),
    ...(l.STREET_CLASS_CODE !== '' && {
      class: {
        code: l.STREET_CLASS_CODE,
        name: streetClassCodeToName(l.STREET_CLASS_CODE, context)
      }
    }),
    ...(l.STREET_SUFFIX_CODE !== '' && {
      suffix: {
        code: l.STREET_SUFFIX_CODE,
        name: streetSuffixCodeToName(l.STREET_SUFFIX_CODE, context)
      }
    })
  }
}

function mapGeo(geoSite, context, geoDefault) {
  let foundDefault = false
  if (geoSite && geoDefault) {
    geoSite.forEach(geo => {
      if (
        geo.GEOCODE_TYPE_CODE === geoDefault[0].GEOCODE_TYPE_CODE &&
        geo.LATITUDE === geoDefault[0].LATITUDE &&
        geo.LONGITUDE === geoDefault[0].LONGITUDE
      ) {
        foundDefault = true
        geo.default = true
      } else {
        geo.default = false
      }
    })
  }
  const sites = geoSite
    ? geoSite.map(geo => {
      if (geo.BOUNDARY_EXTENT !== '') {
        console.log('be', geo)
        throw new Error('encounterd geo.BOUNDARY_EXTENT')
      }
      if (geo.PLANIMETRIC_ACCURACY !== '') {
        console.log('pa', geo)
        throw new Error('encounterd geo.PLANIMETRIC_ACCURACY')
      }
      if (geo.ELEVATION !== '') {
        console.log('e', geo)
        throw new Error('encounterd geo.ELEVATION')
      }
      if (geo.GEOCODE_SITE_NAME !== '') {
        console.log('gsn', geo)
        throw new Error('encounterd geo.GEOCODE_SITE_NAME')
      }
      return {
        default: geo.default || false,
        ...(geo.GEOCODE_TYPE_CODE !== '' && {
          type: {
            code: geo.GEOCODE_TYPE_CODE,
            name: geocodeTypeCodeToName(geo.GEOCODE_TYPE_CODE, context)
          }
        }),
        ...(geo.RELIABILITY_CODE !== '' && {
          reliability: {
            code: geo.RELIABILITY_CODE,
            name: geocodeReliabilityCodeToName(geo.RELIABILITY_CODE, context)
          }
        }),
        ...(geo.LATITUDE !== '' && {
          latitude: Number.parseFloat(geo.LATITUDE)
        }),
        ...(geo.LONGITUDE !== '' && {
          longitude: Number.parseFloat(geo.LONGITUDE)
        }),
        ...(geo.GEOCODE_SITE_DESCRIPTION !== '' && {
          description: geo.GEOCODE_SITE_DESCRIPTION
        })
      }
    })
    : []
  const def =
    geoDefault && !foundDefault
      ? geoDefault.map(geo => {
        return {
          default: true,
          ...(geo.GEOCODE_TYPE_CODE !== '' && {
            type: {
              code: geo.GEOCODE_TYPE_CODE,
              name: geocodeTypeCodeToName(geo.GEOCODE_TYPE_CODE, context)
            }
          }),
          ...(geo.LATITUDE !== '' && {
            latitude: Number.parseFloat(geo.LATITUDE)
          }),
          ...(geo.LONGITUDE !== '' && {
            longitude: Number.parseFloat(geo.LONGITUDE)
          })
        }
      })
      : []
  return sites.concat(def)
}

function mapToSla(fla) {
  return fla.join(', ')
}

// eslint-disable-next-line complexity
function mapToMla(s) {
  const fla = []
  if (s.level) {
    fla.push(
      `${s.level.type.name || ''} ${s.level.prefix || ''}${s.level.number ||
      ''}${s.level.suffix || ''}`
    )
  }

  if (s.flat) {
    fla.push(
      `${s.flat.type.name || ''} ${s.flat.prefix || ''}${s.flat.number || ''}${s
        .flat.suffix || ''}`
    )
  }

  if (s.buildingName) {
    fla.push(s.buildingName)
  }

  if (fla.length === 3) {
    fla[1] = `${fla[0]}, ${fla[1]}`
    fla.shift()
  }

  let number = ''
  if (s.lotNumber && s.number === undefined) {
    number = `LOT ${s.lotNumber.prefix || ''}${s.lotNumber.number || ''}${s
      .lotNumber.suffix || ''}`
  } else if (s.number) {
    number = `${s.number.prefix || ''}${s.number.number || ''}${s.number
      .suffix || ''}`
    if (s.number.last) {
      number = `${number}-${s.number.last.prefix || ''}${s.number.last.number ||
        ''}${s.number.last.suffix || ''}`
    }
  }

  const streetType = s.street.type ? ` ${s.street.type.name}` : ''
  const streetSuffix = s.street.suffix ? ` ${s.street.suffix.name}` : ''
  const street = `${s.street.name}${streetType}${streetSuffix}`

  fla.push(`${number} ${street}`)

  fla.push(`${s.locality.name} ${s.state.abbreviation} ${s.postcode}`)

  if (fla.length > 4) {
    logger('FLA TOO LONG', fla, s)
    throw new Error('FLA TOO LONG')
  }
  return fla
}

// eslint-disable-next-line complexity
function mapToShortMla(s) {
  const fla = []
  if (s.level) {
    fla.push(
      `${s.level.type.code || ''}${s.level.prefix || ''}${s.level.number ||
      ''}${s.level.suffix || ''}`
    )
  }

  let number = ''
  if (s.flat) {
    number = `${s.flat.prefix || ''}${s.flat.number || ''}${s.flat.suffix ||
      ''}/`
  }
  if (s.lotNumber && s.number === undefined) {
    number = `${number}${s.lotNumber.prefix || ''}${s.lotNumber.number || ''}${s
      .lotNumber.suffix || ''}`
  } else {
    number = `${number}${s.number.prefix || ''}${s.number.number || ''}${s
      .number.suffix || ''}`
    if (s.number.last) {
      number = `${number}-${s.number.last.prefix || ''}${s.number.last.number ||
        ''}${s.number.last.suffix || ''}`
    }
  }

  const streetType = s.street.type ? ` ${s.street.type.name}` : ''
  const streetSuffix = s.street.suffix ? ` ${s.street.suffix.code}` : ''
  const street = `${s.street.name}${streetType}${streetSuffix}`

  fla.push(`${number} ${street}`)

  fla.push(`${s.locality.name} ${s.state.abbreviation} ${s.postcode}`)

  if (fla.length > 4) {
    logger('FLA TOO LONG', fla, s)
    throw new Error('FLA TOO LONG')
  }
  return fla
}

// eslint-disable-next-line complexity
export function mapAddressDetails(d, context, i, count) {
  const streetLocality = context.streetLocalityIndexed[d.STREET_LOCALITY_PID]
  const locality = context.localityIndexed[d.LOCALITY_PID]

  const geoSite = context.geoIndexed
    ? context.geoIndexed[d.ADDRESS_SITE_PID]
    : undefined
  const geoDefault = context.geoDefaultIndexed
    ? context.geoDefaultIndexed[d.ADDRESS_DETAIL_PID]
    : undefined
  const hasGeo =
    d.LEVEL_GEOCODED_CODE != '' &&
    ((geoSite !== undefined && geoSite.length > 0) ||
      (geoDefault !== undefined && geoDefault.length > 0))
  const rval = {
    ...(d.LEVEL_GEOCODED_CODE != '' &&
      hasGeo && {
      geocoding: {
        ...(d.LEVEL_GEOCODED_CODE !== '' && {
          level: {
            code: d.LEVEL_GEOCODED_CODE,
            name: levelGeocodedCodeToName(d.LEVEL_GEOCODED_CODE, context)
          }
        }),
        ...(hasGeo && {
          geocodes: mapGeo(geoSite, context, geoDefault)
        })
      }
    }),
    structured: {
      ...(d.BUILDING_NAME !== '' && {
        buildingName: d.BUILDING_NAME
      }),
      ...((d.NUMBER_FIRST_PREFIX !== '' ||
        d.NUMBER_FIRST !== '' ||
        d.NUMBER_FIRST_SUFFIX !== '') && {
        number: {
          ...(d.NUMBER_FIRST_PREFIX !== '' && {
            prefix: d.NUMBER_FIRST_PREFIX
          }),
          ...(d.NUMBER_FIRST !== '' && {
            number: Number.parseInt(d.NUMBER_FIRST)
          }),
          ...(d.NUMBER_FIRST_SUFFIX !== '' && {
            suffix: d.NUMBER_FIRST_SUFFIX
          }),
          ...((d.NUMBER_LAST_PREFIX !== '' ||
            d.NUMBER_LAST !== '' ||
            d.NUMBER_LAST_SUFFIX !== '') && {
            last: {
              ...(d.NUMBER_LAST_PREFIX !== '' && {
                prefix: d.NUMBER_LAST_PREFIX
              }),
              ...(d.NUMBER_LAST !== '' && {
                number: Number.parseInt(d.NUMBER_LAST)
              }),
              ...(d.NUMBER_LAST_SUFFIX !== '' && {
                suffix: d.NUMBER_LAST_SUFFIX
              })
            }
          })
        }
      }),
      ...((d.LEVEL_TYPE_CODE !== '' ||
        d.LEVEL_NUMBER_PREFIX !== '' ||
        d.LEVEL_NUMBER !== '' ||
        d.LEVEL_NUMBER_SUFFIX !== '') && {
        level: {
          ...(d.LEVEL_TYPE_CODE !== '' && {
            type: {
              code: d.LEVEL_TYPE_CODE,
              name: levelTypeCodeToName(d.LEVEL_TYPE_CODE, context, d)
            }
          }),
          ...(d.LEVEL_NUMBER_PREFIX !== '' && {
            prefix: d.LEVEL_NUMBER_PREFIX
          }),
          ...(d.LEVEL_NUMBER !== '' && {
            number: Number.parseInt(d.LEVEL_NUMBER)
          }),
          ...(d.LEVEL_NUMBER_SUFFIX !== '' && {
            suffix: d.LEVEL_NUMBER_SUFFIX
          })
        }
      }),
      ...((d.FLAT_TYPE_CODE !== '' ||
        d.FLAT_NUMBER_PREFIX !== '' ||
        d.FLAT_NUMBER !== '' ||
        d.FLAT_NUMBER_SUFFIX !== '') && {
        flat: {
          ...(d.FLAT_TYPE_CODE !== '' && {
            type: {
              code: d.FLAT_TYPE_CODE,
              name: flatTypeCodeToName(d.FLAT_TYPE_CODE, context, d)
            }
          }),
          ...(d.FLAT_NUMBER_PREFIX !== '' && {
            prefix: d.FLAT_NUMBER_PREFIX
          }),
          ...(d.FLAT_NUMBER !== '' && {
            number: Number.parseInt(d.FLAT_NUMBER)
          }),
          ...(d.FLAT_NUMBER_SUFFIX !== '' && {
            suffix: d.FLAT_NUMBER_SUFFIX
          })
        }
      }),
      // May need to include street locality aliases here
      street: mapStreetLocality(streetLocality, context),
      ...(d.CONFIDENCE !== '' && {
        confidence: Number.parseInt(d.CONFIDENCE)
      }),
      locality: mapLocality(locality, context),
      ...(d.POSTCODE !== '' && {
        postcode: d.POSTCODE
      }),
      ...((d.LOT_NUMBER_PREFIX !== '' ||
        d.LOT_NUMBER !== '' ||
        d.LOT_NUMBER_SUFFIX !== '') && {
        lotNumber: {
          ...(d.LOT_NUMBER_PREFIX !== '' && {
            prefix: d.LOT_NUMBER_PREFIX
          }),
          ...(d.LOT_NUMBER !== '' && {
            number: d.LOT_NUMBER
          }),
          ...(d.LOT_NUMBER_SUFFIX !== '' && {
            suffix: d.LOT_NUMBER_SUFFIX
          })
        }
      }),
      state: {
        name: context.stateName,
        abbreviation: context.state
      }
    },
    ...(d.PRIMARY_SECONDARY !== '' && {
      precedence: d.PRIMARY_SECONDARY === 'P' ? 'primary' : 'secondary'
    }),
    pid: d.ADDRESS_DETAIL_PID
  }
  rval.mla = mapToMla(rval.structured)
  rval.sla = mapToSla(rval.mla)
  if (rval.structured.flat != undefined) {
    rval.smla = mapToShortMla(rval.structured)
    rval.ssla = mapToSla(rval.smla)
  }

  if (count) {
    if (i % Math.ceil(count / 100) === 0) {
      logger('addr', JSON.stringify(rval, undefined, 2))
      logger(`${(i / count) * 100}%`)
    }
  } else {
    if (i % 10000 === 0) {
      logger('addr', JSON.stringify(rval, undefined, 2))
      logger(`${i} rows`)
    }
  }
  return rval
}

async function loadAddressDetails(
  file,
  expectedCount,
  context,
  { refresh = false } = {}
) {
  let actualCount = 0

  await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(file), {
      header: true,
      skipEmptyLines: true,
      chunkSize:
        Number.parseInt(process.env.ADDRESSR_LOADING_CHUNK_SIZE || '10') *
        1024 *
        1024,
      chunk: function (chunk, parser) {
        parser.pause()
        const items = []
        if (chunk.errors.length > 0) {
          error(`Errors reading '${file}': ${chunk.errors}`)
          error({ errors: chunk.errors })
        }
        const indexingBody = []
        chunk.data.forEach(row => {
          const item = mapAddressDetails(
            row,
            context,
            actualCount,
            expectedCount
          )
          items.push(item)
          actualCount += 1
          indexingBody.push({
            index: {
              _index: ES_INDEX_NAME,
              _id: `/addresses/${item.pid}`
            }
          })
          const { sla, ssla, ...structured } = item
          indexingBody.push({
            sla,
            ssla,
            structured,
            confidence: structured.structured.confidence
          })
        })

        if (indexingBody.length > 0) {
          sendIndexRequest(indexingBody, undefined, { refresh })
            .then(() => {
              parser.resume()
              return
            })
            .catch(error_ => {
              error('error sending index request', error_)
              throw error_
            })
        } else {
          // nothing to process. Have reached end of file.
          parser.resume()
        }

      },
      // step: function(row) {
      //   if (row.errors.length > 0) {
      //     error(`Errors reading '${file}': ${row.errors}`);
      //   } else {
      //     details.push(mapAddressDetails(row.data, context, i, count));
      //     i += 1;
      //   }
      // },
      complete: function () {
        logger('Address details loaded', context.state, expectedCount || '')
        resolve()
        // global.esClient.indices
        //   .refresh({
        //     index: ['addressr'],
        //   })
        //   .then(resp => {
        //     logger('resp', resp);
        //     if (resp.errors) {
        //       error(resp);
        //       error(resp.items[0].index);
        //       reject();
        //     }
        //     resolve();
        //   })
        //   .catch(err => {
        //     error('refresh error', err);
        //   });
      },
      error: (_error, file) => {
        error(_error, file)
        reject()
      }
    })
  })
  if (expectedCount !== undefined && actualCount != expectedCount) {
    error(
      `Error loading '${file}'. Expected '${expectedCount}' rows, got '${actualCount}'`
    )
  } else {
    logger(`loaded '${actualCount}' rows from '${file}'`)
  }

  // const BATCH_SIZE = 4096;
  // const batches = Math.ceil(details.length / BATCH_SIZE);
  // for (let j = 0; j < batches; j++) {
  //   logger(`INDEXING... batch ${j} of ${batches}`);
  //   const offset = j * BATCH_SIZE;
  //   const indexingBody = [];
  //   const sizeOfBatch = Math.min(BATCH_SIZE, details.length - offset);
  //   for (let i = 0; i < sizeOfBatch; i++) {
  //     const item = details[offset + i];
  //     indexingBody.push({
  //       index: {
  //         _index: 'addressr',
  //         _id: item.pid,
  //       },
  //     });
  //     indexingBody.push({
  //       sla: item.sla,
  //       ...(item.ssla != undefined && { ssla: item.ssla }),
  //     });
  //   }
  //   const resp = await global.esClient.bulk({
  //     // here we are forcing an index refresh,
  //     // otherwise we will not get any result
  //     // in the consequent search
  //     refresh: true,
  //     body: indexingBody,
  //   });
  //   logger('resp', resp);
  //   if (resp.errors) {
  //     error(resp);
  //     error(resp.items[0].index);
  //   }
  // }
  //await searchForAddress('657 The Entrance Road'); //'2/25 TOTTERDE'; // 'UNT 2, BELCONNEN';);
}

export async function searchForAddress(searchString, p, pageSize = PAGE_SIZE) {
  //  const searchString = '657 The Entrance Road'; //'2/25 TOTTERDE'; // 'UNT 2, BELCONNEN';
  const searchResp = await global.esClient.search({
    index: ES_INDEX_NAME,
    body: {
      from: (p - 1 || 0) * pageSize,
      size: pageSize,
      query: {
        bool: {
          ...(searchString && {
            should: [
              {
                multi_match: {
                  fields: ['sla', 'ssla'],
                  query: searchString,
                  fuzziness: 'AUTO',
                  type: 'bool_prefix',
                  lenient: true,
                  auto_generate_synonyms_phrase_query: false,
                  operator: 'AND'
                }
              },
              {
                multi_match: {
                  fields: ['sla', 'ssla'],
                  query: searchString,
                  // fuzziness: 'AUTO',
                  type: 'phrase_prefix',
                  lenient: true,
                  auto_generate_synonyms_phrase_query: false,
                  operator: 'AND'
                }
              }
            ]
          })
        }
      },
      sort: [
        '_score',
        { confidence: { order: 'desc' } },
        { 'ssla.raw': { order: 'asc' } },
        { 'sla.raw': { order: 'asc' } }
      ],
      highlight: {
        fields: {
          sla: {},
          ssla: {}
        }
      }
    }
  })
  logger('hits', JSON.stringify(searchResp.body.hits, undefined, 2))
  return searchResp
}

async function sendIndexRequest(
  indexingBody,
  initialBackoff = Number.parseInt(
    process.env.ADDRESSR_INDEX_BACKOFF || '30000'
  ),
  { refresh = false } = {}
) {
  let backoff = initialBackoff
  // eslint-disable-next-line no-constant-condition
  for (let count = 0; true; count++) {
    try {
      const resp = await global.esClient.bulk({
        refresh,
        body: indexingBody,
        timeout: process.env.ADDRESSR_INDEX_TIMEOUT || '300s'
      })

      if (resp.errors || (resp.body && resp.body.errors)) {
        throw resp
        // // error(resp);
        // // error(resp.items[0].index);
        // error(`backing off for ${backoff}ms`);
        // // parser.pause();
        // // paused = true;
        // await new Promise(resolve => {
        //   // eslint-disable-next-line no-undef
        //   setTimeout(() => {
        //     resolve();
        //   }, backoff);
        // });
        // backoff = Math.max(10000, backoff * 2);
        // continue;
      }
      // if (paused) {
      //   error(`resuming`);
      //   parser.resume();
      // }
      return
    } catch (error_) {
      error('Indexing error', JSON.stringify(error_, undefined, 2))
      error(`backing off for ${backoff}ms`)
      // parser.pause();
      // paused = true;
      await new Promise(resolve => {
        // eslint-disable-next-line no-undef
        setTimeout(() => {
          resolve()
        }, backoff)
      })
      backoff += Number.parseInt(
        process.env.ADDRESSR_INDEX_BACKOFF_INCREMENT || '30000'
      )
      backoff = Math.min(
        Number.parseInt(process.env.ADDRESSR_INDEX_BACKOFF_MAX || '600000'),
        backoff
      )
      error(`next backoff: ${backoff}ms`)
      error(`count: ${count}`)
    }
  }
}

async function getStateName(abbr, file) {
  return await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(file), {
      header: true,
      delimiter: '|',
      complete: results => {
        resolve(results.data[0].STATE_NAME)
      },
      error: (error, file) => {
        console.log(error, file)
        reject(error)
      }
    })
  })
}

function mapAuthCodeTableToSynonymList(table) {
  return table
    .filter(type => {
      return type.CODE !== type.NAME
    })
    .map(type => {
      return `${type.CODE} => ${type.NAME}`
    })
}

function buildSynonyms(context) {
  //example synonym format [
  //       'SUPER, super, superannuation',
  //       'SMSF, smsf, self-managed superannuation funds, self managed superannuation funds'
  //     ]
  const streetTypes = mapAuthCodeTableToSynonymList(
    context['Authority_Code_STREET_TYPE_AUT_psv']
  )
  const flatTypes = mapAuthCodeTableToSynonymList(
    context['Authority_Code_FLAT_TYPE_AUT_psv']
  )
  const levelTypes = mapAuthCodeTableToSynonymList(
    context['Authority_Code_LEVEL_TYPE_AUT_psv']
  )
  const streetSuffixTypes = mapAuthCodeTableToSynonymList(
    context['Authority_Code_STREET_SUFFIX_AUT_psv']
  )
  const synonyms = [
    ...streetTypes,
    ...flatTypes,
    ...levelTypes,
    ...streetSuffixTypes
  ]
  return synonyms
}

const { readdir } = require('fs').promises

async function getFiles(currentDir, baseDir) {
  const dir = path.resolve(baseDir, currentDir)
  logger(`reading ${dir} (${currentDir} in ${baseDir})`)
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    dirents.map(dirent => {
      const res = `${currentDir}/${dirent.name}`
      return dirent.isDirectory() ? getFiles(res, baseDir) : res
    })
  )
  return Array.prototype.concat(...files)
}

function countFileLines(filePath) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath, 'utf-8');
    let lines = 0;
    let last = undefined;
    readStream.on('data', function (chunk) {
      lines += chunk.split('\n').length - 1;
      last = chunk[chunk.length - 1];
    });

    readStream.on('end', function () {
      if (last !== '\n') {
        ++lines;
      }
      resolve(lines);
    });

    readStream.on('error', function (err) {
      reject(err);
    });
  });
}

async function loadGnafData(directory, { refresh = false } = {}) {
  const countsFile = `${directory}/Counts.csv`
  let countsFileExists = await fileExists(countsFile)

  let filesCounts = {},
    files = []
  // before may21 there was a counts file
  if (countsFileExists) {
    filesCounts = await loadFileCounts(countsFile)
    files = Object.keys(filesCounts)
    logger('files', files)
  } else {
    // may21 was missing the counts file
    files = await getFiles('.', directory)
    for (const file of files) {
      const lines = await countFileLines(`${directory}/${file}`)
      filesCounts[file] = lines - 1
    }
    // const contentsFile = `${directory}/Contents.txt`
    // const contentsFileExists = await fileExists(contentsFile)
    // if (contentsFileExists) {
    //   files = await loadFileContents(contentsFile)
    // } else {
    //   throw new Error(`Cannot file '${countsFile}' or '${contentsFile}'`)
    // }
  }

  const loadContext = {}
  await loadAuthFiles(files, directory, loadContext, filesCounts)
  // loadContext now contains all the auth files, so we can build the synonyms
  const synonyms = buildSynonyms(loadContext)
  await initIndex(
    global.esClient,
    process.env.ES_CLEAR_INDEX || false,
    synonyms
  )
  const addressDetailFiles = files.filter(
    f => f.match(/ADDRESS_DETAIL/) && f.match(/\/Standard\//)
  )
  logger('addressDetailFiles', addressDetailFiles)
  for (const detailFile of addressDetailFiles) {
    const state = path
      .basename(detailFile, path.extname(detailFile))
      .replace(/_.*/, '')
    if (COVERED_STATES.length === 0 || COVERED_STATES.includes(state)) {
      loadContext.state = state
      loadContext.stateName = await loadState(files, directory, state)

      logger('Loading streets', state)
      const streetLocality = await loadStreetLocality(files, directory, state)
      loadContext.streetLocalityIndexed = {}
      for (const sl of streetLocality) {
        loadContext.streetLocalityIndexed[sl.STREET_LOCALITY_PID] = sl
      }

      logger('Loading suburbs', state)
      const locality = await loadLocality(files, directory, state)
      loadContext.localityIndexed = {}
      for (const l of locality) {
        loadContext.localityIndexed[l.LOCALITY_PID] = l
      }

      if (process.env.ADDRESSR_ENABLE_GEO) {
        loadContext.geoIndexed = {}
        await loadSiteGeo(files, directory, state, loadContext, filesCounts)
        // logger('indexing site geos', state, geo.length);
        // for (let index = 0; index < geo.length; index++) {
        //   if (index % 10000 === 0) {
        //     logger(`${(index / geo.length) * 100.0}%`);
        //   }
        //   const g = geo[index];
        //   if (loadContext.geoIndexed[g.ADDRESS_SITE_PID] === undefined) {
        //     loadContext.geoIndexed[g.ADDRESS_SITE_PID] = [g];
        //   } else {
        //     loadContext.geoIndexed[g.ADDRESS_SITE_PID].push(g);
        //   }
        // }

        loadContext.geoDefaultIndexed = {}
        await loadDefaultGeo(files, directory, state, loadContext, filesCounts)
      } else {
        logger(`Skipping geos. set 'ADDRESSR_ENABLE_GEO' env var to enable`)
      }

      await loadAddressDetails(
        `${directory}/${detailFile}`,
        filesCounts[detailFile],
        loadContext,
        { refresh }
      )
    }
  }
}

async function fileExists(countsFile) {
  try {
    await fsp.access(countsFile, fs.constants.F_OK)
    return true
  } catch (err) {
    error(err)
    return false
  }
}

async function loadFileCounts(countsFile) {
  const filesCounts = {}
  await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(countsFile), {
      header: true,
      skipEmptyLines: true,
      step: function (row) {
        if (row.errors.length > 0) {
          error(`Errors reading '${countsFile}': ${row.errors}`)
          error({ errors: row.errors })
        }
        const psvFile = row.data.File.replace(/\\/g, '/').replace(
          /\.zip$/,
          '.psv'
        )
        filesCounts[psvFile] = row.data.Count

      },
      complete: function () {
        console.log('GNAF data loaded')
        resolve()
      },
      error: (error, file) => {
        console.log(error, file)
        reject(error)
      }
    })
  })
  logger('filesCounts', filesCounts)
  return filesCounts
}

async function loadFileContents(contentsFile) {
  const contents = await fsp.readFile(contentsFile)
  return contents
    .toString()
    .split('\n')
    .map(line => line.trim())
}

async function loadState(files, directory, state) {
  const stateFile = files.find(f => f.match(new RegExp(`${state}_STATE_psv`)))
  if (stateFile === undefined) {
    error(`Could not find state file '${state}_STATE_psv.psv'`)
    return
  } else {
    const name = await getStateName(state, `${directory}/${stateFile}`)
    return name
  }
}

async function loadStreetLocality(files, directory, state) {
  const localityFile = files.find(f =>
    f.match(new RegExp(`${state}_STREET_LOCALITY_psv`))
  )
  if (localityFile === undefined) {
    error(
      `Could not find street locality file '${state}_STREET_LOCALITY_psv.psv'`
    )
    return []
  } else {
    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${directory}/${localityFile}`), {
        header: true,
        delimiter: '|',
        complete: results => {
          resolve(results.data)
        },
        error: (error, file) => {
          console.log(error, file)
          reject(error)
        }
      })
    })
  }
}

async function loadLocality(files, directory, state) {
  const localityFile = files.find(f =>
    f.match(new RegExp(`${state}_LOCALITY_psv`))
  )
  if (localityFile === undefined) {
    error(`Could not find locality file '${state}_LOCALITY_psv.psv'`)
    return []
  } else {
    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${directory}/${localityFile}`), {
        header: true,
        delimiter: '|',
        complete: results => {
          resolve(results.data)
        },
        error: (error, file) => {
          console.log(error, file)
          reject(error)
        }
      })
    })
  }
}

async function loadSiteGeo(files, directory, state, loadContext, filesCounts) {
  logger('Loading site geos')

  const geoFile = files.find(f =>
    f.match(new RegExp(`${state}_ADDRESS_SITE_GEOCODE_psv`))
  )
  if (geoFile === undefined) {
    error(
      `Could not find address site geocode file '${state}_ADDRESS_SITE_GEOCODE_psv.psv'`
    )
    return []
  } else {
    const expectedCount = filesCounts[geoFile]
    let count = 0

    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${directory}/${geoFile}`), {
        header: true,
        delimiter: '|',
        chunk: function (chunk, parser) {
          parser.pause()
          if (chunk.errors.length > 0) {
            error(`Errors reading '${directory}/${geoFile}': ${chunk.errors}`)
            error({ errors: chunk.errors })
          } else {
            chunk.data.forEach(row => {
              if (expectedCount) {
                if (count % Math.ceil(expectedCount / 100) === 0) {
                  logger(
                    `${Math.floor(
                      (count / expectedCount) * 100
                    )}% (${count}/ ${expectedCount})`
                  )
                }
              }
              const g = row
              if (loadContext.geoIndexed[g.ADDRESS_SITE_PID] === undefined) {
                loadContext.geoIndexed[g.ADDRESS_SITE_PID] = [g]
              } else {
                loadContext.geoIndexed[g.ADDRESS_SITE_PID].push(g)
              }
              count += 1
            })
            parser.resume()
          }
        },
        complete: () => {
          resolve()
        },
        error: (error, file) => {
          console.log(error, file)
          reject(error)
        }
      })
    })
  }
}

async function loadDefaultGeo(
  files,
  directory,
  state,
  loadContext,
  filesCounts
) {
  logger('Loading default geos')
  const geoFile = files.find(f =>
    f.match(new RegExp(`${state}_ADDRESS_DEFAULT_GEOCODE_psv`))
  )
  if (geoFile === undefined) {
    error(
      `Could not find address site geocode file '${state}_ADDRESS_DEFAULT_GEOCODE_psv.psv'`
    )
    return []
  } else {
    const expectedCount = filesCounts[geoFile]
    let count = 0

    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${directory}/${geoFile}`), {
        header: true,
        delimiter: '|',
        chunk: function (chunk, parser) {
          parser.pause()
          if (chunk.errors.length > 0) {
            error(`Errors reading '${directory}/${geoFile}': ${chunk.errors}`)
            error({ errors: chunk.errors })
          } else {
            chunk.data.forEach(row => {
              if (expectedCount) {
                if (count % Math.ceil(expectedCount / 100) === 0) {
                  logger(
                    `${Math.floor(
                      (count / expectedCount) * 100
                    )}% (${count}/ ${expectedCount})`
                  )
                }
              }
              const g = row
              if (
                loadContext.geoDefaultIndexed[g.ADDRESS_DETAIL_PID] ===
                undefined
              ) {
                loadContext.geoDefaultIndexed[g.ADDRESS_DETAIL_PID] = [g]
              } else {
                loadContext.geoDefaultIndexed[g.ADDRESS_DETAIL_PID].push(g)
              }
              count += 1
            })
            parser.resume()
          }
        },
        complete: () => {
          resolve()
        },

        error: (error, file) => {
          console.log(error, file)
          reject(error)
        }
      })
    })
  }
}

async function loadAuthFiles(files, directory, loadContext, filesCounts) {
  const authCodeFiles = files.filter(f => f.match(/Authority Code/))
  logger('authCodeFiles', authCodeFiles)
  for (const authFile of authCodeFiles) {
    const contextKey = path.basename(authFile, path.extname(authFile))
    await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${directory}/${authFile}`), {
        delimiter: '|',
        header: true,
        complete: function (results) {
          loadContext[contextKey] = results.data
          if (filesCounts) {
            if (results.data.length != filesCounts[authFile]) {
              error(
                `Error loading '${directory}/${authFile}'. Expected '${filesCounts[authFile]}' rows, got '${results.data.length}'`
              )
              reject(
                `Error loading '${directory}/${authFile}'. Expected '${filesCounts[authFile]}' rows, got '${results.data.length}'`
              )
            } else {
              logger(
                `loaded '${results.data.length}' rows from '${directory}/${authFile}' into key '${contextKey}'`
              )
              resolve()
            }
          }
        },
        error: (error, file) => {
          error(`Error loading '${directory}/${authFile}`, error, file)
          reject([`Error loading '${directory}/${authFile}`, error, file])
        }
      })
    })
  }
  logger('AUTH', loadContext)
}

export async function loadGnaf({ refresh = false } = {}) {
  const file = await fetchGnafFile()
  const unzipped = await unzipFile(file)

  logger('Data dir', unzipped)
  const contents = await fsp.readdir(unzipped)
  logger('Data dir contents', contents)
  if (contents.length == 0) {
    throw new Error(`Data dir '${unzipped}' is empty`)
  }
  const gnafDir = await glob('**/G-NAF/', { cwd: unzipped })
  console.log(gnafDir)
  if (gnafDir.length === 0) {
    throw new Error(`Cannot find 'G-NAF' directory in Data dir '${unzipped}'`)
  }
  const mainDirectory = path.dirname(`${unzipped}/${gnafDir[0].slice(0, -1)}`)
  logger('Main Data dir', mainDirectory)
  await loadGnafData(mainDirectory, { refresh })
}

/**
 * Get Addresses
 * returns detailed information about a specific address
 *
 * addressId String ID of the address.
 * returns Address
 **/
export async function getAddress(addressId) {
  try {
    const jsonX = await global.esClient.get({
      index: ES_INDEX_NAME,
      id: `/addresses/${addressId}`
    })
    logger('jsonX', jsonX)
    const json = {
      ...jsonX.body._source.structured,
      sla: jsonX.body._source.sla
    }
    logger('json', json)
    delete json._id
    const link = new LinkHeader()
    link.set({
      rel: 'self',
      uri: `/addresses/${addressId}`
    })
    // TODO: store hash in address
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(json))
      .digest('hex')

    return { link, json, hash }
  } catch (error_) {
    error('error getting record from elastic search', error_)
    if (error_.body.found === false) {
      return { statusCode: 404, json: { error: 'not found' } }
    } else if (error_.body.error.type === 'index_not_found_exception') {
      return { statusCode: 503, json: { error: 'service unavailable' } }
    } else {
      return { statusCode: 500, json: { error: 'unexpected error' } }
    }
  }
}

/**
 * Get List of Addresses
 * returns a list of addresses matching the search string
 *
 * q String search string (optional)
 * p Integer page number (optional)
 * returns List
 **/
export async function getAddresses(url, swagger, q, p = 1) {
  try {
    const foundAddresses = await searchForAddress(q, p)
    logger('foundAddresses', foundAddresses)
    const link = new LinkHeader()
    link.set({
      rel: 'describedby',
      uri: `/docs/#operations-${swagger.path.get[
        'x-swagger-router-controller'
      ].toLowerCase()}-${swagger.path.get.operationId}`,
      title: `${swagger.path.get.operationId} API Docs`,
      type: 'text/html'
    })
    const sp = new URLSearchParams({
      ...(q !== undefined && { q }),
      ...(p !== 1 && { p })
    })
    const spString = sp.toString()
    link.set({
      rel: 'self',
      uri: `${url}${spString === '' ? '' : '?'}${spString}`
    })
    link.set({
      rel: 'first',
      uri: `${url}${q === undefined ? '' : '?'}${new URLSearchParams({
        ...(q !== undefined && { q })
      }).toString()}`
    })
    if (p > 1) {
      link.set({
        rel: 'prev',
        uri: `${url}${q === undefined && p == 2 ? '' : '?'
          }${new URLSearchParams({
            ...(q !== undefined && { q }),
            ...(p > 2 && { p: p - 1 })
          }).toString()}`
      })
    }
    logger('TOTAL', foundAddresses.body.hits.total.value)
    logger('PAGE_SIZE * p', PAGE_SIZE * p)
    logger('next?', foundAddresses.body.hits.total.value > PAGE_SIZE * p)

    if (foundAddresses.body.hits.total.value > PAGE_SIZE * p) {
      link.set({
        rel: 'next',
        uri: `${url}?${new URLSearchParams({
          ...(q !== undefined && { q }),
          p: p + 1
        }).toString()}`
      })
    }
    const responseBody = mapToSearchAddressResponse(foundAddresses)
    logger('responseBody', JSON.stringify(responseBody, undefined, 2))

    const linkTemplate = new LinkHeader()
    const op = swagger.path.get
    setLinkOptions(op, url, linkTemplate)

    return { link, json: responseBody, linkTemplate }
  } catch (error_) {
    error('error querying elastic search', error_)
    if (
      error_.body &&
      error_.body.error &&
      error_.body.error.type === 'index_not_found_exception'
    ) {
      return { statusCode: 503, json: { error: 'service unavailable' } }
    } else if (error_.displayName === 'RequestTimeout') {
      return { statusCode: 504, json: { error: 'gateway timeout' } }
    } else {
      return { statusCode: 500, json: { error: 'unexpected error' } }
    }
  }
}

function mapToSearchAddressResponse(foundAddresses) {
  return foundAddresses.body.hits.hits.map(h => {
    return {
      sla: h._source.sla,
      score: h._score,
      links: {
        self: {
          href: h._id
        }
      }
    }
  })
}
