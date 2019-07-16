//import debug from 'debug';
import {
  getAddress as _getAddress,
  getAddresses as _getAddresses,
} from '../service/AddressService';
import { writeJson } from '../utils/writer.js';
//var logger = debug('api');

export function getAddress(req, res) {
  var addressId = req.swagger.params['addressId'].value;
  _getAddress(addressId)
    .then(function(response) {
      writeJson(res, response);
    })
    .catch(function(response) {
      writeJson(res, response);
    });
}

export function getAddresses(req, res) {
  var q = req.swagger.params['q'].value;
  var p = req.swagger.params['p'].value;
  _getAddresses(req.url, req.swagger, q, p)
    .then(function(response) {
      res.setHeader('link', response.link.toString());
      writeJson(res, response.json);
    })
    .catch(function(response) {
      writeJson(res, response);
    });
}
