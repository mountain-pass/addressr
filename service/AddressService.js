import debug from 'debug';
import directoryExists from 'directory-exists';
import fs from 'fs';
import got from 'got';
import LinkHeader from 'http-link-header';
import ptr from 'json-ptr';
import Papa from 'papaparse';
import path from 'path';
import stream from 'stream';
import unzip from 'unzip-stream';
import { initIndex } from '../client/elasticsearch';
import { mongoConnect } from '../client/mongo';
import { getTracer } from '../service/Monitoring';
import download from '../utils/stream-down';

const fsp = fs.promises;

var logger = debug('api');
var error = debug('error');

const Keyv = require('keyv');
const KeyvFile = require('keyv-file');

const cache = new Keyv({
  store: new KeyvFile({ filename: 'target/keyv-file.msgpack' }),
});

const PAGE_SIZE = 8;

function getCoveredStates() {
  const covered = process.env.COVERED_STATES || '';
  if (covered == '') {
    return [];
  } else {
    return covered.split(',');
  }
}

const COVERED_STATES = getCoveredStates();

const ONE_DAY_S = 60 /*sec*/ * 60 /*min*/ * 24; /*hours*/

const ONE_DAY_MS = 1000 * ONE_DAY_S;
const THIRTY_DAYS_MS = ONE_DAY_MS * 30;

const ES_INDEX_NAME = process.env.ES_INDEX_NAME || 'addressr';

// let addresses = [
//   {
//     sla: 'Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000',
//     score: 1,
//     links: {
//       self: {
//         href: '/address/GANT_718592778',
//       },
//     },
//   },
//   {
//     sla: '109 Kirribilli Ave, Kirribilli NSW 2061',
//     score: 0.985051936618461,
//     links: {
//       self: {
//         href: '/address/GANT_718592782',
//       },
//     },
//   },
// ];

// async function initIndex(esClient, index, clear) {
//   if (await esClient.indices.exists({ index })) {
//     if (clear) {
//       await esClient.indices.delete({ index });
//     }
//   }
//   logger('checking if index exists');
//   const exists = await esClient.indices.exists({ index });
//   logger('index exists:', exists);

//   if (!exists) {
//     await esClient.indices.create({
//       index,
//       body: {
//         settings: {
//           index: {
//             analysis: {
//               analyzer: {
//                 default: {
//                   tokenizer: 'addressAutoCompleteTokenizer',
//                   filter: ['lowercase', 'asciifolding'],
//                 },
//                 synonym: {
//                   tokenizer: 'addressAutoCompleteTokenizer',
//                   filter: ['lowercase', 'synonym'],
//                 },
//                 addressAutoCompleteAnalyzer: {
//                   tokenizer: 'addressAutoCompleteTokenizer',
//                   filter: ['lowercase', 'asciifolding'],
//                 },
//               },
//               tokenizer: {
//                 addressAutoCompleteTokenizer: {
//                   type: 'edge_ngram',
//                   min_gram: 3,
//                   max_gram: 15,
//                   //token_chars: ['letter', 'digit'],
//                 },
//               },
//               filter: {
//                 synonym: {
//                   type: 'synonym',
//                   lenient: true,
//                   synonyms: [
//                     // TODO: Put street abbreviations here
//                     'SUPER, super, superannuation',
//                     'SMSF, smsf, self-managed superannuation funds, self managed superannuation funds',
//                   ],
//                 },
//               },
//             },
//           },
//         },
//         aliases: {},
//         mappings: {
//           properties: {
//             sla: {
//               type: 'text',
//               analyzer: 'addressAutoCompleteAnalyzer',
//             },
//             ssla: {
//               type: 'text',
//               analyzer: 'addressAutoCompleteAnalyzer',
//             },
//           },
//         },
//       },
//     });
//     logger('Index created');
//   }
//   await esClient.indices.get({ index, includeDefaults: true });
// }

//const INDEX_NAME = process.env.INDEX_NAME || 'addressr';

export async function clearAddresses() {
  await initIndex(global.esClient, true);
}

export async function setAddresses(addr) {
  await clearAddresses();

  const indexingBody = [];
  addr.forEach(row => {
    indexingBody.push({
      index: {
        _index: ES_INDEX_NAME,
        _id: row.links.self.href,
      },
    });
    indexingBody.push({
      sla: row.sla,
      ...(row.ssla != undefined && { ssla: row.ssla }),
    });
  });

  if (indexingBody.length > 0) {
    await sendIndexRequest(indexingBody);
  }
  //  addresses = addr;
  // empty index
  // then index the provided addresses

  logger(await searchForAddress('657 The Entrance Road')); //'2/25 TOTTERDE'; // 'UNT 2, BELCONNEN';);
}

// need to try proxying this to modify the headers if we want to use got's cache implementation

// SEE https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc
const GNAF_PACKAGE_URL =
  process.env.GNAF_PACKAGE_URL ||
  'https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc';

async function fetchPackageData() {
  const span = getTracer().startChildSpan({
    name: 'fetch gnaf package data',
  });
  span.start();
  const packageUrl = GNAF_PACKAGE_URL;
  // See if we have the value in cache
  const cachedRes = await cache.get(packageUrl);
  logger('cached gnaf package data', cachedRes);
  let age = 0;
  if (cachedRes !== undefined) {
    cachedRes.headers['x-cache'] = 'HIT';
    const created = new Date(cachedRes.headers.date);
    logger('created', created);
    age = Date.now() - created;
    if (age <= ONE_DAY_MS) {
      span.addAttribute('x-cache', 'HIT');
      span.addAnnotation('cache hit');
      span.end();
      return cachedRes;
    }
  }
  // cached value was older than one day, so go fetch
  try {
    const res = await got.get(packageUrl);
    logger('response.isFromCache', res.fromCache);
    logger('fresh gnaf package data', { body: res.body, headers: res.headers });
    await cache.set(packageUrl, { body: res.body, headers: res.headers });
    res.headers['x-cache'] = 'MISS';
    span.addAttribute('x-cache', 'MISS');
    span.addAnnotation('cache miss');
    span.end();
    return res;
  } catch (err) {
    // we were unable to fetch. if we have cached value that isn't stale, return in
    if (cachedRes !== undefined) {
      if (age < THIRTY_DAYS_MS) {
        cachedRes.headers['warning'] = '110	custom/1.0 "Response is Stale"';
        return cachedRes;
      }
    }
    // otherwise, throw the original network error
    throw err;
  }
}

const GNAF_DIR = process.env.GNAF_DIR || `target/gnaf`;

export async function fetchGnafFile() {
  const res = await fetchPackageData();
  const pack = JSON.parse(res.body);
  // id as of 16/07 for zip is 4b084096-65e4-4c8e-abbe-5e54ff85f42f
  const dataResource = pack.result.resources.find(
    r => r.state === 'active' && r.mimetype === 'application/zip',
  );

  // id as of 16/07/2019 for zip is 4b084096-65e4-4c8e-abbe-5e54ff85f42f
  logger('dataResource', JSON.stringify(dataResource, null, 2));
  logger('url', dataResource.url);
  logger('headers', JSON.stringify(res.headers, null, 2));
  const basename = path.basename(dataResource.url);
  logger('basename', basename);
  const complete_path = GNAF_DIR;
  const incomplete_path = `${complete_path}/incomplete`;
  await new Promise((resolve, reject) => {
    fs.mkdir(incomplete_path, { recursive: true }, err => {
      if (err) reject(err);
      else resolve();
    });
  });
  const dest = `${complete_path}/${basename}`;
  await new Promise((resolve, reject) => {
    fs.mkdir(incomplete_path, { recursive: true }, err => {
      if (err) reject(err);
      else resolve();
    });
  });
  // see if the file exists already
  try {
    await new Promise((resolve, reject) => {
      fs.access(dest, fs.constants.R_OK, err => {
        if (err) reject(err);
        else resolve();
      });
    });
    // it does exist, so don't bother trying to download it again
    return dest;
  } catch (e) {
    // file doesn't exist, so we need to download it.
    const span = getTracer().startChildSpan({ name: 'fetch gnaf zip' });
    span.addAttribute('url', dataResource.url);
    span.start();
    logger('Starting G-NAF download');
    try {
      await download(
        dataResource.url,
        `${incomplete_path}/${basename}`,
        dataResource.size,
      );
      await fsp.rename(`${incomplete_path}/${basename}`, dest);
      logger('Finished downloading G-NAF', dest);
      return dest;
    } catch (err) {
      error('Error downloading G-NAF', err);
      throw err;
    }
  }
}

export async function unzipFile(file) {
  const span = getTracer().startChildSpan({ name: 'unzip GNAF' });
  span.start();
  const extname = path.extname(file);
  const basenameWithoutExtention = path.basename(file, extname);
  const incomplete_path = `${GNAF_DIR}/incomplete/${basenameWithoutExtention}`;
  const complete_path = `${GNAF_DIR}/${basenameWithoutExtention}`;

  const exists = await directoryExists(complete_path);
  if (exists) {
    logger('directory exits. Skipping extract', complete_path);
    // already extracted. Move along.
    span.addAttribute('x-cache', 'HIT');
    span.end();
    return complete_path;
  } else {
    await new Promise((resolve, reject) => {
      fs.mkdir(incomplete_path, { recursive: true }, err => {
        if (err) reject(err);
        else resolve();
      });
    });
    const readStream = fs.createReadStream(file);
    logger('before pipe');
    let prom = new Promise((resolve, reject) => {
      readStream
        .pipe(unzip.Parse())
        .pipe(
          stream.Transform({
            objectMode: true,
            transform: function(entry, encoding, cb) {
              const entryPath = `${incomplete_path}/${entry.path}`;
              if (entry.isDirectory) {
                fs.mkdir(entryPath, { recursive: true }, err => {
                  if (err) {
                    entry.autodrain();
                    cb(err);
                  } else {
                    entry.autodrain();
                    cb();
                  }
                });
              } else {
                const dirname = path.dirname(entryPath);
                fs.mkdir(dirname, { recursive: true }, err => {
                  if (err) {
                    entry.autodrain();
                    cb(err);
                  } else {
                    fs.stat(entryPath, (err, stats) => {
                      if (err && err.code !== 'ENOENT') {
                        logger('error statting file', err);
                        entry.autodrain();
                        cb(err);
                        return;
                      }
                      if (stats != undefined && stats.size === entry.size) {
                        // no need to extract again. Skip
                        logger('skipping extract for', entryPath);
                        entry.autodrain();
                        cb();
                      } else {
                        // size is different, so extract the file
                        logger('extracting', entryPath);
                        entry
                          .pipe(fs.createWriteStream(entryPath))
                          .on('finish', () => {
                            logger('finished extracting', entryPath);
                            cb();
                          })
                          .on('error', error => {
                            logger('error unzipping entry', error);
                            cb(error);
                          });
                      }
                    });
                  }
                });
              }
            },
          }),
        )
        .on('finish', () => {
          logger('finish');
          span.addAttribute('x-cache', 'MISS');
          span.end();
          resolve();
        })
        .on('error', e => {
          logger('error unzipping data file', e);
          span.end();
          reject(e);
        });
    });
    await prom;

    return await new Promise((resolve, reject) => {
      fs.rename(incomplete_path, complete_path, err => {
        if (err) reject(err);
        else resolve(complete_path);
      });
    });
  }
}

// function cleanProperty(p, v) {
//   v !== '' && {
//     [p]: v,
//   };
// }

function levelTypeCodeToName(code, context) {
  const found = context['Authority_Code_LEVEL_TYPE_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Level Type Code: '${code}'`);
  return undefined;
}

function flatTypeCodeToName(code, context) {
  const found = context['Authority_Code_FLAT_TYPE_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Flat Type Code: '${code}'`);
  return undefined;
}

function streetTypeCodeToName(code, context) {
  const found = context['Authority_Code_STREET_TYPE_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Street Type Code: '${code}'`);
  return undefined;
}

function streetClassCodeToName(code, context) {
  const found = context['Authority_Code_STREET_CLASS_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Street Class Code: '${code}'`);
  return undefined;
}

function localityClassCodeToName(code, context) {
  const found = context['Authority_Code_LOCALITY_CLASS_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Locality Class Code: '${code}'`);
  return undefined;
}

function streetSuffixCodeToName(code, context) {
  const found = context['Authority_Code_STREET_SUFFIX_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Street Suffix Code: '${code}'`);
  return undefined;
}

// function geocodeReliabilityCodeToName(code, context) {
//   const found = context['Authority_Code_GEOCODE_RELIABILITY_AUT_psv'].find(
//     e => e.CODE === code,
//   );
//   if (found) {
//     return found.NAME;
//   }
//   error(`Unknown Geocode Reliability Code: '${code}'`);
//   return undefined;
// }

// function geocodeTypeCodeToName(code, context) {
//   const found = context['Authority_Code_GEOCODE_TYPE_AUT_psv'].find(
//     e => e.CODE === code,
//   );
//   if (found) {
//     return found.NAME;
//   }
//   error(`Unknown Geocode Type Code: '${code}'`);
//   return undefined;
// }

// function levelGeocodedCodeToName(code, context) {
//   const found = context['Authority_Code_GEOCODED_LEVEL_TYPE_AUT_psv'].find(
//     e => e.CODE === code,
//   );
//   if (found) {
//     return found.NAME;
//   }
//   error(`Unknown Geocoded Level Type Code: '${code}'`);
//   return undefined;
// }

function mapLocality(l, context) {
  return {
    ...(l.LOCALITY_NAME !== '' && {
      name: l.LOCALITY_NAME,
    }),
    ...(l.LOCALITY_CLASS_CODE !== '' && {
      class: {
        code: l.LOCALITY_CLASS_CODE,
        name: localityClassCodeToName(l.LOCALITY_CLASS_CODE, context),
      },
    }),
  };
}

function mapStreetLocality(l, context) {
  return {
    ...(l.STREET_NAME !== '' && {
      name: l.STREET_NAME,
    }),
    ...(l.STREET_TYPE_CODE !== '' && {
      type: {
        code: l.STREET_TYPE_CODE,
        name: streetTypeCodeToName(l.STREET_TYPE_CODE, context),
      },
    }),
    ...(l.STREET_CLASS_CODE !== '' && {
      class: {
        code: l.STREET_CLASS_CODE,
        name: streetClassCodeToName(l.STREET_CLASS_CODE, context),
      },
    }),
    ...(l.STREET_SUFFIX_CODE !== '' && {
      suffix: {
        code: l.STREET_SUFFIX_CODE,
        name: streetSuffixCodeToName(l.STREET_SUFFIX_CODE, context),
      },
    }),
  };
}

// function mapGeo(geos, context) {
//   return geos.map(geo => {
//     if (geo.BOUNDARY_EXTENT !== '') {
//       console.log('be', geo);
//       process.exit(1);
//     }
//     if (geo.PLANIMETRIC_ACCURACY !== '') {
//       console.log('pa', geo);
//       process.exit(1);
//     }
//     if (geo.ELEVATION !== '') {
//       console.log('e', geo);
//       process.exit(1);
//     }
//     if (geo.GEOCODE_SITE_NAME !== '') {
//       console.log('gsn', geo);
//       process.exit(1);
//     }
//     if (geo.GEOCODE_SITE_DESCRIPTION !== '') {
//       console.log('gsd', geo);
//       process.exit(1);
//     }
//     return {
//       ...(geo.GEOCODE_TYPE_CODE !== '' && {
//         type: {
//           code: geo.GEOCODE_TYPE_CODE,
//           name: geocodeTypeCodeToName(geo.GEOCODE_TYPE_CODE, context),
//         },
//       }),
//       ...(geo.RELIABILITY_CODE !== '' && {
//         reliability: {
//           code: geo.RELIABILITY_CODE,
//           name: geocodeReliabilityCodeToName(geo.RELIABILITY_CODE, context),
//         },
//       }),
//       ...(geo.LATITUDE !== '' && {
//         latitude: parseFloat(geo.LATITUDE),
//       }),
//       ...(geo.LONGITUDE !== '' && {
//         longitude: parseFloat(geo.LONGITUDE),
//       }),
//       ...(geo.GEOCODE_SITE_NAME !== '' && {
//         name: geo.GEOCODE_SITE_NAME,
//       }),
//       ...(geo.GEOCODE_SITE_DESCRIPTION !== '' && {
//         description: geo.GEOCODE_SITE_DESCRIPTION,
//       }),
//     };
//   });
// }

function mapToSla(fla) {
  return fla.join(', ');
}

function mapToMla(s) {
  const fla = [];
  if (s.level) {
    fla.push(
      `${s.level.type.name || ''} ${s.level.prefix || ''}${s.level.number ||
        ''}${s.level.suffix || ''}`,
    );
  }

  if (s.flat) {
    fla.push(
      `${s.flat.type.name || ''} ${s.flat.prefix || ''}${s.flat.number || ''}${s
        .flat.suffix || ''}`,
    );
  }

  if (s.buildingName) {
    fla.push(s.buildingName);
  }

  if (fla.length === 3) {
    fla[1] = `${fla[0]}, ${fla[1]}`;
    fla.shift();
  }

  let number = '';
  if (s.lotNumber && s.number === undefined) {
    number = `LOT ${s.lotNumber.prefix || ''}${s.lotNumber.number || ''}${s
      .lotNumber.suffix || ''}`;
  } else {
    number = `${s.number.prefix || ''}${s.number.number || ''}${s.number
      .suffix || ''}`;
    if (s.number.last) {
      number = `${number}-${s.number.last.prefix || ''}${s.number.last.number ||
        ''}${s.number.last.suffix || ''}`;
    }
  }

  const streetType = s.street.type ? ` ${s.street.type.name}` : '';
  const street = `${s.street.name}${streetType}`;

  fla.push(`${number} ${street}`);

  fla.push(`${s.locality.name} ${s.state.abbreviation} ${s.postcode}`);

  if (fla.length > 4) {
    logger('FLA TOO LONG', fla, s);
    process.exit(1);
  }
  return fla;
}

function mapToShortMla(s) {
  const fla = [];
  if (s.level) {
    fla.push(
      `${s.level.type.name || ''} ${s.level.prefix || ''}${s.level.number ||
        ''}${s.level.suffix || ''}`,
    );
  }

  let number = '';
  if (s.flat) {
    number = `${s.flat.prefix || ''}${s.flat.number || ''}${s.flat.suffix ||
      ''}/`;
  }
  if (s.lotNumber && s.number === undefined) {
    number = `${number}${s.lotNumber.prefix || ''}${s.lotNumber.number || ''}${s
      .lotNumber.suffix || ''}`;
  } else {
    number = `${number}${s.number.prefix || ''}${s.number.number || ''}${s
      .number.suffix || ''}`;
    if (s.number.last) {
      number = `${number}-${s.number.last.prefix || ''}${s.number.last.number ||
        ''}${s.number.last.suffix || ''}`;
    }
  }

  const streetType = s.street.type ? ` ${s.street.type.name}` : '';
  const street = `${s.street.name}${streetType}`;

  fla.push(`${number} ${street}`);

  fla.push(`${s.locality.name} ${s.state.abbreviation} ${s.postcode}`);

  if (fla.length > 4) {
    logger('FLA TOO LONG', fla, s);
    process.exit(1);
  }
  return fla;
}

export function mapAddressDetails(d, context, i, count) {
  const streetLocality = context.streetLocalityIndexed[d.STREET_LOCALITY_PID];
  const locality = context.localityIndexed[d.LOCALITY_PID];

  // const geo = context.geoIndexed[d.ADDRESS_SITE_PID];
  const rval = {
    // ...((d.LEVEL_GEOCODED_CODE != '' || geo.length > 0) && {
    //   geocoding: {
    //     ...(d.LEVEL_GEOCODED_CODE !== '' && {
    //       level: {
    //         code: d.LEVEL_GEOCODED_CODE,
    //         name: levelGeocodedCodeToName(d.LEVEL_GEOCODED_CODE, context),
    //       },
    //     }),
    //     ...(geo !== undefined &&
    //       geo.length > 0 && { geocodes: mapGeo(geo, context) }),
    //   },
    // }),
    structured: {
      ...(d.BUILDING_NAME !== '' && {
        buildingName: d.BUILDING_NAME,
      }),
      ...((d.NUMBER_FIRST_PREFIX !== '' ||
        d.NUMBER_FIRST !== '' ||
        d.NUMBER_FIRST_SUFFIX !== '') && {
        number: {
          ...(d.NUMBER_FIRST_PREFIX !== '' && {
            prefix: d.NUMBER_FIRST_PREFIX,
          }),
          ...(d.NUMBER_FIRST !== '' && {
            number: parseInt(d.NUMBER_FIRST),
          }),
          ...(d.NUMBER_FIRST_SUFFIX !== '' && {
            suffix: d.NUMBER_FIRST_SUFFIX,
          }),
          ...(d.NUMBER_LAST_PREFIX !== '' &&
            d.NUMBER_LAST !== '' &&
            d.NUMBER_LAST_SUFFIX !== '' && {
              last: {
                ...(d.NUMBER_LAST_PREFIX !== '' && {
                  prefix: d.NUMBER_LAST_PREFIX,
                }),
                ...(d.NUMBER_LAST !== '' && {
                  number: parseInt(d.NUMBER_LAST),
                }),
                ...(d.NUMBER_LAST_SUFFIX !== '' && {
                  suffix: d.NUMBER_LAST_SUFFIX,
                }),
              },
            }),
        },
      }),
      ...((d.LEVEL_TYPE_CODE !== '' ||
        d.LEVEL_NUMBER_PREFIX !== '' ||
        d.LEVEL_NUMBER !== '' ||
        d.LEVEL_NUMBER_SUFFIX !== '') && {
        level: {
          ...(d.LEVEL_TYPE_CODE !== '' && {
            type: {
              code: d.LEVEL_TYPE_CODE,
              name: levelTypeCodeToName(d.LEVEL_TYPE_CODE, context),
            },
          }),
          ...(d.LEVEL_NUMBER_PREFIX !== '' && {
            prefix: d.LEVEL_NUMBER_PREFIX,
          }),
          ...(d.LEVEL_NUMBER !== '' && {
            number: parseInt(d.LEVEL_NUMBER),
          }),
          ...(d.LEVEL_NUMBER_SUFFIX !== '' && {
            suffix: d.LEVEL_NUMBER_SUFFIX,
          }),
        },
      }),
      ...((d.FLAT_TYPE_CODE !== '' ||
        d.FLAT_NUMBER_PREFIX !== '' ||
        d.FLAT_NUMBER !== '' ||
        d.FLAT_NUMBER_SUFFIX !== '') && {
        flat: {
          ...(d.FLAT_TYPE_CODE !== '' && {
            type: {
              code: d.FLAT_TYPE_CODE,
              name: flatTypeCodeToName(d.FLAT_TYPE_CODE, context),
            },
          }),
          ...(d.FLAT_NUMBER_PREFIX !== '' && {
            prefix: d.FLAT_NUMBER_PREFIX,
          }),
          ...(d.FLAT_NUMBER !== '' && {
            number: parseInt(d.FLAT_NUMBER),
          }),
          ...(d.FLAT_NUMBER_SUFFIX !== '' && {
            suffix: d.FLAT_NUMBER_SUFFIX,
          }),
        },
      }),
      // May need to include street locality aliases here
      street: mapStreetLocality(streetLocality, context),
      ...(d.CONFIDENCE !== '' && {
        confidence: parseInt(d.CONFIDENCE),
      }),
      locality: mapLocality(locality, context),
      ...(d.POSTCODE !== '' && {
        postcode: d.POSTCODE,
      }),
      ...((d.LOT_NUMBER_PREFIX !== '' ||
        d.LOT_NUMBER !== '' ||
        d.LOT_NUMBER_SUFFIX !== '') && {
        lotNumber: {
          ...(d.LOT_NUMBER_PREFIX !== '' && {
            prefix: d.LOT_NUMBER_PREFIX,
          }),
          ...(d.LOT_NUMBER !== '' && {
            number: d.LOT_NUMBER,
          }),
          ...(d.LOT_NUMBER_SUFFIX !== '' && {
            suffix: d.LOT_NUMBER_SUFFIX,
          }),
        },
      }),
      state: {
        name: context.stateName,
        abbreviation: context.state,
      },
    },
    ...(d.PRIMARY_SECONDARY !== '' && {
      precedence: d.PRIMARY_SECONDARY === 'P' ? 'primary' : 'secondary',
    }),
    pid: d.ADDRESS_DETAIL_PID,
    _id: d.ADDRESS_DETAIL_PID,
  };
  rval.mla = mapToMla(rval.structured);
  rval.sla = mapToSla(rval.mla);
  if (rval.structured.flat != undefined) {
    rval.smla = mapToShortMla(rval.structured);
    rval.ssla = mapToSla(rval.smla);
  }
  // process.stdout.write('.');
  if (i % Math.ceil(count / 100) === 0) {
    logger('addr', JSON.stringify(rval, null, 2));
    logger(`${(i / count) * 100.0}%`);
  }

  return rval;
}

async function loadAddressDetails(file, expectedCount, context) {
  let actualCount = 0;

  await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(file), {
      header: true,
      skipEmptyLines: true,
      chunk: function(chunk, parser) {
        parser.pause();
        const items = [];
        if (chunk.errors.length > 0) {
          error(`Errors reading '${file}': ${chunk.errors}`);
        } else {
          const indexingBody = [];
          chunk.data.forEach(row => {
            const item = mapAddressDetails(
              row,
              context,
              actualCount,
              expectedCount,
            );
            items.push(item);
            actualCount += 1;
            indexingBody.push({
              index: {
                _index: ES_INDEX_NAME,
                _id: `/addresses/${item.pid}`,
              },
            });
            indexingBody.push({
              sla: item.sla,
              ...(item.ssla != undefined && { ssla: item.ssla }),
            });
          });
          if (indexingBody.length > 0) {
            sendIndexRequest(indexingBody)
              .then(() => {
                var bulk = global.addressrCollection.initializeOrderedBulkOp();
                items.forEach(item => {
                  bulk
                    .find({ _id: item._id })
                    .upsert()
                    .replaceOne(item);
                });
                return bulk.execute();
              })
              .then(() => {
                parser.resume();
              })
              .catch(err => {
                error('error sending index request', err);
                throw err;
              });
          } else {
            // nothing to process. Have reached end of file.
            parser.resume();
          }
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
      complete: function() {
        console.log('Address details loaded', context.state, expectedCount);
        resolve();
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
      error: (error, file) => {
        console.log(error, file);
        reject();
      },
    });
  });
  if (actualCount != expectedCount) {
    error(
      `Error loading '${file}'. Expected '${expectedCount}' rows, got '${actualCount}'`,
    );
  } else {
    logger(`loaded '${actualCount}' rows from '${file}'`);
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

async function searchForAddress(searchString, p) {
  //  const searchString = '657 The Entrance Road'; //'2/25 TOTTERDE'; // 'UNT 2, BELCONNEN';
  const searchResp = await global.esClient.search({
    index: ES_INDEX_NAME,
    body: {
      from: (p - 1 || 0) * PAGE_SIZE,
      size: PAGE_SIZE,
      query: {
        bool: {
          must: [
            {
              exists: {
                field: 'sla',
              },
            },
          ],
          ...(searchString && {
            should: [
              {
                multi_match: {
                  fields: ['sla', 'ssla'],
                  query: searchString,
                  fuzziness: 'AUTO',
                  auto_generate_synonyms_phrase_query: true,
                },
              },
            ],
          }),
        },
      },
      highlight: {
        fields: {
          sla: {},
          ssla: {},
        },
      },
    },
  });
  logger('hits', JSON.stringify(searchResp.hits, null, 2));
  return searchResp;
}

async function sendIndexRequest(
  indexingBody,
  initialBackoff = process.env.ADDRESSR_INDEX_BACKOFF || 1000,
) {
  let backoff = initialBackoff;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let nextBackoff = Math.min(
      process.env.ADDRESSR_INDEX_BACKOFF_MAX || 10000,
      backoff + (process.env.ADDRESSR_INDEX_BACKOFF_INCREMENT || 1000),
    );
    try {
      const resp = await global.esClient.bulk({
        refresh: true,
        body: indexingBody,
        timeout: process.env.ADDRESSR_INDEX_TIMEOUT || '30s',
      });

      if (resp.errors) {
        throw resp;
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
      return;
    } catch (err) {
      error('Indexing error', JSON.stringify(err, null, 2));
      error(`backing off for ${backoff}ms`);
      // parser.pause();
      // paused = true;
      await new Promise(resolve => {
        // eslint-disable-next-line no-undef
        setTimeout(() => {
          resolve();
        }, backoff);
      });
      // eslint-disable-next-line require-atomic-updates
      backoff = nextBackoff;
      continue;
    }
  }
}

async function getStateName(abbr, file) {
  return await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(file), {
      header: true,
      delimiter: '|',
      complete: results => {
        resolve(results.data[0].STATE_NAME);
      },
      error: (error, file) => {
        console.log(error, file);
        reject(error);
      },
    });
  });
}

async function loadGnafData(dir) {
  let span = getTracer().startChildSpan({ name: 'load GNAF counts' });
  span.start();
  const filesCounts = {};
  await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(`${dir}/Counts.csv`), {
      header: true,
      skipEmptyLines: true,
      step: function(row) {
        if (row.errors.length > 0) {
          error(`Errors reading '${dir}/Counts.csv': ${row.errors}`);
        } else {
          const psvFile = row.data.File.replace(/\\/g, '/').replace(
            /\.zip$/,
            '.psv',
          );
          filesCounts[psvFile] = row.data.Count;
        }
      },
      complete: function() {
        console.log('GNAF data loaded');
        resolve();
      },
      error: (error, file) => {
        console.log(error, file);
        reject();
      },
    });
  });
  logger('filesCounts', filesCounts);
  const files = Object.keys(filesCounts);
  span.end();
  logger('files', files);
  const loadContext = {};
  await loadAuthFiles(files, dir, loadContext, filesCounts);
  const addressDetailFiles = files.filter(
    f => f.match(/ADDRESS_DETAIL/) && f.match(/\/Standard\//),
  );
  logger('addressDetailFiles', addressDetailFiles);
  for (let i = 0; i < addressDetailFiles.length; i++) {
    const detailFile = addressDetailFiles[i];

    const state = path
      .basename(detailFile, path.extname(detailFile))
      .replace(/_.*/, '');
    if (COVERED_STATES.length === 0 || COVERED_STATES.includes(state)) {
      loadContext.state = state;
      loadContext.stateName = await loadState(files, dir, state);

      logger('Loading streets', state);
      let span = getTracer().startChildSpan({ name: 'loading street' });
      span.addAttribute('state', state);
      span.start();
      const streetLocality = await loadStreetLocality(files, dir, state);
      loadContext.streetLocalityIndexed = {};
      for (let index = 0; index < streetLocality.length; index++) {
        const sl = streetLocality[index];
        loadContext.streetLocalityIndexed[sl.STREET_LOCALITY_PID] = sl;
      }
      span.end();
      span = getTracer().startChildSpan({ name: 'loading suburbs' });
      span.addAttribute('state', state);
      span.start();

      logger('Loading suburbs', state);
      const locality = await loadLocality(files, dir, state);
      loadContext.localityIndexed = {};
      for (let index = 0; index < locality.length; index++) {
        const l = locality[index];
        loadContext.localityIndexed[l.LOCALITY_PID] = l;
      }
      span.end();

      // logger('Loading geos', state);
      // const geo = await loadGeo(files, dir, state);
      // loadContext.geoIndexed = {};
      // logger('indexing geos', state, geo.length);
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

      span = getTracer().startChildSpan({ name: 'loading address details' });
      span.addAttribute('state', state);
      span.start();
      await loadAddressDetails(
        `${dir}/${detailFile}`,
        filesCounts[detailFile],
        loadContext,
      );
      span.end();
    }
  }
}

async function loadState(files, dir, state) {
  const stateFile = files.find(f => f.match(new RegExp(`${state}_STATE_psv`)));
  if (stateFile === undefined) {
    error(`Could not find state file '${state}_STATE_psv.psv'`);
    return undefined;
  } else {
    const name = await getStateName(state, `${dir}/${stateFile}`);
    return name;
  }
}

async function loadStreetLocality(files, dir, state) {
  const localityFile = files.find(f =>
    f.match(new RegExp(`${state}_STREET_LOCALITY_psv`)),
  );
  if (localityFile === undefined) {
    error(
      `Could not find street locality file '${state}_STREET_LOCALITY_psv.psv'`,
    );
    return [];
  } else {
    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${dir}/${localityFile}`), {
        header: true,
        delimiter: '|',
        complete: results => {
          resolve(results.data);
        },
        error: (error, file) => {
          console.log(error, file);
          reject(error);
        },
      });
    });
  }
}

async function loadLocality(files, dir, state) {
  const localityFile = files.find(f =>
    f.match(new RegExp(`${state}_LOCALITY_psv`)),
  );
  if (localityFile === undefined) {
    error(`Could not find locality file '${state}_LOCALITY_psv.psv'`);
    return [];
  } else {
    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${dir}/${localityFile}`), {
        header: true,
        delimiter: '|',
        complete: results => {
          resolve(results.data);
        },
        error: (error, file) => {
          console.log(error, file);
          reject(error);
        },
      });
    });
  }
}

// async function loadGeo(files, dir, state) {
//   const geoFile = files.find(f =>
//     f.match(new RegExp(`${state}_ADDRESS_SITE_GEOCODE_psv`)),
//   );
//   if (geoFile === undefined) {
//     error(
//       `Could not find address site geocode file '${state}_ADDRESS_SITE_GEOCODE_psv.psv'`,
//     );
//     return [];
//   } else {
//     return await new Promise((resolve, reject) => {
//       Papa.parse(fs.createReadStream(`${dir}/${geoFile}`), {
//         header: true,
//         delimiter: '|',
//         complete: results => {
//           resolve(results.data);
//         },
//         error: (error, file) => {
//           console.log(error, file);
//           reject(error);
//         },
//       });
//     });
//   }
// }

async function loadAuthFiles(files, dir, loadContext, filesCounts) {
  const authCodeFiles = files.filter(f => f.match(/Authority Code/));
  logger('authCodeFiles', authCodeFiles);
  for (let i = 0; i < authCodeFiles.length; i++) {
    const authFile = authCodeFiles[i];
    const span = getTracer().startChildSpan({ name: 'loading GNAF Auth file' });
    span.addAttribute('authfile', authFile);
    span.start();
    await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${dir}/${authFile}`), {
        delimiter: '|',
        header: true,
        complete: function(results) {
          loadContext[path.basename(authFile, path.extname(authFile))] =
            results.data;
          span.end();
          if (results.data.length != filesCounts[authFile]) {
            error(
              `Error loading '${dir}/${authFile}'. Expected '${filesCounts[authFile]}' rows, got '${results.data.length}'`,
            );
            reject(
              `Error loading '${dir}/${authFile}'. Expected '${filesCounts[authFile]}' rows, got '${results.data.length}'`,
            );
          } else {
            logger(`loaded '${results.length}' rows from '${dir}/${authFile}'`);
            resolve();
          }
        },
        error: (error, file) => {
          error(`Error loading '${dir}/${authFile}`, error, file);
          reject([`Error loading '${dir}/${authFile}`, error, file]);
        },
      });
    });
  }
  logger('AUTH', loadContext);
}

export async function loadGnaf() {
  const file = await fetchGnafFile();
  const unzipped = await unzipFile(file);

  logger('Data dir', unzipped);
  const contents = await fsp.readdir(unzipped);
  logger('Data dir contents', contents);
  if (contents.length == 0) {
    throw new Error(`Data dir '${unzipped}' is empty`);
  }
  if (contents.length > 1) {
    throw new Error(
      `Data dir '${unzipped}' has more than one entry: ${contents}`,
    );
  }
  const mainDir = `${unzipped}/${contents[0]}`;
  logger('Main Data dir', mainDir);

  await loadGnafData(mainDir);
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
    const json = await global.addressrCollection.findOne({ _id: addressId });
    logger('json', json);
    delete json._id;
    const link = new LinkHeader();
    link.set({
      rel: 'self',
      uri: `/addresses/${addressId}`,
    });

    return { link, json };
  } catch (err) {
    if (
      err.name === 'MongoError' &&
      err.toString() === 'MongoError: Topology was destroyed'
    ) {
      // should try to reconnect here
      if (global.addressrCollection !== undefined) {
        global.mongoClient = undefined;
        global.mongoDb = undefined;
        global.addressrCollection = undefined;
        logger('reconnecting mongo client');
        mongoConnect().then(() => {
          logger('mongo client connected');
        });
      }
    }
    throw err;
  }
  //  throw new PendingError(addressId);
  // return new Promise(function(resolve /*, reject*/) {
  //   if (Object.keys(examples).length > 0) {
  //     resolve({ json: examples[Object.keys(examples)[0]] });
  //   } else {
  //     resolve();
  //   }
  // });
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
  const foundAddresses = await searchForAddress(q, p);
  logger('foundAddresses', foundAddresses);

  const link = new LinkHeader();
  link.set({
    rel: 'describedby',
    uri: `/docs/#operations-${swagger.path.get[
      'x-swagger-router-controller'
    ].toLowerCase()}-${swagger.path.get.operationId}`,
    title: `${swagger.path.get.operationId} API Docs`,
    type: 'text/html',
  });
  const sp = new URLSearchParams({
    ...(q !== undefined && { q }),
    ...(p !== 1 && { p }),
  });
  const spString = sp.toString();
  link.set({
    rel: 'self',
    uri: `${url}${spString === '' ? '' : '?'}${spString}`,
  });
  link.set({
    rel: 'first',
    uri: `${url}${q === undefined ? '' : '?'}${new URLSearchParams({
      ...(q !== undefined && { q }),
    }).toString()}`,
  });
  if (p > 1) {
    link.set({
      rel: 'prev',
      uri: `${url}${q === undefined && p == 2 ? '' : '?'}${new URLSearchParams({
        ...(q !== undefined && { q }),
        ...(p > 2 && { p: p - 1 }),
      }).toString()}`,
    });
  }
  logger('TOTAL', foundAddresses.hits.total.value);
  logger('PAGE_SIZE * p', PAGE_SIZE * p);
  logger('next?', foundAddresses.hits.total.value > PAGE_SIZE * p);

  if (foundAddresses.hits.total.value > PAGE_SIZE * p) {
    link.set({
      rel: 'next',
      uri: `${url}?${new URLSearchParams({
        ...(q !== undefined && { q }),
        p: p + 1,
      }).toString()}`,
    });
  }
  const responseBody = mapToSearchAddressResponse(foundAddresses);
  logger('responseBody', JSON.stringify(responseBody, null, 2));

  const linkTemplate = new LinkHeader();
  const op = swagger.path.get;
  if (op.parameters) {
    const parameters = op.parameters;
    const queryParams = parameters.filter(param => param.in === 'query');
    const linkOptions = {
      rel: op['x-root-rel'],
      uri: `${url}{?${queryParams.map(qp => qp.name).join(',')}}`,
      title: op.summary,
      type: 'application/json',
      'var-base': `/api-docs${ptr.encodeUriFragmentIdentifier([
        'paths',
        url,
        'get',
        'parameters',
      ])}`,
    };
    linkTemplate.set(linkOptions);
  }

  return { link, json: responseBody, linkTemplate };
}

function mapToSearchAddressResponse(foundAddresses) {
  return foundAddresses.hits.hits.map(h => {
    return {
      sla: h._source.sla,
      score: h._score,
      links: {
        self: {
          href: h._id,
        },
      },
    };
  });
}
