import { getApiRoot as _getApiRoot } from '../service/DefaultService';
import { writeJson } from '../utils/writer.js';
export function getApiRoot(req, res) {
  _getApiRoot()
    .then(function(response) {
      writeJson(res, response);
    })
    .catch(function(response) {
      writeJson(res, response);
    });
}
