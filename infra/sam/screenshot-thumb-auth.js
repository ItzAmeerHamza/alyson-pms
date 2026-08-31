import crypto from 'crypto';

// Deploy substitutes these via SAM !Sub. Keep in sync with
// backend/src/lib/screenshot-thumb-cdn.ts (HMAC-SHA256 hex of exp + uri).
var SECRET = '__SCREENSHOT_THUMB_CDN_HMAC_SECRET__';
var PREFIX = '/__SCREENSHOT_THUMB_CDN_PREFIX__/';

function deny() {
  return {
    statusCode: 403,
    statusDescription: 'Forbidden',
    headers: { 'content-type': { value: 'text/plain' } },
    body: 'Forbidden',
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  var out = 0;
  for (var i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf(PREFIX) !== 0 || !uri.endsWith('.thumb.jpg')) {
    return deny();
  }
  var expQ = request.querystring.exp;
  var sigQ = request.querystring.sig;
  if (!expQ || !sigQ || !expQ.value || !sigQ.value) {
    return deny();
  }
  var exp = Number(expQ.value);
  if (!(exp > 0) || exp * 1000 < Date.now()) {
    return deny();
  }
  var expected = crypto.createHmac('sha256', SECRET).update(String(exp) + uri).digest('hex');
  if (!timingSafeEqual(expected, sigQ.value)) {
    return deny();
  }
  return request;
}
