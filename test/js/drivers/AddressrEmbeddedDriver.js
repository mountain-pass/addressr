import { getApiRoot } from '../../../service/DefaultService';
import { AddressrDriver } from './AddressrDriver';

export class AddressrEmbeddedDriver extends AddressrDriver {
  async getApiRoot() {
    return getApiRoot();
  }
}
