'use strict';
const { ROLE_LEVEL, CAN } = require('../config/constants');
const { db } = require('../config/database');

/**
 * Middleware: require minimum role level on the workspace
 * Usage: router.post('/...', authenticate, requireWorkspaceRole('lead'), handler)
 */
function requireWorkspaceRole(minRole) {
  return async (req, res, next) => {
    try {
      const wid = req.params.wid || req.params.id || req.body.workspaceId;
      if (!wid) return res.status(400).json({ error: 'Workspace ID required' });
      const { data: member } = await db.workspaceMember(wid, req.userId);
      if (!member) return res.status(403).json({ error: 'Not a workspace member' });
      const userLevel = ROLE_LEVEL[member.role] || 0;
      const required = ROLE_LEVEL[minRole] || 0;
      if (userLevel < required) return res.status(403).json({ error: 'Insufficient permissions' });
      req.workspaceRole = member.role;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

/**
 * Check a specific CAN action against user's workspace role
 */
function can(action) {
  return (req, res, next) => {
    const role = req.workspaceRole || req.user?.role || 'viewer';
    if (!CAN[action]?.includes(role)) {
      return res.status(403).json({ error: `Cannot perform action: ${action}` });
    }
    next();
  };
}

module.exports = { requireWorkspaceRole, can };
