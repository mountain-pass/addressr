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
      if (addressResponse.statusCode) {
        response.setHeader('Content-Type', 'application/json');
        response.status(addressResponse.statusCode);
        return response.json(addressResponse.json);
      }

      response.setHeader('link', addressResponse.link.toString());
      return writeJson(response, addressResponse.json);
    })
    .catch(function (error_) {
      writeJson(response, error_.body || error_);
    });
}

export function getAddresses(request, response) {
  var q = request.swagger.params['q'].value;
  var p = request.swagger.params['p'].value;
  const url = new URL(
    request.url,
    `http://localhost:${process.env.port || 8080}`,
  );
  _getAddresses(url.pathname, request.swagger, q, p)
    .then(function (addressesResponse) {
      if (addressesResponse.statusCode) {
        response.setHeader('Content-Type', 'application/json');
        response.status(addressesResponse.statusCode);
        return response.json(addressesResponse.json);
      }

      response.setHeader('link', addressesResponse.link.toString());
      response.setHeader(
        'link-template',
        addressesResponse.linkTemplate.toString(),
      );
      return writeJson(response, addressesResponse.json);
    })
    .catch(function (error_) {
      writeJson(response, error_.body || error_);
    });
}
