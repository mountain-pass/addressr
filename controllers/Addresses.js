import debug from 'debug';
import {
  getAddress as _getAddress,
  getAddresses as _getAddresses,
} from '../service/AddressService';
import { writeJson } from '../utils/writer.js';
var logger = debug('api');

export function getAddress(req, res) {
  logger('IN getAddress');
  var addressId = req.swagger.params['addressId'].value;
  _getAddress(addressId)
    .then(function (response) {
      res.setHeader('link', response.link.toString());
      logger('RESPONSE', JSON.stringify(response, null, 2));
      writeJson(res, response.json);
    })
    .catch(function (response) {
      logger('ERROR RESPONSE', response);
      writeJson(res, response);
    });
}

export function getAddresses(req, res) {
  var q = req.swagger.params['q'].value;
  var p = req.swagger.params['p'].value;
  const url = new URL(req.url, `http://localhost:${process.env.port || 8080}`);
  _getAddresses(url.pathname, req.swagger, q, p)
    .then(function (response) {
      res.setHeader('link', response.link.toString());
      res.setHeader('link-template', response.linkTemplate.toString());
      logger('RESPONSE', JSON.stringify(response, null, 2));
      writeJson(res, response.json);
    })
    .catch(function (response) {
      writeJson(res, response);
    });
}
