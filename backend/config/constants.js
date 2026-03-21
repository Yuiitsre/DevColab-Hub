'use strict';

const ROLES = {
  OWNER: 'owner', ADMIN: 'admin', MANAGER: 'manager',
  LEAD: 'lead', SENIOR: 'senior', DEVELOPER: 'developer',
  JUNIOR: 'junior', QA: 'qa', VIEWER: 'viewer'
};

const ROLE_LEVEL = {
  owner:9, admin:8, manager:7, lead:6, senior:5,
  developer:4, junior:3, qa:3, viewer:1
};

const CAN = {
  DELETE_WORKSPACE: ['owner'],
  MANAGE_MEMBERS:   ['owner','admin','manager'],
  CREATE_TEAM:      ['owner','admin','manager'],
  ASSIGN_LEADS:     ['owner','admin','manager'],
  CREATE_PROJECT:   ['owner','admin','manager','lead'],
  CREATE_CHANNEL:   ['owner','admin','manager','lead','senior'],
  ASSIGN_TASKS:     ['owner','admin','manager','lead','senior'],
  PUSH_PROTECTED:   ['owner','admin','manager','lead','senior'],
  APPROVE_PR:       ['owner','admin','manager','lead','senior'],
  MERGE_PR:         ['owner','admin','manager','lead'],
  PUSH_FEATURE:     ['owner','admin','manager','lead','senior','developer','junior'],
  SEND_MESSAGE:     ['owner','admin','manager','lead','senior','developer','junior','qa','viewer'],
  USE_AI:           ['owner','admin','manager','lead','senior','developer','junior','qa'],
};

function hasPermission(userRole, action) {
  return CAN[action]?.includes(userRole) ?? false;
}

const TASK_PRIORITY = { URGENT:'urgent', MEDIUM:'medium', NORMAL:'normal' };
const TASK_STATUS = {
  NOT_STARTED:'not_started', IN_PROGRESS:'in_progress',
  IN_REVIEW:'in_review', APPROVED:'approved', DONE:'done', BLOCKED:'blocked'
};

const TASK_TEMPLATES = {
  urgent: { color:'#ef4444', icon:'🔴', deadlineHours:24, escalationHours:4, minApprovals:1 },
  medium: { color:'#eab308', icon:'🟡', deadlineHours:72, escalationHours:24, minApprovals:2 },
  normal: { color:'#22c55e', icon:'🟢', deadlineHours:168, escalationHours:48, minApprovals:2 },
};

const CHANNEL_TYPE = { PUBLIC:'public', PRIVATE:'private', ANNOUNCEMENT:'announcement', REPO:'repo', TASK:'task' };
const MSG_TYPE = { TEXT:'text', CODE:'code', FILE:'file', EMBED:'embed', SYSTEM:'system', PR:'pr', TASK:'task' };
const NOTIF_TYPE = {
  TASK_ASSIGNED:'task_assigned', TASK_DUE:'task_due', MENTION:'mention',
  DM:'dm', PR_REVIEW:'pr_review', PR_MERGED:'pr_merged', SYSTEM:'system',
  CODE_ASSIGNED:'code_assigned', PR_APPROVED:'pr_approved',
};

module.exports = {
  ROLES, ROLE_LEVEL, CAN, hasPermission,
  TASK_PRIORITY, TASK_STATUS, TASK_TEMPLATES,
  CHANNEL_TYPE, MSG_TYPE, NOTIF_TYPE,
};
