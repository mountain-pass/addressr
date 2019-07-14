/**
 * API Root
 * returns a list of available APIs within the `Link` headers
 *
 * returns Root
 **/
exports.getApiRoot = function() {
  return new Promise(function(resolve) {
    var examples = {};
    examples['application/json'] = {};
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
};
