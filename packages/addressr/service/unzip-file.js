// Extraction of a G-NAF zip into the extract directory.
//
// Extracted from address-service.js so it can be tested. Same reason as
// service/gnaf-directory.js and service/covered-states.js: the caller's branch
// is unreachable in CI — address-service short-circuits the whole
// download/unzip/discover block on GNAF_TEST_FIXTURE_DIR, which release.yml
// sets on both cucumber steps. So nothing exercised this code, on the path that
// ingests every address the service serves.
//
// `gnafDir` is a parameter rather than a module-level `process.env` read, so a
// test can point it at a temporary directory. address-service passes its own
// GNAF_DIR, preserving the previous behaviour exactly.
import debug from 'debug';
import directoryExists from 'directory-exists';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

const logger = debug('api');

/**
 * Open an archive, promisified.
 *
 * `lazyEntries` is not optional here: without it yauzl emits every entry as
 * fast as it can read them, and each one needs an async mkdir/stat/write
 * before the next is safe to handle. With it, `readEntry()` requests exactly
 * one entry at a time, so the loop below is sequential and back-pressured over
 * a multi-gigabyte archive rather than opening thousands of write streams.
 */
const openZip = (file) =>
  new Promise((resolve, reject) => {
    yauzl.open(
      file,
      { lazyEntries: true, autoClose: true },
      (error_, zipfile) => {
        if (error_) reject(error_);
        else resolve(zipfile);
      },
    );
  });

const openEntryStream = (zipfile, entry) =>
  new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error_, readStream) => {
      if (error_) reject(error_);
      else resolve(readStream);
    });
  });

/**
 * Handle one archive entry: create its directory, or extract its file.
 *
 * At the outer scope rather than nested in the entry listener because the
 * listener is called once per entry and would otherwise rebuild these closures
 * 212 times per archive.
 *
 * @param {import('yauzl').ZipFile} zipfile Open archive.
 * @param {import('yauzl').Entry} entry The entry to handle.
 * @param {string} destination Root the entry is written under.
 */
async function extractEntry(zipfile, entry, destination) {
  // yauzl does not interpret entry names; a trailing slash is the zip
  // convention for a directory entry. It also rejects names containing `..`,
  // a backslash, or an absolute path before we ever see them.
  const entryPath = `${destination}/${entry.fileName}`;
  if (entry.fileName.endsWith('/')) {
    await fs.promises.mkdir(entryPath, { recursive: true });
    return;
  }

  // `recursive` here is LOAD-BEARING, not defensive. Measured against the real
  // August 2026 archive (1.85GB compressed, 8.83GB uncompressed, 212 entries)
  // by reading its central directory: it contains ZERO directory entries, and
  // 205 of its 212 paths contain spaces. Every directory in the extract —
  // `G-NAF/G-NAF AUGUST 2026/Standard/` and the rest — exists only because it
  // is created from a file's path. That archive also requires zip64, which
  // yauzl parses correctly; verified against the real file rather than assumed.
  await fs.promises.mkdir(path.dirname(entryPath), { recursive: true });

  let stats;
  try {
    stats = await fs.promises.stat(entryPath);
  } catch (error_) {
    // ENOENT is the ordinary case: nothing extracted here yet. Anything else
    // is a real filesystem problem and must not be swallowed into "extract it".
    if (error_.code !== 'ENOENT') throw error_;
  }
  if (stats && stats.size === entry.uncompressedSize) {
    // RESUME BY SIZE. Equal size is taken as already-extracted, which is what
    // makes an interrupted extract resumable over an archive this large rather
    // than restarting from zero.
    logger('skipping extract for', entryPath);
    return;
  }

  logger('extracting', entryPath);
  const readStream = await openEntryStream(zipfile, entry);
  // `pipeline` rather than `.pipe()`: it propagates errors from either side and
  // destroys both streams on failure. `.pipe()` not forwarding errors is the
  // specific defect that made the previous implementation crash the process.
  await pipeline(readStream, fs.createWriteStream(entryPath));
  logger('finished extracting', entryPath);
}

export async function unzipFile(file, gnafDirectory) {
  const extname = path.extname(file);
  const basenameWithoutExtention = path.basename(file, extname);
  const incomplete_path = `${gnafDirectory}/incomplete/${basenameWithoutExtention}`;
  const complete_path = `${gnafDirectory}/${basenameWithoutExtention}`;

  const exists = await directoryExists(complete_path);
  if (exists) {
    logger('directory exits. Skipping extract', complete_path);
    // already extracted. Move along.
    return complete_path;
  }

  await fs.promises.mkdir(incomplete_path, { recursive: true });
  const zipfile = await openZip(file);

  await new Promise((resolve, reject) => {
    // Errors on the archive itself — a truncated download, a corrupt central
    // directory, an entry name that would escape the extract root — arrive
    // here. THE PREVIOUS IMPLEMENTATION CRASHED THE PROCESS ON THESE: it piped
    // through unzip-stream's parser and attached `.on('error')` to the LAST
    // stream in the chain, but `.pipe()` does not forward errors, so a parser
    // error was emitted with no listener and became an uncaught exception. A
    // corrupt G-NAF archive took down the loader rather than producing
    // something a caller could handle. The sibling test pins the rejection.
    zipfile.on('error', reject);
    zipfile.on('end', resolve);
    zipfile.on('entry', async (entry) => {
      try {
        await extractEntry(zipfile, entry, incomplete_path);
        zipfile.readEntry();
      } catch (error_) {
        zipfile.close();
        reject(error_);
      }
    });
    zipfile.readEntry();
  });

  // Only now does the destination exist, so no failure above can leave a
  // partial extract that the already-extracted short-circuit would later
  // accept as complete.
  await fs.promises.rename(incomplete_path, complete_path);
  return complete_path;
}
