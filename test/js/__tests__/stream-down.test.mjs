// @jtbd JTBD-203 (Acquire and Refresh the G-NAF Dataset on a Self-Hosted Install)
//
// Behavioural tests (NOT source-inspection — see P033) for the G-NAF archive
// download helper. See P070.
//
// streamDown previously treated "bytes arrived" as "download succeeded": it
// never inspected response.statusCode, so a 403 error page was streamed to
// disk and the promise RESOLVED. service/address-service.js then renamed that
// body over the real destination, and because fetchGnafFile short-circuits on
// "destination already exists", a self-hosted operator on a persistent
// target/ volume was stuck with a poisoned cache no re-run could clear.
//
// These tests exercise the implementation by importing it and injecting a
// mock http via the DI parameter, asserting on observable behaviour (promise
// rejection, bytes actually on disk, request headers). They do NOT regex-match
// the source.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const URL_UNDER_TEST = 'https://data.gov.au/data/dataset/x/download/g-naf.zip';

// Minimal stand-in for node:https. `get` returns an EventEmitter standing in
// for the ClientRequest; the mock drives it by emitting 'response'.
function mockHttp({ statusCode = 200, headers = {}, body = '', requestError }) {
  const calls = [];
  return {
    calls,
    get(url, options) {
      calls.push({ url, options });
      const request = new EventEmitter();
      queueMicrotask(() => {
        if (requestError) {
          request.emit('error', requestError);
          return;
        }
        const response = Readable.from([Buffer.from(body)]);
        response.statusCode = statusCode;
        response.headers = headers;
        request.emit('response', response);
      });
      return request;
    },
  };
}

describe('utils/stream-down.js — failed and partial downloads must not be promoted (P070)', () => {
  let dir;
  let destination;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'addressr-streamdown-'));
    destination = path.join(dir, 'g-naf.zip');
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('rejects on a non-200 response instead of resolving', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({
      statusCode: 403,
      headers: { 'content-type': 'text/html' },
      body: '<!DOCTYPE html><html>403 Forbidden (CloudFront)</html>',
    });

    await assert.rejects(
      () => streamDown(URL_UNDER_TEST, destination, undefined, { http }),
      /403/,
      'a 403 must reject — resolving is what poisons the cache',
    );
  });

  it('does not leave the error body on disk as a usable archive', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const html = '<!DOCTYPE html><html>403 Forbidden (CloudFront)</html>';
    const http = mockHttp({ statusCode: 403, headers: {}, body: html });

    await assert.rejects(() =>
      streamDown(URL_UNDER_TEST, destination, undefined, { http }),
    );

    // Whether the file is absent or empty, what must never happen is the HTML
    // error page sitting there looking like a downloaded archive.
    const onDisk = fs.existsSync(destination)
      ? await fsp.readFile(destination, 'utf8')
      : '';
    assert.notEqual(
      onDisk,
      html,
      'the error body must never be written as the archive',
    );
  });

  it('rejects a 3xx redirect and names the location (redirects are not followed)', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({
      statusCode: 302,
      headers: { location: 'https://elsewhere.example/g-naf.zip' },
      body: '',
    });

    await assert.rejects(
      () => streamDown(URL_UNDER_TEST, destination, undefined, { http }),
      /elsewhere\.example/,
      'a redirect must reject naming where it pointed, not write the redirect body',
    );
  });

  it('rejects when the received byte count does not match content-length', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({
      statusCode: 200,
      headers: { 'content-length': '9999' },
      body: 'truncated',
    });

    await assert.rejects(
      () => streamDown(URL_UNDER_TEST, destination, undefined, { http }),
      /9999/,
      'a truncated-but-200 download must reject rather than be promoted',
    );
  });

  it('falls back to the caller-supplied size when content-length is absent', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({ statusCode: 200, headers: {}, body: 'short' });

    await assert.rejects(
      () => streamDown(URL_UNDER_TEST, destination, 4096, { http }),
      /4096/,
      'the CKAN-declared size is the fallback integrity check',
    );
  });

  it('resolves only once the bytes are flushed to disk', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const payload = 'PK pretend this is a zip';
    const http = mockHttp({
      statusCode: 200,
      headers: { 'content-length': String(Buffer.byteLength(payload)) },
      body: payload,
    });

    await streamDown(URL_UNDER_TEST, destination, undefined, { http });

    // The caller renames the file immediately after the promise resolves, so
    // every byte must already be readable at that point.
    assert.equal(await fsp.readFile(destination, 'utf8'), payload);
  });

  it('rejects rather than throwing unhandled when the destination cannot be written', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({ statusCode: 200, headers: {}, body: 'data' });
    const unwritable = path.join(dir, 'no-such-dir', 'g-naf.zip');

    await assert.rejects(
      () => streamDown(URL_UNDER_TEST, unwritable, undefined, { http }),
      'a filesystem error must reject the promise, not surface as an unhandled error event',
    );
  });

  it('rejects when the request itself errors', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({ requestError: new Error('ECONNRESET') });

    await assert.rejects(
      () => streamDown(URL_UNDER_TEST, destination, undefined, { http }),
      /ECONNRESET/,
    );
  });

  it('removes the partial file on failure so it cannot accumulate', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const http = mockHttp({
      statusCode: 200,
      headers: { 'content-length': '9999' },
      body: 'truncated',
    });

    await assert.rejects(() =>
      streamDown(URL_UNDER_TEST, destination, undefined, { http }),
    );

    assert.equal(
      fs.existsSync(destination),
      false,
      'a failed multi-GB download must not be left behind',
    );
  });

  it('sends the loader User-Agent on the download request', async () => {
    const { streamDown } = await import('../../../utils/stream-down.js');
    const { LOADER_USER_AGENT } = await import(
      '../../../service/gnaf-package-fetch.js'
    );
    const payload = 'ok';
    const http = mockHttp({
      statusCode: 200,
      headers: { 'content-length': String(payload.length) },
      body: payload,
    });

    await streamDown(URL_UNDER_TEST, destination, undefined, { http });

    assert.equal(http.calls.length, 1);
    assert.equal(
      http.calls[0].options?.headers?.['User-Agent'],
      LOADER_USER_AGENT,
      'the ZIP hop must identify itself the same way the CKAN hop does',
    );
  });
});
