import { Then, When } from 'cucumber';
import debug from 'debug';
import LinkHeader from 'http-link-header';

var logger = debug('test');

When('the root api is requested', async function() {
  this.root = await this.driver.getApiRoot();
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

  logger('this.root.link', this.root.link);
  expect(this.root.link).to.not.be.undefined;
  expect(this.root.link.refs.length).to.equal(hashes.length);

  logger('expectedLinks', expectedLinks.refs);
  logger('actualLinks', this.root.link.refs);
  expect(this.root.link.refs).to.have.deep.members(expectedLinks.refs);
});

When('the {string} link is followed for {string}', async function(rel, type) {
  expect(this.root.link).to.not.be.undefined;
  const link = this.root.link.get('rel', rel).find(l => l.type === type);
  logger('link', link);
  this.followed = await this.driver.follow(link);
});

Then('the html docs will be returned', async function() {
  expect(this.followed.headers['content-type']).to.equal(
    'text/html; charset=UTF-8',
  );
  expect(this.followed.body).to.have.string('<title>Swagger UI</title>');
});

Then('the swagger json docs will be returned', async function() {
  logger(this.followed.json);

  expect(this.followed.headers['content-type']).to.equal('application/json');
  expect(this.followed.json.info.title).to.equal('Addressr by Mountain Pass');
});
