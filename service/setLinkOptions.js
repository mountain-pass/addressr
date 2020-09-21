import { encodeUriFragmentIdentifier } from 'json-ptr';

export function setLinkOptions(op, url, linkTemplate) {
  if (op.parameters) {
    const parameters = op.parameters;
    const queryParameters = parameters.filter(
      (parameter) => parameter.in === 'query'
    );
    const linkOptions = {
      rel: op['x-root-rel'],
      uri: `${url}{?${queryParameters.map((qp) => qp.name).join(',')}}`,
      title: op.summary,
      type: 'application/json',
      'var-base': `/api-docs${encodeUriFragmentIdentifier([
        'paths',
        url,
        'get',
        'parameters',
      ])}`,
    };
    linkTemplate.set(linkOptions);
  }
}
