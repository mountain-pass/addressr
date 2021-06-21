import debug from 'debug';
import {
  getAddress as _getAddress,
  getAddresses as _getAddresses,
} from '../service/address-service';
import { writeJson } from '../utils/writer.js';
var logger = debug('api');

export function getAddress(request, response) {
  logger('IN getAddress');
  var addressId = request.swagger.params['addressId'].value;
  _getAddress(addressId).then(function (addressResponse) {
    if (addressResponse.statusCode) {
      response.setHeader('Content-Type', 'application/json');
      response.status(addressResponse.statusCode);
      response.json(addressResponse.json);
    } else {
      response.setHeader('link', addressResponse.link.toString());
      writeJson(response, addressResponse.json);
    }
    return;
  });
}

export function getAddresses(request, response) {
  var q = request.swagger.params['q'].value;
  var p = request.swagger.params['p'].value;
  const url = new URL(
    request.url,
    `http://localhost:${process.env.port || 8080}`
  );
  _getAddresses(url.pathname, request.swagger, q, p).then(function (
    addressesResponse
  ) {
    if (addressesResponse.statusCode) {
      response.setHeader('Content-Type', 'application/json');
      response.status(addressesResponse.statusCode);
      response.json(addressesResponse.json);
    } else {
      response.setHeader('link', addressesResponse.link.toString());
      response.setHeader(
        'link-template',
        addressesResponse.linkTemplate.toString()
      );
      writeJson(response, addressesResponse.json);
    }
    return;
  });
}
