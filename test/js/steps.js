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
