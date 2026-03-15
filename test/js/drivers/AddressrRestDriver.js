//import debug from 'debug';
import LinkHeader from 'http-link-header';
import { JsonPointer } from 'json-ptr';
import { AddressrDriver } from './AddressrDriver';
//var logger = debug('test');

// http-link-header encodes attribute values in toString() but does not
// decode them in parse(), so we need to manually decode var-base.
function decodeLinkTemplateAttributes(linkHeader) {
  for (const reference of linkHeader.refs) {
    if (reference['var-base']) {
      reference['var-base'] = decodeURIComponent(reference['var-base']);
    }
  }
  return linkHeader;
}

async function fetchGet(url) {
  const resp = await fetch(url);
  const body = await resp.text();
  const headers = Object.fromEntries(resp.headers.entries());
  return { body, headers, statusCode: resp.status };
}

export class AddressrRestDriver extends AddressrDriver {
  constructor(url) {
    super();
    this.url = url;
  }
  async getApiRoot() {
    const resp = await fetchGet(`${this.url}/`);

    return {
      link: LinkHeader.parse(resp.headers.link || ''),
      body: resp.body,
      linkTemplate: decodeLinkTemplateAttributes(
        LinkHeader.parse(resp.headers['link-template'] || ''),
      ),
      headers: resp.headers,
    };
  }

  async getApi(path) {
    const resp = await fetchGet(`${this.url}${path}`);
    return {
      link: LinkHeader.parse(resp.headers.link || ''),
      body: resp.body,
      statusCode: resp.statusCode,
      linkTemplate: decodeLinkTemplateAttributes(
        LinkHeader.parse(resp.headers['link-template'] || ''),
      ),
      headers: resp.headers,
    };
  }

  async follow(link) {
    const resp = await fetchGet(`${this.url}${link.uri}`);
    if (link.type === undefined || link.type === 'application/json') {
      resp.json = JSON.parse(resp.body);
    }
    resp.link = LinkHeader.parse(resp.headers.link || '');
    resp.linkTemplate = decodeLinkTemplateAttributes(
      LinkHeader.parse(resp.headers['link-template'] || ''),
    );

    return resp;
  }

  async followVarBase(link) {
    const resp = await fetchGet(`${this.url}${link['var-base']}`);
    if (link.type === undefined || link.type === 'application/json') {
      resp.json = JSON.parse(resp.body);
    }
    const url = new URL(
      link['var-base'],
      `http://localhost:${process.env.PORT || 8080}`,
    );
    resp.json = JsonPointer.create(url.hash).get(resp.json);

    return resp;
  }
}
