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
  _getAddress(addressId)
    .then(function (addressResponse) {
      response.setHeader('link', addressResponse.link.toString());
      writeJson(response, addressResponse.json);
      return;
    })
    .catch(function (error) {
      logger('ERROR RESPONSE', error);
      writeJson(response, error);
      throw error;
    });
}

export function getAddresses(request, response) {
  var q = request.swagger.params['q'].value;
  var p = request.swagger.params['p'].value;
  const url = new URL(
    request.url,
    `http://localhost:${process.env.port || 8080}`
  );
  _getAddresses(url.pathname, request.swagger, q, p)
    .then(function (addressesResponse) {
      response.setHeader('link', addressesResponse.link.toString());
      response.setHeader(
        'link-template',
        addressesResponse.linkTemplate.toString()
      );
      writeJson(response, addressesResponse.json);
      return;
    })
    .catch(function (error) {
      writeJson(response, error);
      throw error;
    });
}
