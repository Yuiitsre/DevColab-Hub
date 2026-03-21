'use strict';
const crypto = require('crypto');

let ENC_KEY;
function getKey() {
  if (!ENC_KEY) {
    const k = process.env.ENCRYPTION_KEY;
    if (!k || k.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars');
    ENC_KEY = Buffer.from(k, 'hex');
  }
  return ENC_KEY;
}

// AES-256-GCM encrypt (at-rest)
function encrypt(text) {
  if (text === null || text === undefined) return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(data) {
  if (!data) return null;
  const [ivHex, tagHex, encHex] = data.split(':');
  if (!ivHex || !tagHex || !encHex) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex,'hex'));
  decipher.setAuthTag(Buffer.from(tagHex,'hex'));
  return decipher.update(Buffer.from(encHex,'hex')) + decipher.final('utf8');
}

function encryptObj(obj) { return obj ? encrypt(JSON.stringify(obj)) : null; }
function decryptObj(s) {
  const d = decrypt(s);
  try { return d ? JSON.parse(d) : null; } catch { return null; }
}

function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hashToken(t) { return hash(t); }
function randomHex(n=32) { return crypto.randomBytes(n).toString('hex'); }
function randomBase64url(n=16) { return crypto.randomBytes(n).toString('base64url'); }
function uuid() { return crypto.randomUUID(); }
function secureCompare(a,b) {
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}
function deletionReceipt(msgId, userId) {
  const ts = new Date().toISOString();
  const data = `${msgId}:${ts}:${userId}`;
  return { message_id:msgId, deleted_by:userId, deleted_at:ts, receipt_hash: hash(data) };
}

module.exports = {
  encrypt, decrypt, encryptObj, decryptObj,
  hash, hashToken, randomHex, randomBase64url, uuid,
  secureCompare, deletionReceipt,
};
