// import debug from 'debug';
import { getApiRoot as _getApiRoot } from '../service/DefaultService';
import { writeJson } from '../utils/writer.js';
// var logger = debug('api');

export function getApiRoot(request, res) {
  _getApiRoot()
    .then(function (response) {
      res.setHeader('link', response.link.toString());
      res.setHeader('link-template', response.linkTemplate.toString());
      writeJson(res, response.body);
    })
    .catch(function (error) {
      writeJson(res, error.body);
    });
}
