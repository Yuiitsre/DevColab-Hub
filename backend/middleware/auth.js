'use strict';
const crypto = require('crypto');
const { db } = require('../config/database');
const { hashToken } = require('../services/crypto');
const { ROLE_LEVEL } = require('../config/constants');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET too short or missing'); process.exit(1);
}

// Minimal JWT (no external library needed)
function b64url(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
function signJWT(payload, expiresInSeconds=86400) {
  const header = b64url(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const p = { ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+expiresInSeconds };
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [h, b, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest());
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
  if (payload.exp < Math.floor(Date.now()/1000)) throw new Error('Token expired');
  return payload;
}

function makeToken(userId, type='access') {
  const exp = type === 'refresh' ? 7*86400 : 86400;
  return signJWT({ userId, type }, exp);
}

// Express middleware
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error:'Missing token' });
    const token = header.slice(7);
    const payload = verifyJWT(token);
    if (payload.type !== 'access') return res.status(401).json({ error:'Invalid token type' });
    const { data: user, error } = await db.userById(payload.userId);
    if (error || !user) return res.status(401).json({ error:'User not found' });
    req.user = user;
    req.userId = user.id;
    next();
  } catch(e) {
    return res.status(401).json({ error: e.message || 'Unauthorized' });
  }
}

function requireRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLE_LEVEL[req.user?.workspace_role] || 0;
    const required = ROLE_LEVEL[minRole] || 0;
    if (userLevel < required) return res.status(403).json({ error:'Insufficient permissions' });
    next();
  };
}

module.exports = { authenticate, requireRole, makeToken, signJWT, verifyJWT };
