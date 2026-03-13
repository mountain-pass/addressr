import Template from 'uri-template-lite';

export class AddressrDriver {
  async getApiRoot() {
    return 'pending';
  }

  // eslint-disable-next-line no-unused-vars
  async getApi(path) {
    return 'pending';
  }

  // eslint-disable-next-line no-unused-vars
  async follow(link) {
    return 'pending';
  }

  // eslint-disable-next-line no-unused-vars
  async followVarBase(link) {
    return 'pending';
  }

  async followTemplate(link, parameters) {
    var t = new URI.Template(link.uri);
    const expanded = t.expand(parameters);
    return this.follow(Object.assign({}, link, { uri: expanded }));
  }
}
