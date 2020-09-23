import debug from 'debug';
import {
  getAddress as _getAddress,
  getAddresses as _getAddresses,
} from '../service/address-service';
import { writeJson } from '../utils/writer.js';
var logger = debug('api');

export function getAddress(request, res) {
  logger('IN getAddress');
  var addressId = request.swagger.params['addressId'].value;
  _getAddress(addressId)
    .then(function (response) {
      res.setHeader('link', response.link.toString());
      logger('RESPONSEYYY', JSON.stringify(response, undefined, 2));
      writeJson(res, response.json);
    })
    .catch(function (error) {
      logger('ERROR RESPONSE', error);
      writeJson(res, error);
    });
}

export function getAddresses(request, res) {
  var q = request.swagger.params['q'].value;
  var p = request.swagger.params['p'].value;
  const url = new URL(
    request.url,
    `http://localhost:${process.env.port || 8080}`
  );
  _getAddresses(url.pathname, request.swagger, q, p)
    .then(function (response) {
      res.setHeader('link', response.link.toString());
      res.setHeader('link-template', response.linkTemplate.toString());
      logger('RESPONSEXXX', JSON.stringify(response, undefined, 2));
      writeJson(res, response.json);
    })
    .catch(function (error) {
      writeJson(res, error);
    });
}
