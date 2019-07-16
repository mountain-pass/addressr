import { Then, When } from 'cucumber';
import debug from 'debug';
import LinkHeader from 'http-link-header';

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
    expectedLinks.set(h);
  });

  logger('this.current.link', this.current.link);
  expect(this.current.link).to.not.be.undefined;
  expect(this.current.link.refs.length).to.equal(hashes.length);

  logger('expectedLinks', expectedLinks.refs);
  logger('actualLinks', this.current.link.refs);
  expect(this.current.link.refs).to.have.deep.members(expectedLinks.refs);
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
  logger(this.current.json);

  expect(this.current.headers['content-type']).to.equal('application/json');
  expect(this.current.json.info.title).to.equal('Addressr by Mountain Pass');
});
