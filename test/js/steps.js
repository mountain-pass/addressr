import { Then, When } from 'cucumber';
import debug from 'debug';
import LinkHeader from 'http-link-header';
import { getApiRoot } from '../../service/DefaultService';

var logger = debug('test');

When('the root api is requested', async function() {
  this.root = getApiRoot();
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

  expect(this.root.links).to.not.be.undefined;
  logger(this.root.links);
  expect(this.root.links.refs.length).to.equal(hashes.length);

  logger('expectedLinks', expectedLinks.refs);
  logger('actualLinks', this.root.links.refs);
  expect(this.root.links.refs).to.have.deep.members(expectedLinks.refs);
});
