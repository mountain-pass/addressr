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
  console.log(context);
  const found = context['Authority_Code_LEVEL_TYPE_AUT_psv'].find(
    e => e.CODE === code,
  );
  if (found) {
    logger('FOUND', code, found.NAME);
    return found.NAME;
  }
  error(`Unknown Level Type Code: '${code}'`);
  return undefined;
}

function mapAddressDetails(d, context) {
  const rval = {
    ADDRESS_DETAIL: d,
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
      ...(d.LEVEL_TYPE_CODE !== '' &&
        d.LEVEL_NUMBER_PREFIX !== '' &&
        d.LEVEL_NUMBER !== '' &&
        d.LEVEL_NUMBER_SUFFIX !== '' && {
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
    pid: d.ADDRESS_DETAIL_PID,
    fla: '',
  };
  logger('addr', JSON.stringify(rval, null, 2));
  return rval;
}

async function loadAddressDetails(file, count, context) {
  const details = [];
  await new Promise((resolve, reject) => {
    Papa.parse(fs.createReadStream(file), {
      header: true,
      skipEmptyLines: true,
      step: function(row) {
        if (row.errors.length > 0) {
          error(`Errors reading '${file}': ${row.errors}`);
        } else {
          details.push(mapAddressDetails(row.data, context));
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
  const authCodeFiles = files.filter(f => f.match(/Authority Code/));
  logger('authCodeFiles', authCodeFiles);
  const context = {};
  for (let i = 0; i < authCodeFiles.length; i++) {
    const authFile = authCodeFiles[i];
    await new Promise((resolve, reject) => {
      Papa.parse(fs.createReadStream(`${dir}/${authFile}`), {
        delimiter: '|',
        header: true,
        complete: function(results) {
          context[path.basename(authFile, path.extname(authFile))] =
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
  logger('AUTH', context);
  const addressDetailFiles = files.filter(
    f => f.match(/ADDRESS_DETAIL/) && f.match(/\/Standard\//),
  );
  logger('addressDetailFiles', addressDetailFiles);
  await loadAddressDetails(
    `${dir}/${addressDetailFiles[0]}`,
    filesCounts[addressDetailFiles[0]],
    context,
  );
  throw new PendingError(dir);
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
