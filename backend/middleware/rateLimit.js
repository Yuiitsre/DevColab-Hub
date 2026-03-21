'use strict';
const rateLimit = require('express-rate-limit');

const api = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const auth = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });
const ai = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'AI rate limit exceeded' } });

module.exports = { api, auth, ai };
