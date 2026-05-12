// P036-discovered shared URL builder for OpenSearch clients.
//
// Background: v2.5.4 fixed read-shadow (src/read-shadow.js) to URL-encode
// credentials in the constructed `node` URL because base64-derived passwords
// commonly contain '/', '+', '=', ':', '!' — all URL-reserved characters that
// cause `new Client({ node })` to throw `TypeError: Invalid URL` when
// interpolated directly. The loader path (client/elasticsearch.js) had the
// same bug but never got the same fix; P036's populate-search-domain run hit
// it the first time we rotated to a base64-derived password.
//
// Both code paths now import this single helper. Future regressions of the
// "URL-reserved char in password" class are structurally impossible because
// there is only one URL construction site to keep correct.

function isNonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

export function buildClientNode({ protocol, username, password, host, port }) {
  if (!isNonEmpty(username)) {
    return `${protocol}://${host}:${port}`;
  }
  return `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}
