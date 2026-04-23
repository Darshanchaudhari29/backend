const crypto = require('crypto');
const { secret } = require('../config/jwt');

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signJwt(payload, expiresInSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const headerPart = base64UrlEncodeJson(header);
  const payloadPart = base64UrlEncodeJson(tokenPayload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${headerPart}.${payloadPart}.${signature}`;
}

function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const valid = crypto.timingSafeEqual(Buffer.from(signaturePart), Buffer.from(expected));
  if (!valid) {
    throw new Error('Invalid token');
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart));
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new Error('Token expired');
  }

  return payload;
}

function expiresInSecondsFromConfig() {
  const value = String(process.env.JWT_EXPIRES_IN || '7d').trim().toLowerCase();
  if (value.endsWith('d')) {
    return Number(value.slice(0, -1) || 7) * 24 * 60 * 60;
  }
  if (value.endsWith('h')) {
    return Number(value.slice(0, -1) || 24) * 60 * 60;
  }
  if (value.endsWith('m')) {
    return Number(value.slice(0, -1) || 60) * 60;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 7 * 24 * 60 * 60;
}

module.exports = {
  expiresInSecondsFromConfig,
  signJwt,
  verifyJwt
};
