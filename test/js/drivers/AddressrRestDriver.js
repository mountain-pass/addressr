import debug from 'debug';
import got from 'got';
import LinkHeader from 'http-link-header';
import { AddressrDriver } from './AddressrDriver';
var logger = debug('test');

export class AddressrRestDriver extends AddressrDriver {
  constructor(url) {
    super();
    this.url = url;
    this.requester = got.extend({ baseUrl: url });
  }
  async getApiRoot() {
    const resp = await this.requester.get('/');
    logger('headers', resp.headers);
    logger('body', resp.body);
    return { link: LinkHeader.parse(resp.headers.link), body: resp.body };
  }

  async follow(link) {
    const resp = await this.requester.get(link.uri);
    if (link.type === undefined || link.type === 'application/json') {
      resp.json = JSON.parse(resp.body);
    }
    resp.link = LinkHeader.parse(resp.headers.link || '');
    return resp;
  }
}
