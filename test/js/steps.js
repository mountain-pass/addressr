import { Given, Then, When } from 'cucumber';
import debug from 'debug';
import LinkHeader from 'http-link-header';
import {
  clearAddresses,
  loadGnaf,
  mapAddressDetails,
  setAddresses,
} from '../../service/AddressService';

var logger = debug('test');

When('the root api is requested', async function () {
  this.current = await this.driver.getApiRoot();
});

Then('the response will contain the following links:', async function (
  dataTable
) {
  const hashes = dataTable.hashes();
  logger('hashes', hashes);

  const expectedLinks = new LinkHeader();
  hashes.forEach((h) => {
    const link = h;
    if (link.type === '') {
      delete link.type;
    }
    if (link.title === '') {
      delete link.title;
    }
    expectedLinks.set(h);
  });

  expect(this.current.link).to.not.be.undefined;
  //  expect(this.current.link.refs.length).to.equal(hashes.length);

  const expected = expectedLinks.refs;
  const actual = this.current.link.refs;
  logger('expectedLinks', expected);
  logger('actualLinks', actual);
  expect(actual).to.be.an('array');
  expect(actual).to.have.deep.members(expected);
  //   expected.forEach(e => {
  //     logger('finding', e.uri);
  //     const found = actual.find(l => l.uri == e.uri);
  //     expect(found).to.deep.equal(e);
  //   });
});

Then('the response will contain the following link template:', async function (
  dataTable
) {
  const hashes = dataTable.hashes();
  logger('hashes', hashes);

  const expectedLinks = new LinkHeader();
  hashes.forEach((h) => {
    const link = h;
    if (link.type === '') {
      delete link.type;
    }
    if (link.title === '') {
      delete link.title;
    }
    expectedLinks.set(h);
  });

  expect(this.current.linkTemplate).to.not.be.undefined;
  //  expect(this.current.link.refs.length).to.equal(hashes.length);

  const expected = expectedLinks.refs;
  const actual = this.current.linkTemplate.refs;
  logger('expectedLinkTemplates', expected);
  logger('actualLinkTemplates', actual);
  expect(actual).to.be.an('array');
  expect(actual).to.have.deep.members(expected);
  //   expected.forEach(e => {
  //     logger('finding', e.uri);
  //     const found = actual.find(l => l.uri == e.uri);
  //     expect(found).to.deep.equal(e);
  //   });
});

When('the {string} link is followed for {string}', async function (rel, type) {
  this.prev = this.current;
  expect(this.current.link).to.not.be.undefined;
  const link = this.current.link.get('rel', rel).find((l) => l.type === type);
  logger('link', link);
  this.current = await this.driver.follow(link);
});

When('the {string} link is followed', async function (rel) {
  this.prev = this.current;
  expect(this.current.link).to.not.be.undefined;
  const link = this.current.link.get('rel', rel);
  logger('link', link);
  this.current = await this.driver.follow(link[0]);
});

Then('the html docs will be returned', async function () {
  expect(this.current.headers['content-type']).to.equal(
    'text/html; charset=UTF-8'
  );
  expect(this.current.body).to.have.string('<title>Swagger UI</title>');
});

Then('the swagger json docs will be returned', async function () {
  expect(this.current.headers['content-type']).to.equal('application/json');
  expect(this.current.json.info.title).to.equal('Addressr by Mountain Pass');
});

Then('the an address list will be returned', async function () {
  expect(this.current.json).to.be.an('array').that.is.not.empty;
  expect(this.current.json[0]).to.have.a.property('sla');
});

Then('the an empty address list will be returned', async function () {
  expect(this.current.json).to.be.an('array').that.is.empty;
});

Given('an empty address database', async function () {
  delete global.gnafLoaded;
  return clearAddresses();
});

Given('an address database with:', async function (docString) {
  delete global.gnafLoaded;
  return setAddresses(JSON.parse(docString));
});

Then('the returned address list will contain:', async function (docString) {
  const expected = JSON.parse(docString);
  expect(this.current.json).to.be.an('array').that.is.not.empty;
  expect(this.current.json[0]).to.have.a.property('sla');
  expect(this.current.json).to.have.deep.members(expected);
});

//const TWENTY_MINUTES = 60 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

Given(
  'an address database is loaded from gnaf',
  { timeout: ONE_HOUR },
  async function () {
    if (global.gnafLoaded === undefined) {
      global.gnafLoaded = true;
      this.dataDir = await loadGnaf();
    }
  }
);

Then(
  'the returned address list will contain many addresses',
  async function () {
    expect(this.current.json).to.be.an('array').that.is.not.empty;
    expect(this.current.json.length).to.be.greaterThan(5);
  }
);

Given('the following address detail:', async function (docString) {
  this.addressDetails = JSON.parse(docString);
});

Given('the following street locality:', async function (docString) {
  this.streetLocality = JSON.parse(docString);
});

Given('the following locality:', async function (docString) {
  this.locality = JSON.parse(docString);
});

Given('the following context:', async function (docString) {
  this.context = JSON.parse(docString);
});

Then('the address details will map to the following address:', async function (
  docString
) {
  const expected = JSON.parse(docString);
  this.context.streetLocalityIndexed = [];
  this.context.localityIndexed = [];

  this.context.streetLocalityIndexed[
    this.addressDetails.STREET_LOCALITY_PID
  ] = this.streetLocality;
  this.context.localityIndexed[
    this.addressDetails.LOCALITY_PID
  ] = this.locality;
  expect(
    mapAddressDetails(this.addressDetails, this.context, 1, 1)
  ).to.deep.equal(expected);
});

Then(
  'the set of addresses in the previous request will be distinct from the addresses in the last request',
  async function () {
    logger('prev', this.prev);
    logger('current', this.current);
    this.current.json.forEach((a) => {
      expect(this.prev.json).to.not.deep.include(a);
    });
  }
);

Then('the {string} link templates var-base will contain', async function (
  rel,
  expectedParams
) {
  this.prev = this.current;
  expect(this.current.linkTemplate).to.not.be.undefined;
  const link = this.current.linkTemplate.get('rel', rel);
  logger('link', link);
  this.current = await this.driver.followVarBase(link[0]);
  logger(JSON.stringify(this.current.json));
  expect(this.current.json).to.deep.equal(JSON.parse(expectedParams));
});

When('the {string} link template is followed with:', async function (
  rel,
  params
) {
  this.prev = this.current;
  expect(this.current.linkTemplate).to.not.be.undefined;
  const link = this.current.linkTemplate.get('rel', rel);
  this.current = await this.driver.followTemplate(link[0], params.rowsHash());
});

Then('the returned address list will include:', async function (docString) {
  const e = JSON.parse(docString);
  const found = this.current.json.find((a) => {
    return (
      a.sla === e.sla &&
      // SCORE is non-deterministic
      // a.score === e.score &&
      a.links.self.href === e.links.self.href
    );
  });
  expect(found).to.not.be.undefined;
});

Then('the returned address list will NOT include:', async function (docString) {
  const e = JSON.parse(docString);
  const found = this.current.json.find((a) => {
    return (
      a.sla === e.sla &&
      // SCORE is non-deterministic
      // a.score === e.score &&
      a.links.self.href === e.links.self.href
    );
  });
  expect(found).to.be.undefined;
});

When(
  'the {string} link of the first address in the list is followed',
  async function (rel) {
    this.prev = this.current;
    this.current = await this.driver.follow({
      uri: this.current.json[0].links[rel].href,
    });
  }
);

Then('the response will contain:', async function (docString) {
  const e = JSON.parse(docString);
  console.log(JSON.stringify(this.current.json));
  expect(this.current.json).to.deep.equal(e);
});
