//import debug from 'debug';
import got from 'got';
import LinkHeader from 'http-link-header';
import { JsonPointer } from 'json-ptr';
import { AddressrDriver } from './AddressrDriver';
//var logger = debug('test');

export class AddressrRestDriver extends AddressrDriver {
  constructor(url) {
    super();
    this.url = url;
    this.requester = got.extend({ baseUrl: url });
  }
  async getApiRoot() {
    const resp = await this.requester.get('/');

    return {
      link: LinkHeader.parse(resp.headers.link || ''),
      body: resp.body,
      linkTemplate: LinkHeader.parse(resp.headers['link-template'] || ''),
      headers: resp.headers,
    };
  }

  async getApi(path) {
    const resp = await this.requester.get(path);
    return {
      link: LinkHeader.parse(resp.headers.link || ''),
      body: resp.body,
      linkTemplate: LinkHeader.parse(resp.headers['link-template'] || ''),
      headers: resp.headers,
    };
  }

  async follow(link) {
    const resp = await this.requester.get(link.uri);
    if (link.type === undefined || link.type === 'application/json') {
      resp.json = JSON.parse(resp.body);
    }
    resp.link = LinkHeader.parse(resp.headers.link || '');
    resp.linkTemplate = LinkHeader.parse(resp.headers['link-template'] || '');

    return resp;
  }

  async followVarBase(link) {
    const resp = await this.requester.get(link['var-base']);
    if (link.type === undefined || link.type === 'application/json') {
      resp.json = JSON.parse(resp.body);
    }
    const url = new URL(
      link['var-base'],
      `http://localhost:${process.env.PORT || 8080}`
    );
    resp.json = JsonPointer.create(url.hash).get(resp.json);

    return resp;
  }
}
