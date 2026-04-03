//import debug from 'debug';
//var logger = debug('test');
import { waychaser } from '@mountainpass/waychaser';

export class AddressrRest2Driver {
  constructor(url) {
    this.url = url;
  }
  async getApiRoot() {
    return waychaser(this.url);
  }

  // async getApi (path) {
  //   const resp = await this.requester.get(path)
  //   return {
  //     link: LinkHeader.parse(resp.headers.link || ''),
  //     body: resp.body,
  //     linkTemplate: LinkHeader.parse(resp.headers['link-template'] || ''),
  //     headers: resp.headers
  //   }
  // }

  // async follow (link) {
  //   const resp = await this.requester.get(link.uri)
  //   if (link.type === undefined || link.type === 'application/json') {
  //     resp.json = JSON.parse(resp.body)
  //   }
  //   resp.link = LinkHeader.parse(resp.headers.link || '')
  //   resp.linkTemplate = LinkHeader.parse(resp.headers['link-template'] || '')

  //   return resp
  // }

  // async followVarBase (link) {
  //   const resp = await this.requester.get(link['var-base'])
  //   if (link.type === undefined || link.type === 'application/json') {
  //     resp.json = JSON.parse(resp.body)
  //   }
  //   const url = new URL(
  //     link['var-base'],
  //     `http://localhost:${process.env.PORT || 8080}`
  //   )
  //   resp.json = JsonPointer.create(url.hash).get(resp.json)

  //   return resp
  // }
}
