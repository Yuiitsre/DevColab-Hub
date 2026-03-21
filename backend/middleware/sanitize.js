'use strict';

function esc(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const [k, v] of Object.entries(req.body)) {
      if (typeof v === 'string') req.body[k] = esc(v.trim());
    }
  }
  next();
}

module.exports = { sanitizeBody, esc };
