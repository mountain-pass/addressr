import debug from 'debug';
import LinkHeader from 'http-link-header';
import { setLinkOptions } from './set-link-options';
var logger = debug('api');

/**
 * API Root
 * returns a list of available APIs within the `Link` headers
 *
 * returns Root
 **/
export async function getApiRoot() {
  /* eslint-disable security/detect-object-injection -- iterating Object.keys() of swagger spec, not user input */
  const paths = Object.keys(globalThis.swaggerDocument.paths).filter(
    (p) =>
      globalThis.swaggerDocument.paths[p].get !== undefined &&
      globalThis.swaggerDocument.paths[p].get['x-root-rel'] !== undefined,
  );

  const link = new LinkHeader();
  for (const p of paths) {
    const op = globalThis.swaggerDocument.paths[p].get;
    if (
      op.parameters &&
      op.parameters.some((parameter) => parameter.required === true)
    ) {
      // skip
    } else {
      link.set({ rel: op['x-root-rel'], uri: p, title: op.summary });
    }
  }
  link.set({
    rel: 'describedby',
    uri: '/docs/',
    title: 'API Docs',
    type: 'text/html',
  });
  link.set({
    rel: 'describedby',
    uri: '/api-docs',
    title: 'API Docs',
    type: 'application/json',
  });

  const linkTemplate = new LinkHeader();
  for (const url of paths) {
    const op = globalThis.swaggerDocument.paths[url].get;
    logger(op);
    setLinkOptions(op, url, linkTemplate);
  }

  /* eslint-enable security/detect-object-injection */

  return { link: link, body: {}, linkTemplate: linkTemplate };
}
