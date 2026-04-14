// import debug from 'debug';
import { getApiRoot as _getApiRoot } from '../service/DefaultService';
import { writeJson } from '../utils/writer.js';
// var logger = debug('api');

export function getApiRoot(request, response_) {
  _getApiRoot()
    .then(function (response) {
      response_.setHeader('link', response.link.toString());
      response_.setHeader('link-template', response.linkTemplate.toString());
      return writeJson(response_, response.body);
    })
    .catch(function (error) {
      writeJson(response_, error.body);
    });
}
