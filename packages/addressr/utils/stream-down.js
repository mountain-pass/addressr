// @jtbd JTBD-203 (Acquire and Refresh the G-NAF Dataset on a Self-Hosted Install)
//
// Clean ESM + dependency injection per the service/gnaf-package-fetch.js
// precedent (P033) — this module previously mixed require(), import and
// module.exports, so it loaded only through Babel and its failure modes could
// not be tested in raw Node ESM.
//
// P070: the old implementation treated "bytes arrived" as "download
// succeeded". It never inspected response.statusCode, so a WAF error page was
// streamed to disk and the promise RESOLVED; service/address-service.js then
// renamed that body over the real destination. Because fetchGnafFile skips the
// download when the destination already exists, a self-hosted operator on a
// persistent target/ volume was left with a poisoned cache that no re-run
// could clear, and the surfaced error named unzip rather than the download.
//
// Every path that could promote an unverified artefact now rejects instead:
// non-success status, redirect, truncation, request error, and write error.

import https from 'node:https';
import nodeFs from 'node:fs';
import pathUtil from 'node:path';
import ProgressBar from 'progress';
import { LOADER_USER_AGENT } from '../service/gnaf-package-fetch.js';

/**
 * Download `url` to `path`, rejecting unless the whole expected body arrives.
 *
 * Resolves on the write stream's `finish` (not the response's `end`) so the
 * caller's rename only ever sees fully-flushed bytes.
 *
 * @param {string} url source URL
 * @param {string} [path] destination path (defaults to the URL's basename)
 * @param {number} [size] expected byte count, used when the response carries
 *   no content-length (the CKAN resource's declared size)
 * @param {object} [deps] dependency injection for testing
 * @param {typeof https} [deps.http] https-shaped client (default: node:https)
 * @param {typeof nodeFs} [deps.fs] fs implementation (default: node:fs)
 * @param {string} [deps.userAgent] User-Agent to send (default: LOADER_USER_AGENT)
 * @returns {Promise<import('node:http').IncomingMessage>}
 */
export function streamDown(url, path, size, deps = {}) {
  const { http = https, fs = nodeFs, userAgent = LOADER_USER_AGENT } = deps;
  const uri = new URL(url);
  const destination = path || pathUtil.basename(uri.pathname);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    let isSettled = false;

    // A failed download must leave nothing behind that a later run could
    // mistake for a good artefact, so drop the partial file on every reject.
    const fail = (error) => {
      if (isSettled) return;
      isSettled = true;
      file.destroy();
      try {
        fs.unlinkSync(destination);
      } catch {
        // Nothing written yet, or already gone — the reject is what matters.
      }
      reject(error);
    };

    file.on('error', fail);

    const request = http.get(uri.toString(), {
      headers: { 'User-Agent': userAgent },
    });
    request.on('error', fail);

    request.on('response', (response) => {
      const { statusCode } = response;

      // Redirects are rejected rather than followed: following them is a
      // larger behaviour surface than this path needs, and silently writing
      // the redirect body is the failure P070 exists to close.
      if (statusCode !== 200) {
        const location = response.headers?.location;
        response.resume(); // drain so the socket can be freed
        fail(
          new Error(
            `G-NAF download failed: ${uri} responded ${statusCode}` +
              (location ? ` (location: ${location})` : ''),
          ),
        );
        return;
      }

      const declared = response.headers['content-length']
        ? Number.parseInt(response.headers['content-length'], 10)
        : size;
      const expected =
        Number.isFinite(declared) && declared > 0 ? declared : undefined;

      let received = 0;
      const bar = expected
        ? new ProgressBar('  downloading [:bar] :rate/bps :percent :etas', {
            complete: '=',
            incomplete: ' ',
            width: 20,
            total: expected,
          })
        : undefined;

      response.on('error', fail);
      response.on('data', (chunk) => {
        received += chunk.length;
        bar?.tick(chunk.length);
      });

      response.pipe(file);

      file.on('finish', () => {
        if (isSettled) return;
        if (expected !== undefined && received !== expected) {
          fail(
            new Error(
              `G-NAF download truncated: ${uri} expected ${expected} bytes, received ${received}`,
            ),
          );
          return;
        }
        isSettled = true;
        console.log(`\n${uri.pathname} downloaded to: ${destination}`);
        resolve(response);
      });
    });
  });
}

export default streamDown;
