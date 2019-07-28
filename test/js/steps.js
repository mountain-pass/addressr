import { Given, Then, When } from 'cucumber';
import debug from 'debug';
import LinkHeader from 'http-link-header';
import {
  clearAddresses,
  loadGnaf,
  setAddresses,
} from '../../service/AddressService';

var logger = debug('test');

When('the root api is requested', async function() {
  this.current = await this.driver.getApiRoot();
});

Then('the response will contain the following links:', async function(
  dataTable,
) {
  const hashes = dataTable.hashes();
  logger('hashes', hashes);

  const expectedLinks = new LinkHeader();
  hashes.forEach(h => {
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

When('the {string} link is followed for {string}', async function(rel, type) {
  expect(this.current.link).to.not.be.undefined;
  const link = this.current.link.get('rel', rel).find(l => l.type === type);
  logger('link', link);
  this.current = await this.driver.follow(link);
});

When('the {string} link is followed', async function(rel) {
  expect(this.current.link).to.not.be.undefined;
  const link = this.current.link.get('rel', rel);
  logger('link', link);
  this.current = await this.driver.follow(link[0]);
});

Then('the html docs will be returned', async function() {
  expect(this.current.headers['content-type']).to.equal(
    'text/html; charset=UTF-8',
  );
  expect(this.current.body).to.have.string('<title>Swagger UI</title>');
});

Then('the swagger json docs will be returned', async function() {
  expect(this.current.headers['content-type']).to.equal('application/json');
  expect(this.current.json.info.title).to.equal('Addressr by Mountain Pass');
});

Then('the an address list will be returned', async function() {
  expect(this.current.json).to.be.an('array').that.is.not.empty;
  expect(this.current.json[0]).to.have.a.property('sla');
});

Then('the an empty address list will be returned', async function() {
  expect(this.current.json).to.be.an('array').that.is.empty;
});

Given('an empty address database', async function() {
  return clearAddresses();
});

Given('an address database with:', async function(docString) {
  return setAddresses(JSON.parse(docString));
});

Then('the returned address list will contain:', async function(docString) {
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
  async function() {
    this.dataDir = await loadGnaf();
  },
);

Then('the returned address list will contain many addresses', async function() {
  logger('CURRENT', this.current);
  expect(this.current.json).to.be.an('array').that.is.not.empty;
  expect(this.current.json.length).to.be.greaterThan(50);
});
