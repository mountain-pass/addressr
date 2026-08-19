// Behaviour of the G-NAF archive extraction, pinned so the implementation can
// be replaced without changing what it does.
//
// WHY THIS EXISTS. `unzipFile` had no test at all, on the path that ingests
// every address the service serves. It was unreachable in CI — address-service
// short-circuits the whole download/unzip/discover block on
// GNAF_TEST_FIXTURE_DIR, which release.yml sets on both cucumber steps — so
// nothing exercised it. Same reason service/gnaf-directory.js and
// service/covered-states.js were extracted before it.
//
// WRITTEN AGAINST THE OLD IMPLEMENTATION FIRST, deliberately. These assertions
// were run green against the unzip-stream version before yauzl replaced it, so
// they describe the behaviour that WAS there rather than the behaviour the new
// code happens to have. A test written after the swap would have pinned the
// replacement's bugs as the specification.
//
// The fixture is a real zip embedded as base64 rather than a checked-in binary
// or a shell-out to `zip`: self-contained, no external tool, and the exact
// entry sizes below are what the resume-by-size assertion turns on.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipFile } from '../../../packages/addressr/service/unzip-file.js';

// Shaped after the real archive, then made harder. The real August 2026 G-NAF
// (1.85GB compressed, 8.83GB uncompressed, 212 entries, zip64) contains ZERO
// directory entries and has spaces in its paths, so directory creation from
// file paths is the only thing that makes extraction work. This fixture keeps
// one explicit directory entry as well, so BOTH shapes are covered.
//
// G-NAF/                          (explicit directory entry)
// G-NAF/top.psv                   12 bytes
// G-NAF/Authority Code/auth.psv   15 bytes  (space in the directory name)
// G-NAF/nested/deep/leaf.psv     100 bytes  (two levels with no directory entry)
const ZIP64_B64 =
  'UEsDBC0AAAAAAMZ6E10AAAAA//////////8GADAARy1OQUYvVVQJAAODPYVqgz2FanV4CwABBPUBAAAEAAAAAAEAEAAAAAAAAAAAAAAAAAAAAAAAUEsDBC0AAAAIAMZ6E13Z3Y1R//////////8NADAARy1OQUYvYmlnLnBzdlVUCQADgz2FaoM9hWp1eAsAAQT1AQAABAAAAAABABAAEgAAAAAAAAAKAAAAAAAAAHOscapx5nJEIgFQSwMELQAAAAAAxnoTXfrtDMz//////////w8AMABHLU5BRi9zbWFsbC5wc3ZVVAkAA4M9hWqDPYVqdXgLAAEE9QEAAAQAAAAAAQAQAAQAAAAAAAAABAAAAAAAAAB4fHkKUEsBAh4DCgAAAAAAxnoTXQAAAAAAAAAA/////wYAJAAAAAAAAAAQAO1BAAAAAEctTkFGL1VUBQADgz2FanV4CwABBPUBAAAEAAAAAAEACAAAAAAAAAAAAFBLAQIeAy0AAAAIAMZ6E13Z3Y1RCgAAAP////8NACQAAAAAAAEAAACkgVQAAABHLU5BRi9iaWcucHN2VVQFAAODPYVqdXgLAAEE9QEAAAQAAAAAAQAIABIAAAAAAAAAUEsBAh4DLQAAAAAAxnoTXfrtDMwEAAAA/////w8AJAAAAAAAAQAAAKSBuQAAAEctTkFGL3NtYWxsLnBzdlVUBQADgz2FanV4CwABBPUBAAAEAAAAAAEACAAEAAAAAAAAAFBLBgYsAAAAAAAAAB4DLQAAAAAAAAAAAAMAAAAAAAAAAwAAAAAAAAAYAQAAAAAAABoBAAAAAAAAUEsGBwAAAAAyAgAAAAAAAAEAAABQSwUGAAAAAAMAAwAYAQAA/////wAA';
const TRAVERSAL_B64 =
  'UEsDBBQAAAAAAPVwE12vXWgsBQAAAAUAAAAMAAAARy1OQUYvb2sucHN2ZmluZQpQSwMEFAAAAAAA9XATXftes4UGAAAABgAAAA4AAAAuLi9lc2NhcGVkLnBzdnB3bmVkClBLAQIUAxQAAAAAAPVwE12vXWgsBQAAAAUAAAAMAAAAAAAAAAAAAACAAQAAAABHLU5BRi9vay5wc3ZQSwECFAMUAAAAAAD1cBNd+16zhQYAAAAGAAAADgAAAAAAAAAAAAAAgAEvAAAALi4vZXNjYXBlZC5wc3ZQSwUGAAAAAAIAAgB2AAAAYQAAAAAA';
const FIXTURE_B64 = 'UEsDBBQAAAAIAJtuE10AAAAAAgAAAAAAAAAGAAAARy1OQUYvAwBQSwMEFAAAAAgAm24TXS504ksOAAAADAAAAA0AAABHLU5BRi90b3AucHN2c6xxqnHmMqwxqjHmAgBQSwMEFAAAAAgAm24TXTvq9i4RAAAADwAAAB0AAABHLU5BRi9BdXRob3JpdHkgQ29kZS9hdXRoLnBzdnP2d3Gt8XP0deWKqHGt4AIAUEsDBBQAAAAIAJtuE12PXQ5eBgAAAGQAAAAaAAAARy1OQUYvbmVzdGVkL2RlZXAvbGVhZi5wc3arqKA9AABQSwECFAMUAAAACACbbhNdAAAAAAIAAAAAAAAABgAAAAAAAAAAABAA/UEAAAAARy1OQUYvUEsBAhQDFAAAAAgAm24TXS504ksOAAAADAAAAA0AAAAAAAAAAAAAAIABJgAAAEctTkFGL3RvcC5wc3ZQSwECFAMUAAAACACbbhNdO+r2LhEAAAAPAAAAHQAAAAAAAAAAAAAAgAFfAAAARy1OQUYvQXV0aG9yaXR5IENvZGUvYXV0aC5wc3ZQSwECFAMUAAAACACbbhNdj10OXgYAAABkAAAAGgAAAAAAAAAAAAAAgAGrAAAARy1OQUYvbmVzdGVkL2RlZXAvbGVhZi5wc3ZQSwUGAAAAAAQABAACAQAA6QAAAAAA';

let tmp;
let archive;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'addressr-unzip-'));
  archive = path.join(tmp, 'aug26_gnaf_pipeseparatedvalue.zip');
  fs.writeFileSync(archive, Buffer.from(FIXTURE_B64, 'base64'));
});

const extractRoot = () => path.join(tmp, 'gnaf');

describe('unzipFile — extraction', () => {
  it('extracts every entry, creating directories that have no explicit entry', async () => {
    const out = await unzipFile(archive, extractRoot());
    assert.equal(out, path.join(extractRoot(), 'aug26_gnaf_pipeseparatedvalue'));
    assert.equal(fs.readFileSync(path.join(out, 'G-NAF/top.psv'), 'utf8'), 'A|B|C\n1|2|3\n');
    // A directory name containing a space, and a two-deep path with no
    // directory entry of its own — both must be created from the file path.
    assert.equal(
      fs.readFileSync(path.join(out, 'G-NAF/Authority Code/auth.psv'), 'utf8'),
      'CODE|NAME\nX|Ex\n',
    );
    assert.equal(fs.readFileSync(path.join(out, 'G-NAF/nested/deep/leaf.psv'), 'utf8').length, 100);
  });

  it('renames the staging directory into place, leaving nothing under incomplete/', async () => {
    // STAGE THEN RENAME. A partial extract must never be mistaken for a
    // complete one by the short-circuit below, so the destination only exists
    // once every entry has been written.
    const out = await unzipFile(archive, extractRoot());
    assert.ok(fs.existsSync(out), 'the completed extract directory should exist');
    const staged = path.join(extractRoot(), 'incomplete', 'aug26_gnaf_pipeseparatedvalue');
    assert.ok(!fs.existsSync(staged), 'the staging directory should have been renamed away');
  });

  it('returns the existing directory without reading the archive again', async () => {
    // ALREADY-EXTRACTED SHORT-CIRCUIT. G-NAF is multi-gigabyte; re-extracting
    // on every start would dominate startup. Proven by deleting the archive:
    // if it were read, this would throw.
    const out = await unzipFile(archive, extractRoot());
    fs.unlinkSync(archive);
    const again = await unzipFile(archive, extractRoot());
    assert.equal(again, out);
  });

  it('leaves an already-extracted file of the same size untouched', async () => {
    // RESUME BY SIZE. This is what makes an interrupted extract resumable
    // rather than restarting from zero. Pre-seed the staging directory with a
    // same-size file whose CONTENT differs, and it must survive: equal size is
    // the whole test the implementation applies.
    const staged = path.join(extractRoot(), 'incomplete', 'aug26_gnaf_pipeseparatedvalue', 'G-NAF');
    fs.mkdirSync(staged, { recursive: true });
    const sentinel = 'Z|Y|X\n9|8|7\n'; // same 12 bytes as G-NAF/top.psv
    fs.writeFileSync(path.join(staged, 'top.psv'), sentinel);

    const out = await unzipFile(archive, extractRoot());
    assert.equal(
      fs.readFileSync(path.join(out, 'G-NAF/top.psv'), 'utf8'),
      sentinel,
      'a same-size file was re-extracted; resume-by-size has been lost',
    );
    // The others still extract normally.
    assert.equal(fs.readFileSync(path.join(out, 'G-NAF/nested/deep/leaf.psv'), 'utf8').length, 100);
  });

  it('overwrites an already-extracted file whose size differs', async () => {
    // The converse of resume-by-size, and the half that matters for
    // correctness: a truncated file from an interrupted write must be replaced.
    const staged = path.join(extractRoot(), 'incomplete', 'aug26_gnaf_pipeseparatedvalue', 'G-NAF');
    fs.mkdirSync(staged, { recursive: true });
    fs.writeFileSync(path.join(staged, 'top.psv'), 'trunc'); // 5 bytes, not 12

    const out = await unzipFile(archive, extractRoot());
    assert.equal(fs.readFileSync(path.join(out, 'G-NAF/top.psv'), 'utf8'), 'A|B|C\n1|2|3\n');
  });

  it('extracts a zip64 archive, and the fixture really is zip64', async () => {
    // THE REAL ARCHIVE IS ZIP64 AND THE MAIN FIXTURE IS NOT. The August 2026
    // G-NAF is 8.83GB uncompressed across 212 entries — past the 4GB boundary
    // where zip64 is mandatory, measured by reading its central directory
    // through yauzl rather than assumed.
    //
    // THE FIRST VERSION OF THIS TEST WAS WORSE THAN NOTHING. It used a fixture
    // built with Python's `force_zip64`, which only affects the LOCAL file
    // header — where sizes are unknown at write time. yauzl reads the local
    // header solely for the name and extra-field lengths, to skip past them; it
    // takes sizes and offsets from the central directory and the EOCD. That
    // fixture's central directory was ordinary (`extraLen: 0`, real sizes) and
    // it had no zip64 EOCD at all, so yauzl's zip64 path never ran and a green
    // test told the next reader the path was covered when it was not.
    //
    // The check that passed it was byte-scanning for 0xFFFFFFFF, which counted
    // five overlapping matches inside a single eight-byte run and reported
    // "genuinely zip64". Hence the assertions below parse RECORDS instead, and
    // live in the test so the fixture cannot regress to a plain archive
    // silently. Built with Info-ZIP `zip -fz`, which forces zip64 into the
    // central directory and the EOCD.
    //
    // WHAT THIS DOES AND DOES NOT EXERCISE: the zip64 EOCD path, and the 64-bit
    // UNCOMPRESSED-size subfield. Compressed sizes and local-header offsets in
    // this fixture are real 32-bit values. That matches the real archive rather
    // than falling short of it — at 1.85GB compressed, its per-entry compressed
    // sizes and offsets also stay under 4GB, so the same subfield is the one
    // that matters there.
    // BOTH ASSERTIONS PARSE RECORDS. An earlier version scanned for the
    // PK\\x06\\x06 byte sequence, which is the same instrument class that produced
    // the false "genuinely zip64" reading in the first place — a signature scan
    // over a file containing deflate streams can match by coincidence. Walk the
    // structure instead: classic EOCD is the last 22 bytes, the zip64 locator
    // the 20 before it, and the locator's 8-byte field says where the zip64
    // EOCD must be.
    const bytes = Buffer.from(ZIP64_B64, 'base64');
    const eocd = bytes.length - 22;
    assert.equal(bytes.readUInt32LE(eocd), 0x06054b50, 'no end-of-central-directory record at the tail');
    assert.equal(
      bytes.readUInt32LE(eocd + 16),
      0xffffffff,
      'the classic EOCD carries a real central-directory offset, so yauzl would never take its zip64 path',
    );
    const locator = eocd - 20;
    assert.equal(bytes.readUInt32LE(locator), 0x07064b50, 'no zip64 end-of-central-directory locator');
    const zip64Eocd = Number(bytes.readBigUInt64LE(locator + 8));
    assert.equal(
      bytes.readUInt32LE(zip64Eocd),
      0x06064b50,
      'the locator does not point at a zip64 end-of-central-directory record — the fixture is not zip64',
    );

    fs.writeFileSync(archive, bytes);
    const out = await unzipFile(archive, extractRoot());
    assert.equal(fs.readFileSync(path.join(out, 'G-NAF/big.psv'), 'utf8'), 'A|B|C\n'.repeat(3));
    assert.equal(fs.readFileSync(path.join(out, 'G-NAF/small.psv'), 'utf8'), 'x|y\n');
  });

  it('refuses an entry that escapes the extract directory', async () => {
    // PATH TRAVERSAL. yauzl validates entry names by default and rejects any
    // containing a `..` segment, a backslash, or an absolute path. The previous
    // unzip-stream implementation had NO such guard — it joined the entry name
    // onto the destination and wrote wherever that landed. So this protection
    // arrived with the swap rather than surviving it.
    //
    // Pinned because it is invisible: it depends on yauzl's `decodeStrings`
    // defaulting to true, and would disappear silently if that were ever set
    // false for encoding reasons, or if a yauzl major relaxed the check. The
    // archive would then extract "successfully" while writing outside the tree.
    fs.writeFileSync(archive, Buffer.from(TRAVERSAL_B64, 'base64'));
    await assert.rejects(() => unzipFile(archive, extractRoot()));
    assert.ok(
      !fs.existsSync(path.join(tmp, 'escaped.psv')),
      'an entry escaped the extract directory',
    );
    assert.ok(
      !fs.existsSync(path.join(extractRoot(), 'aug26_gnaf_pipeseparatedvalue')),
      'a rejected archive must not be renamed into place',
    );
  });

  it('rejects mid-file corruption, not only an unopenable archive', async () => {
    // The corrupt-archive case above fails inside `openZip`, before the entry
    // loop starts — so it never reaches the `zipfile.on('error')` handler, the
    // `fail` closure, or `pipeline`'s error propagation. Those are three of the
    // four error paths and nothing exercised them.
    //
    // Corrupting the compressed BYTES while leaving the central directory
    // intact takes the other route: the archive opens, entries enumerate, and
    // the failure surfaces during decompression — caught by yauzl's
    // `validateEntrySizes` (on by default) or by the inflate itself.
    const good = Buffer.from(FIXTURE_B64, 'base64');
    const corrupt = Buffer.from(good);
    // The local file header for the first entry ends well before byte 200;
    // flipping bytes there damages compressed data, not the trailing central
    // directory that `openZip` reads.
    for (let i = 60; i < 200 && i < corrupt.length - 60; i += 1) corrupt[i] ^= 0xff;
    fs.writeFileSync(archive, corrupt);

    await assert.rejects(() => unzipFile(archive, extractRoot()));
    assert.ok(
      !fs.existsSync(path.join(extractRoot(), 'aug26_gnaf_pipeseparatedvalue')),
      'a mid-extract failure must leave nothing the already-extracted short-circuit would accept',
    );
  });

  it('rejects on a corrupt archive rather than resolving with a partial extract', async () => {
    // A silent partial extract is the dangerous failure: the rename would
    // publish it, and the short-circuit would then treat it as complete
    // forever. Failing loudly is the only safe direction.
    fs.writeFileSync(archive, Buffer.from('this is not a zip file at all', 'utf8'));
    await assert.rejects(() => unzipFile(archive, extractRoot()));
    assert.ok(
      !fs.existsSync(path.join(extractRoot(), 'aug26_gnaf_pipeseparatedvalue')),
      'a failed extract must not leave a directory the short-circuit would accept as complete',
    );
  });
});
