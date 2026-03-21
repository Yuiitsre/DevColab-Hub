'use strict';
const { db } = require('../config/database');
const { uuid } = require('../services/crypto');

async function logAudit({ action, actorId, resourceId, metadata, ip }) {
  try {
    await db.audit({
      id: uuid(),
      action,
      actor_id: actorId || null,
      resource_id: resourceId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ip_address: ip || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

function auditMiddleware(action) {
  return async (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        logAudit({ action, actorId: req.userId, resourceId: req.params?.id, ip: req.ip });
      }
    });
    next();
  };
}

module.exports = { logAudit, auditMiddleware };
