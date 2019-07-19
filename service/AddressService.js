import { PendingError } from '@windyroad/cucumber-js-throwables/lib/pending-error';
import debug from 'debug';
import directoryExists from 'directory-exists';
import fs from 'fs';
import got from 'got';
import LinkHeader from 'http-link-header';
import Papa from 'papaparse';
import path from 'path';
import stream from 'stream';
import unzip from 'unzip-stream';

const fsp = fs.promises;

var logger = debug('api');
var error = debug('error');

const Keyv = require('keyv');
const KeyvFile = require('keyv-file');

const cache = new Keyv({
  store: new KeyvFile({ filename: 'target/keyv-file.msgpack' }),
});

const ONE_DAY_S = 60 /*sec*/ * 60 /*min*/ * 24; /*hours*/

const ONE_DAY_MS = 1000 * ONE_DAY_S;
const THIRTY_DAYS_MS = ONE_DAY_MS * 30;

let addresses = [
  {
    sla: 'Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000',
    score: 1,
    links: {
      self: {
        href: '/address/GANT_718592778',
      },
    },
  },
  {
    sla: '109 Kirribilli Ave, Kirribilli NSW 2061',
    score: 0.985051936618461,
    links: {
      self: {
        href: '/address/GANT_718592782',
      },
    },
  },
];

export function clearAddresses() {
  addresses = [];
}

export function setAddresses(addr) {
  addresses = addr;
}

// need to try proxying this to modify the headers if we want to use got's cache implementation

// SEE https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc
const GNAF_PACKAGE_URL =
  process.env.GNAF_PACKAGE_URL ||
  'https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc';

async function fetchPackageData() {
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
    return new Promise((resolve, reject) => {
      got
        .stream(dataResource.url, {})
        .pipe(fs.createWriteStream(`${incomplete_path}/${basename}`))
        .on('finish', () => {
          fs.rename(`${incomplete_path}/${basename}`, dest, err => {
            if (err) reject(err);
            else resolve(dest);
          });
        })
        .on('error', error => {
          reject(error);
        })
        .on('downloadProgress', progress => {
          // I don't know why this isn't working
          logger('progress', progress);
        });
    });
  }
}

export async function unzipFile(file) {
  const extname = path.extname(file);
  const basenameWithoutExtention = path.basename(file, extname);
  const incomplete_path = `${GNAF_DIR}/incomplete/${basenameWithoutExtention}`;
  const complete_path = `${GNAF_DIR}/${basenameWithoutExtention}`;

  const exists = await directoryExists(complete_path);
  if (exists) {
    logger('directory exits. Skipping extract', complete_path);
    // already extracted. Move along.
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
          resolve();
        })
        .on('error', e => {
          logger('error unzipping data file', e);
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

function geocodeReliabilityCodeToName(code, context) {
  const found = context['Authority_Code_GEOCODE_RELIABILITY_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Geocode Reliability Code: '${code}'`);
  return undefined;
}

function geocodeTypeCodeToName(code, context) {
  const found = context['Authority_Code_GEOCODE_TYPE_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Geocode Type Code: '${code}'`);
  return undefined;
}

function levelGeocodedCodeToName(code, context) {
  const found = context['Authority_Code_GEOCODED_LEVEL_TYPE_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    return found.NAME;
  }
  error(`Unknown Geocoded Level Type Code: '${code}'`);
  return undefined;
}

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

function mapGeo(geos, context) {
  return geos.map(geo => {
    if (geo.BOUNDARY_EXTENT !== '') {
      console.log('be', geo);
      process.exit(1);
    }
    if (geo.PLANIMETRIC_ACCURACY !== '') {
      console.log('pa', geo);
      process.exit(1);
    }
    if (geo.ELEVATION !== '') {
      console.log('e', geo);
      process.exit(1);
    }
    if (geo.GEOCODE_SITE_NAME !== '') {
      console.log('gsn', geo);
      process.exit(1);
    }
    if (geo.GEOCODE_SITE_DESCRIPTION !== '') {
      console.log('gsd', geo);
      process.exit(1);
    }
    return {
      ...(geo.GEOCODE_TYPE_CODE !== '' && {
        type: {
          code: geo.GEOCODE_TYPE_CODE,
          name: geocodeTypeCodeToName(geo.GEOCODE_TYPE_CODE, context),
        },
      }),
      ...(geo.RELIABILITY_CODE !== '' && {
        reliability: {
          code: geo.RELIABILITY_CODE,
          name: geocodeReliabilityCodeToName(geo.RELIABILITY_CODE, context),
        },
      }),
      ...(geo.LATITUDE !== '' && {
        latitude: parseFloat(geo.LATITUDE),
      }),
      ...(geo.LONGITUDE !== '' && {
        longitude: parseFloat(geo.LONGITUDE),
      }),
      ...(geo.GEOCODE_SITE_NAME !== '' && {
        name: geo.GEOCODE_SITE_NAME,
      }),
      ...(geo.GEOCODE_SITE_DESCRIPTION !== '' && {
        description: geo.GEOCODE_SITE_DESCRIPTION,
      }),
    };
  });
}

function mapToSla(fla) {
  return fla.join(', ');
}

function mapAddressDetails(d, context, i, count) {
  const streetLocality = context.streetLocalityIndexed[d.STREET_LOCALITY_PID];
  const locality = context.localityIndexed[d.LOCALITY_PID];
  const geo = context.geoIndexed[d.ADDRESS_SITE_PID];
  // if (geo === undefined) {
  //   logger('NO GEO', geoX, d);
  //   process.exit(1);
  // }
  const rval = {
    // g: geo,

    // ADDRESS_DETAIL: d,
    // streetLocality: streetLocality,
    // locality: locality,
    ...((d.LEVEL_GEOCODED_CODE != '' || geo.length > 0) && {
      geocoding: {
        ...(d.LEVEL_GEOCODED_CODE !== '' && {
          level: {
            code: d.LEVEL_GEOCODED_CODE,
            name: levelGeocodedCodeToName(d.LEVEL_GEOCODED_CODE, context),
          },
        }),
        ...(geo !== undefined &&
          geo.length > 0 && { geocodes: mapGeo(geo, context) }),
      },
    }),
    structured: {
      ...(d.BUILDING_NAME !== '' && {
        buildingName: d.BUILDING_NAME,
      }),
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
            second: {
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
      precedence: d.PRIMARY_SECONDARY === 'P' ? 'primary' : 'secondary',
    },
    pid: d.ADDRESS_DETAIL_PID,
  };
  //  rval.fla = mapToFla(rval.structured);
  rval.fla = [
    'Tower 3',
    'Level 25',
    '300 Barangaroo Avenue',
    'Sydney NSW 2000',
  ];
  rval.sla = mapToSla(rval.fla);
  // process.stdout.write('.');
  if (i % 1000 === 0) {
    logger('addr', JSON.stringify(rval, null, 2));
    logger(`${(i / count) * 100.0}%`);
  }
  return rval;
}

async function loadAddressDetails(file, count, context) {
  const details = [];
  let i = 0;
  await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(file), {
      header: true,
      skipEmptyLines: true,
      step: function(row) {
        if (row.errors.length > 0) {
          error(`Errors reading '${file}': ${row.errors}`);
        } else {
          details.push(mapAddressDetails(row.data, context, i, count));
          i += 1;
        }
      },
      complete: function() {
        console.log('All done!');
        resolve();
      },
      error: (error, file) => {
        console.log(error, file);
        reject();
      },
    });
  });
  if (details.length != count) {
    error(
      `Error loading '${file}'. Expected '${count}' rows, got '${details.length}'`,
    );
  } else {
    logger(`loaded '${count}' rows from '${file}'`);
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
        console.log('All done!');
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
  logger('files', files);
  const loadContext = {};
  await loadAuthFiles(files, dir, loadContext, filesCounts);
  const addressDetailFiles = files.filter(
    f => f.match(/ADDRESS_DETAIL/) && f.match(/\/Standard\//),
  );
  logger('addressDetailFiles', addressDetailFiles);
  const detailFile = addressDetailFiles[0];
  const state = path
    .basename(detailFile, path.extname(detailFile))
    .replace(/_.*/, '');
  loadContext.state = state;
  loadContext.stateName = await loadState(files, dir, state);

  loadContext.streetLocality = await loadStreetLocality(files, dir, state);
  loadContext.streetLocalityIndexed = {};
  for (let index = 0; index < loadContext.streetLocality.length; index++) {
    const sl = loadContext.streetLocality[index];
    loadContext.streetLocalityIndexed[sl.STREET_LOCALITY_PID] = sl;
  }

  loadContext.locality = await loadLocality(files, dir, state);
  loadContext.localityIndexed = {};
  for (let index = 0; index < loadContext.locality.length; index++) {
    const l = loadContext.locality[index];
    loadContext.localityIndexed[l.LOCALITY_PID] = l;
  }

  loadContext.geo = await loadGeo(files, dir, state);
  loadContext.geoIndexed = {};
  for (let index = 0; index < loadContext.geo.length; index++) {
    const g = loadContext.geo[index];
    if (loadContext.geoIndexed[g.ADDRESS_SITE_PID] === undefined) {
      loadContext.geoIndexed[g.ADDRESS_SITE_PID] = [g];
    } else {
      loadContext.geoIndexed[g.ADDRESS_SITE_PID].push(g);
    }
  }

  await loadAddressDetails(
    `${dir}/${detailFile}`,
    filesCounts[detailFile],
    loadContext,
  );
  throw new PendingError(dir);
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

async function loadGeo(files, dir, state) {
  const geoFile = files.find(f =>
    f.match(new RegExp(`${state}_ADDRESS_SITE_GEOCODE_psv`)),
  );
  if (geoFile === undefined) {
    error(
      `Could not find address site geocode file '${state}_ADDRESS_SITE_GEOCODE_psv.psv'`,
    );
    return [];
  } else {
    return await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${dir}/${geoFile}`), {
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

async function loadAuthFiles(files, dir, loadContext, filesCounts) {
  const authCodeFiles = files.filter(f => f.match(/Authority Code/));
  logger('authCodeFiles', authCodeFiles);
  for (let i = 0; i < authCodeFiles.length; i++) {
    const authFile = authCodeFiles[i];
    await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${dir}/${authFile}`), {
        delimiter: '|',
        header: true,
        complete: function(results) {
          loadContext[path.basename(authFile, path.extname(authFile))] =
            results.data;
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
export function getAddress(/*addressId*/) {
  return new Promise(function(resolve /*, reject*/) {
    var examples = {};
    examples['application/json'] = {
      geo: {
        level: {
          code: 7,
          name: 'LOCALITY,STREET, ADDRESS',
        },
        reliability: {
          code: 2,
          name: 'WITHIN ADDRESS SITE BOUNDARY OR ACCESS POINT',
        },
        latitude: -33.85351875,
        longitude: 150.8947369,
      },
      structured: {
        buildingName: 'Vickery Lodge',
        number: {
          number: 20114,
          prefix: 'RMB',
          suffix: 'AA',
          second: {
            number: '20114',
            prefix: 'RMB',
            suffix: 'C',
          },
        },
        level: {
          number: 64,
          code: 'OD',
          prefix: 'A',
          type: 'Observation Deck',
          suffix: 'QG',
        },
        flat: {
          number: '20114',
          code: 'Twr',
          prefix: 'CT',
          type: 'Tower',
          suffix: 'AG',
        },
        street: {
          code: 'Avenue',
          name: 'Barangaroo',
          type: 'Av',
          suffix: {
            code: 'De',
            name: 'Deviation',
          },
        },
        confidence: 0,
        locality: {
          name: 'Sydney',
        },
        postcode: '2000',
        lotNumber: {
          number: 'CP',
          prefix: 'A',
          suffix: 'B',
        },
        state: {
          name: 'New South Wales',
          abbreviation: 'NSW',
        },
      },
      sla: 'Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000',
      pid: 'GANT_718592778',
      fla: '',
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}

/**
 * Get List of Addresses
 * returns a list of addresses matching the search string
 *
 * q String search string (optional)
 * p Integer page number (optional)
 * returns List
 **/
export async function getAddresses(url, swagger, q /*p*/) {
  if (q === undefined) {
    const link = new LinkHeader();
    link.set({
      rel: 'self',
      uri: url,
    });
    link.set({
      rel: 'first',
      uri: url,
    });
    link.set({
      rel: 'describedby',
      uri: `/docs/#operations-${swagger.path.get[
        'x-swagger-router-controller'
      ].toLowerCase()}-${swagger.path.get.operationId}`,
      title: `${swagger.path.get.operationId} API Docs`,
      type: 'text/html',
    });
    return { link: link, json: addresses };
  } else {
    throw new PendingError();
  }
}
