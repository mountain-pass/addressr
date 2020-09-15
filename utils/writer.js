var ResponsePayload = function (code, payload) {
  this.code = code;
  this.payload = payload;
};

exports.respondWithCode = function (code, payload) {
  return new ResponsePayload(code, payload);
};

var writeJson = (exports.writeJson = function (response, argument1, argument2) {
  var code;
  var payload;

  if (argument1 && argument1 instanceof ResponsePayload) {
    writeJson(response, argument1.payload, argument1.code);
    return;
  }

  if (argument2 && Number.isInteger(argument2)) {
    code = argument2;
  } else {
    if (argument1 && Number.isInteger(argument1)) {
      code = argument1;
    }
  }
  if (code && argument1) {
    payload = argument1;
  } else if (argument1) {
    payload = argument1;
  }

  if (!code) {
    // if no response code given, we default to 200
    code = 200;
  }
  // if (typeof payload === 'object') {
  //   payload = JSON.stringify(payload, null, 2);
  // }
  response.status(code);
  response.setHeader('Content-Type', 'application/json');
  response.json(payload);
});
