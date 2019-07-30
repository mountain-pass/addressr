import { PendingError } from '@windyroad/cucumber-js-throwables/lib/pending-error';
import template from 'url-template';

export class AddressrDriver {
  async getApiRoot() {
    throw new PendingError();
  }

  async follow(link) {
    throw new PendingError(link);
  }

  async followVarBase(link) {
    throw new PendingError(link);
  }

  async followTemplate(link, params) {
    var t = template.parse(link.uri);
    const expanded = t.expand(params);
    return this.follow(Object.assign({}, link, { uri: expanded }));
  }
}
