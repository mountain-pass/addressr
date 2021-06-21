/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-non-literal-fs-filename */
import { expect } from 'chai'
import { Given, Then, When } from 'cucumber'
import debug from 'debug'
import LinkHeader from 'http-link-header'
import {
  clearAddresses,
  dropIndex,
  loadGnaf,
  mapAddressDetails,
  setAddresses
} from '../../service/address-service'

var logger = debug('test')
var error = debug('error')

When('the root api is requested', async function () {
  console.log({ driver: this.driver })
  this.current = await this.driver.getApiRoot()
})

When('{string} is requested', async function (path) {
  try {
    this.current = await this.driver.getApi(path)
  } catch (error) {
    console.error({ error: error })
    this.current = error
  }
})

Then('the response will contain the following links:', async function (
  dataTable
) {
  const hashes = dataTable.hashes()
  logger('hashes', hashes)

  const expectedLinks = new LinkHeader()
  hashes.forEach(h => {
    const link = h
    if (link.type === '') {
      delete link.type
    }
    if (link.title === '') {
      delete link.title
    }
    expectedLinks.set(h)
  })
  if (this.current.link) {
    expect(this.current.link).to.not.be.undefined
    //  expect(this.current.link.refs.length).to.equal(hashes.length);

    const expected = expectedLinks.refs
    const actual = this.current.link.refs
    logger('expectedLinks', expected)
    logger('actualLinks', actual)
    expect(actual).to.be.an('array')
    expect(actual).to.have.deep.members(expected)
    //   expected.forEach(e => {
    //     logger('finding', e.uri);
    //     const found = actual.find(l => l.uri == e.uri);
    //     expect(found).to.deep.equal(e);
    //   });
  } else {
    expect(this.current.ops).to.not.be.undefined
    for (const link of hashes) {
      console.log(this.current.ops)
      console.log(`finding ${link.rel}`)
      const op = this.current.ops.find(link.rel)
      expect(op).to.not.be.undefined
      expect(op.uri).to.equal(link.uri)
    }
  }
})

Then('the response will contain the following headers:', async function (
  dataTable
) {
  const headers = dataTable.rowsHash()
  for (const key in headers) {
    expect(this.current.response.headers.get(key)).to.equal(headers[key])
  }
})

Then('the response will contain the following link template:', async function (
  dataTable
) {
  const hashes = dataTable.hashes()
  logger('hashes', hashes)

  const expectedLinks = new LinkHeader()
  hashes.forEach(h => {
    const link = h
    if (link.type === '') {
      delete link.type
    }
    if (link.title === '') {
      delete link.title
    }
    expectedLinks.set(h)
  })

  if (this.current.linkTemplate) {
    expect(this.current.linkTemplate).to.not.be.undefined
    //  expect(this.current.link.refs.length).to.equal(hashes.length);

    const expected = expectedLinks.refs
    const actual = this.current.linkTemplate.refs
    logger('expectedLinkTemplates', expected)
    logger('actualLinkTemplates', actual)
    expect(actual).to.be.an('array')
    expect(actual).to.have.deep.members(expected)
    //   expected.forEach(e => {
    //     logger('finding', e.uri);
    //     const found = actual.find(l => l.uri == e.uri);
    //     expect(found).to.deep.equal(e);
    //   });
  } else {
    expect(this.current.ops).to.not.be.undefined
    for (const link of hashes) {
      console.log(this.current.ops)
      console.log(`finding ${link.rel}`)
      const op = this.current.ops.find(link.rel)
      expect(op).to.not.be.undefined
      expect(op.uri).to.equal(link.uri)
    }
  }
})

When('the {string} link is followed for {string}', async function (
  relationship,
  type
) {
  this.prev = this.current
  expect(this.current.link).to.not.be.undefined
  const link = this.current.link
    .get('rel', relationship)
    .find(l => l.type === type)
  logger('link', link)
  this.current = await this.driver.follow(link)
})

When('the {string} link is followed', async function (relationship) {
  this.prev = this.current
  if (this.current.link) {
    expect(this.current.link).to.not.be.undefined
    const link = this.current.link.get('rel', relationship)
    logger('link', link)
    this.current = await this.driver.follow(link[0])
  } else {
    this.current = await this.current.invoke(relationship)
  }
})

When('the {int}st {string} link is followed', async function (
  nth,
  relationship
) {
  this.prev = this.current
  this.current = await this.current.ops.filter(relationship)[nth - 1].invoke()
})

Then('the html docs will be returned', async function () {
  expect(this.current.headers['content-type']).to.equal(
    'text/html; charset=UTF-8'
  )
  expect(this.current.body).to.have.string('<title>Swagger UI</title>')
})

Then('the swagger json docs will be returned', async function () {
  expect(this.current.headers['content-type']).to.equal('application/json')
  expect(this.current.json.info.title).to.equal('Addressr by Mountain Pass')
})

Then('the an address list will be returned', async function () {
  expect(this.current.json).to.be.an('array').that.is.not.empty
  expect(this.current.json[0]).to.have.a.property('sla')
})

Then('the an empty address list will be returned', async function () {
  expect(this.current.json).to.be.an('array').that.is.empty
})

Given('an empty address database', async function () {
  delete global.gnafLoaded
  return clearAddresses()
})

Given('an address database with:', async function (documentString) {
  delete global.gnafLoaded
  return setAddresses(JSON.parse(documentString))
})

Then('the returned address list will contain:', async function (
  documentString
) {
  const expected = JSON.parse(documentString)
  expect(this.current.json).to.be.an('array').that.is.not.empty
  expect(this.current.json[0]).to.have.a.property('sla')
  expect(this.current.json).to.have.deep.members(expected)
})

//const TWENTY_MINUTES = 60 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000

Given(
  'an address database is loaded from gnaf',
  { timeout: ONE_HOUR },
  async function () {
    if (global.gnafLoaded === undefined) {
      global.gnafLoaded = true
      this.dataDir = await loadGnaf({ refresh: true })
    }
  }
)

Given('an address database is not loaded from gnaf', async function () {
  global.gnafLoaded = undefined
  await dropIndex()
})

Then(
  'the returned address list will contain many addresses',
  async function () {
    if (this.current.json) {
      expect(this.current.json).to.be.an('array').that.is.not.empty
      expect(this.current.json.length).to.be.greaterThan(5)
    } else {
      const body = await this.current.body()
      expect(body).to.be.an('array').that.is.not.empty
      expect(body.length).to.be.greaterThan(5)
    }
  }
)

Given('the following address detail:', async function (documentString) {
  this.addressDetails = JSON.parse(documentString)
})

Given('the following street locality:', async function (documentString) {
  this.streetLocality = JSON.parse(documentString)
})

Given('the following locality:', async function (documentString) {
  this.locality = JSON.parse(documentString)
})

Given('the following context:', async function (documentString) {
  this.context = JSON.parse(documentString)
})

Then('the address details will map to the following address:', async function (
  documentString
) {
  const expected = JSON.parse(documentString)
  this.context.streetLocalityIndexed = []
  this.context.localityIndexed = []

  this.context.streetLocalityIndexed[
    this.addressDetails.STREET_LOCALITY_PID
  ] = this.streetLocality
  this.context.localityIndexed[this.addressDetails.LOCALITY_PID] = this.locality
  expect(
    mapAddressDetails(this.addressDetails, this.context, 1, 1)
  ).to.deep.equal(expected)
})

Then(
  'the set of addresses in the previous request will be distinct from the addresses in the last request',
  async function () {
    logger('prev', this.prev)
    logger('current', this.current)
    this.current.json.forEach(a => {
      expect(this.prev.json).to.not.deep.include(a)
    })
  }
)

Then('the {string} link templates var-base will contain', async function (
  relationship,
  expectedParameters
) {
  this.prev = this.current
  expect(this.current.linkTemplate).to.not.be.undefined
  const link = this.current.linkTemplate.get('rel', relationship)
  logger('link', link)
  this.current = await this.driver.followVarBase(link[0])
  logger(JSON.stringify(this.current.json))
  expect(this.current.json).to.deep.equal(JSON.parse(expectedParameters))
})

When('the {string} link template is followed with:', async function (
  relationship,
  parameters
) {
  this.prev = this.current
  if (this.current.linkTemplate) {
    expect(this.current.linkTemplate).to.not.be.undefined
    const link = this.current.linkTemplate.get('rel', relationship)
    logger('link', link)
    try {
      this.current = await this.driver.followTemplate(
        link[0],
        parameters.rowsHash()
      )
    } catch (error) {
      console.error({ error: error })
      this.current = error
    }
  } else {
    try {
      this.current = await this.current.invoke(
        relationship,
        parameters.rowsHash()
      )
    } catch (error) {
      console.error({ error: error })
      this.current = error
    }
  }
})

Then('the returned address list will include:', async function (
  documentString
) {
  const entity = JSON.parse(documentString)
  const responseBody = this.current.json || (await this.current.body())
  logger('FOUND', JSON.stringify(responseBody, undefined, 2))
  const found = responseBody.find(a => {
    return (
      a.sla === entity.sla &&
      // SCORE is non-deterministic
      // a.score === e.score &&
      (a.pid === entity.pid || a.links.self.href === entity.links.self.href)
    )
  })
  expect(found).to.not.be.undefined
})

Then('the returned address summary will be:', async function (documentString) {
  const entity = JSON.parse(documentString)
  const responseBody = await this.current.body()
  expect(responseBody.sla).to.equal(entity.sla)
  expect(responseBody.pid).to.equal(entity.pid)
})

Then('the returned address will be:', async function (documentString) {
  const entity = JSON.parse(documentString)
  const responseBody = await this.current.body()
  expect(responseBody).to.deep.equal(entity)
})

Then(
  'a {int} response will be received with the following content',
  async function (status, documentString) {
    expect(this.current.response.status).to.equal(status)
    expect(await this.current.body()).to.deep.equal(JSON.parse(documentString))
  }
)

Then('the returned response will have a {int} status code', async function (
  statusCode
) {
  // Write code here that turns the phrase above into concrete actions
  console.log({ current: this.current })
  expect(this.current.statusCode).to.equal(statusCode)
})

Then('the returned address list will NOT include:', async function (
  documentString
) {
  const entity = JSON.parse(documentString)
  const found = this.current.json.find(a => {
    return (
      a.sla === entity.sla &&
      // SCORE is non-deterministic
      // a.score === e.score &&
      a.links.self.href === entity.links.self.href
    )
  })
  expect(found).to.be.undefined
})

When(
  'the {string} link of the first address in the list is followed',
  async function (relationship) {
    try {
      this.prev = this.current
      if (this.current.ops) {
        // for v2 this is actually a 'canonical' link on the first 'item'
        const item = await this.current.ops.filter('item')[0].invoke()
        console.log({ item })
        this.current = await item.invoke('canonical')
        console.log({ canonical: this.current })
      } else {
        this.current = await this.driver.follow({
          uri: this.current.json[0].links[relationship].href
        })
      }
    } catch (err) {
      error({ err })
      throw err
    }
  }
)

Then('the response will contain:', async function (documentString) {
  const entity = JSON.parse(documentString)
  console.log(JSON.stringify(this.current.json))
  if (this.current.json) {
    expect(this.current.json).to.deep.equal(entity)
  } else {
    expect(await this.current.body()).to.deep.equal(entity)
  }
})

When('CORS is set to {string}', async function (string) {
  process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN = string
})

When('CORS is not set', async function () {
  delete process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN
})

Then('the reponse will have a {string} of {string}', async function (
  headerName,
  headerValue
) {
  if (this.current.headers) {
    expect(this.current.headers[headerName.toString()]).to.not.be.undefined
    expect(this.current.headers[headerName.toString()]).to.equal(headerValue)
  } else {
    console.log({ current: this.current.response.headers })
    console.log({ body: await this.current.body() })
    expect(this.current.response.headers.get(headerName.toString())).to.not.be
      .undefined
    expect(this.current.response.headers.get(headerName.toString())).to.equal(
      headerValue
    )
  }
})

Then('the reponse will not have a {string} header', async function (
  headerName
) {
  expect(this.current.headers[headerName.toString()]).to.be.undefined
})
