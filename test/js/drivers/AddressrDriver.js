import { PendingError } from '@windyroad/cucumber-js-throwables/lib/pending-error';

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
}
