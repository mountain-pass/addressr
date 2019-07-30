import debug from 'debug';
import LinkHeader from 'http-link-header';
var logger = debug('api');

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

  const linkTemplate = new LinkHeader();
  paths.forEach(p => {
    const op = global.swaggerDoc.paths[p].get;
    logger(op);
    if (op.parameters) {
      const parameters = op.parameters;
      const queryParams = parameters.filter(param => param.in === 'query');
      const linkOptions = {
        rel: op['x-root-rel'],
        uri: `${p}{?${queryParams.map(qp => qp.name).join(',')}}`,
        title: op.summary,
        'var-base': `/docs/#operations-${op[
          'x-swagger-router-controller'
        ].toLowerCase()}-${op.operationId}`,
      };
      linkTemplate.set(linkOptions);
    }
  });

  return { link: link, body: {}, linkTemplate: linkTemplate };
}
