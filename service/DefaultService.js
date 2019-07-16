import LinkHeader from 'http-link-header';
// import debug from 'debug';
// var logger = debug('api');

/**
 * API Root
 * returns a list of available APIs within the `Link` headers
 *
 * returns Root
 **/
export async function getApiRoot() {
  const paths = Object.keys(global.swaggerDoc.paths).filter(
    p =>
      global.swaggerDoc.paths[p].get !== undefined &&
      global.swaggerDoc.paths[p].get['x-root-rel'] !== undefined,
  );

  const link = new LinkHeader();
  paths.forEach(p => {
    const op = global.swaggerDoc.paths[p].get;
    link.set({ rel: op['x-root-rel'], uri: p, title: op.summary });
  });
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
  return { link: link, body: {} };
}
