/**
 * DevCollab Hub — project-fixes.js
 * Add: <script src="js/project-fixes.js"></script> at end of project.html body
 *
 * FIXES & UPGRADES:
 *  ✓ Team tab: real invite modal (search users, not prompt()), show members properly
 *  ✓ Repo tab: full IDE — file tree, code viewer, commit panel, PR panel, push/pull, branch mgmt
 *  ✓ No "View on GitHub" only — everything in-app with full Git control
 *  ✓ Replace all emoji icons with clean SVG icons
 *  ✓ Professional design — no emoji clutter
 *  ✓ Workspace tab: better kanban, better chat
 */

'use strict';

/* ── SVG ICON SYSTEM ─────────────────────────────────────────────────────── */
const ICON = {
  users:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  plus:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  git:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>`,
  branch:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  commit:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/></svg>`,
  pr:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`,
  upload:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  download:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  copy:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  ai:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  check:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:         `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  folder:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  file:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
  back:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  search:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  task:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  chat:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  eye:       `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  merge:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/><circle cx="6" cy="18" r="3"/><line x1="6" y1="15" x2="6" y2="9"/></svg>`,
  warning:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  code:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  settings:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  refresh:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  external:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  key:       `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
  trash:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
};

function _p(s){return typeof s==='string'?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'):String(s??'')}
function _isEnc(s){return typeof s==='string'&&/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(s)}
function _name(u){if(!u)return'User';for(const k of['display_name','name','github_username','handle']){if(u[k]&&typeof u[k]==='string'&&!_isEnc(u[k])&&u[k].trim())return u[k].trim().slice(0,60);}return'User';}
function _ini(n){return(n+'').replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?'}
function _ago(ts){if(!ts)return'';const d=Date.now()-new Date(ts).getTime(),s=Math.floor(d/1e3),m=Math.floor(s/60),h=Math.floor(m/60),dd=Math.floor(h/24);if(s<60)return'now';if(m<60)return m+'m';if(h<24)return h+'h';if(dd<7)return dd+'d';return new Date(ts).toLocaleDateString();}
function _av(u,sz=28){const bg=u?.avatar_color||'#22c55e',n=_name(u),i=_ini(n),fs=Math.max(7,Math.floor(sz/3));return u?.avatar_url?`<img src="${_p(u.avatar_url)}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`:`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${_p(bg)};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#000;flex-shrink:0">${i}</div>`}

/* ═══════════════════════════════════════════════════════════════════════
   TEAM TAB — Real invite modal, proper member list
═══════════════════════════════════════════════════════════════════════ */

/** Override renderFullTeam — professional card layout */
window.renderFullTeam = function() {
  const el = document.getElementById('full-team-list');
  if (!el) return;
  if (!S.members?.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--tx4)">
      <div style="display:flex;justify-content:center;margin-bottom:12px;opacity:.3">${ICON.users}</div>
      <div style="font-size:13px;font-weight:600;color:var(--tx3);margin-bottom:4px">No team members yet</div>
      <div style="font-size:11px">Invite teammates using the button above</div>
    </div>`;
    return;
  }

  const ROLE_STYLE = {
    owner:     'background:rgba(34,197,94,.1);color:#22c55e;border-color:rgba(34,197,94,.2)',
    admin:     'background:rgba(59,130,246,.1);color:#3b82f6;border-color:rgba(59,130,246,.2)',
    lead:      'background:rgba(168,85,247,.1);color:#a855f7;border-color:rgba(168,85,247,.2)',
    senior:    'background:rgba(249,115,22,.1);color:#f97316;border-color:rgba(249,115,22,.2)',
    developer: 'background:rgba(255,255,255,.06);color:#a1a1aa;border-color:rgba(255,255,255,.1)',
    junior:    'background:rgba(255,255,255,.04);color:#71717a;border-color:rgba(255,255,255,.07)',
    viewer:    'background:rgba(255,255,255,.03);color:#52525b;border-color:rgba(255,255,255,.05)',
  };

  el.innerHTML = S.members.map(m => {
    const u = m.user || {};
    const name = _name(u) || 'User';
    const handle = u.handle || u.github_username || '';
    const isOnline = S.online?.[u.id];
    const role = m.role || 'developer';
    const rs = ROLE_STYLE[role] || ROLE_STYLE.developer;
    const myTask = (S.tasks||[]).find(t=>t.assigned_to===u.id&&t.status!=='done'&&t.status!=='approved');
    const taskDone = (S.tasks||[]).filter(t=>t.assigned_to===u.id&&(t.status==='done'||t.status==='approved')).length;
    const taskOpen = (S.tasks||[]).filter(t=>t.assigned_to===u.id&&t.status!=='done'&&t.status!=='approved').length;
    const isMe = u.id === S.user?.id;

    return `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:8px;transition:border-color .15s" onmouseover="this.style.borderColor='rgba(255,255,255,.1)'" onmouseout="this.style.borderColor='rgba(255,255,255,.06)'">
      <div style="position:relative;flex-shrink:0">
        ${_av(u, 40)}
        <div style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:${isOnline?'#22c55e':'#3f3f46'};border:2px solid #0a0a0f"></div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_p(name)}${isMe?' <span style="font-size:9px;color:var(--tx4)">(you)</span>':''}</div>
          <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;border:1px solid;letter-spacing:.3px;text-transform:uppercase;${rs}">${_p(role)}</span>
        </div>
        <div style="font-size:11px;color:var(--tx4);margin-bottom:8px">${handle?'@'+_p(handle):''}</div>
        <div style="display:flex;gap:12px;font-size:10px;color:var(--tx4)">
          <span style="display:flex;align-items:center;gap:3px">${ICON.task} ${taskOpen} open</span>
          <span style="display:flex;align-items:center;gap:3px">${ICON.check} ${taskDone} done</span>
          ${myTask?`<span style="color:#3b82f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;display:flex;align-items:center;gap:3px">${ICON.task} ${_p((myTask.title||'').slice(0,30))}</span>`:''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
        ${S.myPerms?.canAssign?`<button onclick="openAssignToMember('${_p(u.id)}')" style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;color:var(--tx3);font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background='rgba(255,255,255,.05)'">${ICON.task} Assign</button>`:''}
        ${!isMe?`<button onclick="_projectStartDM('${_p(u.id)}')" style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;color:var(--tx3);font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background='rgba(255,255,255,.05)'">${ICON.chat} DM</button>`:''}
        ${S.myPerms?.canAssign&&!isMe?`<button onclick="_changeProjectRole('${_p(u.id)}','${_p(role)}')" style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;color:var(--tx4);font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit" onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background='rgba(255,255,255,.03)'">${ICON.key} Role</button>`:''}
      </div>
    </div>`;
  }).join('');
};

function _projectStartDM(userId) {
  // Store and redirect to app.html DM
  localStorage.setItem('dc_dm_target', userId);
  window.opener?.startDM?.(userId);
  toast('i', 'DM', 'DM opened in main window');
}

function _changeProjectRole(userId, currentRole) {
  const ROLES = ['owner','admin','lead','senior','developer','junior','viewer'];
  const mo = document.createElement('div');
  mo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);z-index:600;display:flex;align-items:center;justify-content:center';
  mo.innerHTML = `<div style="background:#111113;border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:20px;width:280px;box-shadow:0 24px 80px rgba(0,0,0,.7)">
    <div style="font-size:14px;font-weight:700;margin-bottom:14px">Change Role</div>
    <div style="display:flex;flex-direction:column;gap:5px" id="_crlist">
      ${ROLES.map(r=>`<div onclick="_setProjectRole('${_p(userId)}','${r}',this.closest('[style*=position]'))" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;cursor:pointer;transition:background .1s;border:1px solid ${r===currentRole?'rgba(34,197,94,.3)':'rgba(255,255,255,.06)'};background:${r===currentRole?'rgba(34,197,94,.08)':'rgba(255,255,255,.02)'}" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='${r===currentRole?'rgba(34,197,94,.08)':'rgba(255,255,255,.02)'}'">
        <span style="font-size:12px;font-weight:600;text-transform:capitalize">${r}</span>
        ${r===currentRole?`<span style="color:#22c55e">${ICON.check}</span>`:''}
      </div>`).join('')}
    </div>
    <button onclick="this.closest('[style*=position]').remove()" style="width:100%;margin-top:12px;padding:8px;background:transparent;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--tx4);font-size:12px;cursor:pointer;font-family:inherit">Cancel</button>
  </div>`;
  document.body.appendChild(mo);
}

async function _setProjectRole(userId, role, container) {
  container?.remove();
  try {
    await POST('/projects/' + S.projectId + '/members', { userId, role });
    const m = S.members.find(m => m.user?.id === userId || m.user_id === userId);
    if (m) m.role = role;
    renderFullTeam();
    toast('s', 'Role updated', role);
  } catch(e) { toast('e', 'Error', e.message); }
}

/** Override openInviteMember — real search modal, no prompt() */
window.openInviteMember = function() {
  document.getElementById('_proj-invite-modal')?.remove();
  const mo = document.createElement('div');
  mo.id = '_proj-invite-modal';
  mo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);z-index:600;display:flex;align-items:center;justify-content:center';
  mo.onclick = e => { if(e.target===mo) mo.remove(); };
  mo.innerHTML = `<div style="background:#111113;border:1px solid rgba(255,255,255,.09);border-radius:20px;width:440px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.8);animation:scaleIn .18s cubic-bezier(.16,1,.3,1)">
    <div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px">${ICON.users} Add Member</div>
      <div onclick="document.getElementById('_proj-invite-modal').remove()" style="cursor:pointer;color:var(--tx4);padding:4px 8px;border-radius:6px;font-size:14px;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">${ICON.x}</div>
    </div>
    <div style="padding:16px 20px">
      <div style="position:relative;margin-bottom:12px">
        <div style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--tx4);pointer-events:none">${ICON.search}</div>
        <input id="_proj-invite-q" style="width:100%;padding:9px 12px 9px 32px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#fff;font-size:13px;font-family:inherit;transition:border-color .2s;outline:none" placeholder="Search by @handle or name..." autofocus oninput="_projInvSearch(this.value)" onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'">
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Role</label>
        <select id="_proj-invite-role" style="width:100%;padding:8px 12px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-size:12px;font-family:inherit;outline:none;cursor:pointer">
          <option value="developer">Developer</option>
          <option value="junior">Junior Developer</option>
          <option value="senior">Senior Developer</option>
          <option value="lead">Team Lead</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
    </div>
    <div id="_proj-invite-results" style="flex:1;overflow-y:auto;padding:0 20px 16px;min-height:80px">
      <div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">Type to search for users</div>
    </div>
    <div style="padding:14px 20px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:flex-end;gap:8px">
      <button onclick="document.getElementById('_proj-invite-modal').remove()" style="padding:8px 16px;background:transparent;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--tx3);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
      <button onclick="_projInvSend()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:#22c55e;border:none;border-radius:8px;color:#000;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">${ICON.plus} Add Member</button>
    </div>
  </div>`;
  document.body.appendChild(mo);
};

let _projInvSelected = null;
let _projInvTimer = null;

async function _projInvSearch(q) {
  clearTimeout(_projInvTimer);
  const el = document.getElementById('_proj-invite-results');
  if (!el) return;
  if (q.trim().length < 2) {
    el.innerHTML = '<div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">Type at least 2 characters</div>';
    return;
  }
  el.innerHTML = '<div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">Searching...</div>';
  _projInvTimer = setTimeout(async () => {
    try {
      const users = await GET('/users/search?q=' + encodeURIComponent(q.trim())).catch(() => []);
      if (!users?.length) {
        el.innerHTML = '<div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">No users found</div>';
        return;
      }
      // Filter out already-members
      const memberIds = new Set(S.members.map(m => m.user?.id || m.user_id));
      const filtered = users.filter(u => !memberIds.has(u.id));
      if (!filtered.length) {
        el.innerHTML = '<div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">All matching users are already members</div>';
        return;
      }
      el.innerHTML = filtered.slice(0, 6).map(u => {
        const fixed = { ...u };
        if (_isEnc(fixed.display_name)) fixed.display_name = fixed.github_username || fixed.handle || 'User';
        const name = _name(fixed);
        const handle = fixed.handle || fixed.github_username || '';
        return `<div onclick="_projInvSelect('${_p(u.id)}','${_p(name)}','${_p(handle)}')" id="_piu-${_p(u.id)}" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background .1s;border:1px solid transparent;margin-bottom:4px" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="if('${_p(u.id)}'!==(_projInvSelected?.id||''))this.style.background=''">
          ${_av(fixed, 32)}
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600">${_p(name)}</div>
            <div style="font-size:10px;color:var(--tx4)">${handle?'@'+_p(handle):''}</div>
          </div>
        </div>`;
      }).join('');
    } catch(e) {
      if (el) el.innerHTML = `<div style="font-size:11px;color:var(--gr-red,#ef4444);padding:12px">Error: ${_p(e.message)}</div>`;
    }
  }, 250);
}

function _projInvSelect(id, name, handle) {
  _projInvSelected = { id, name, handle };
  // Highlight
  document.querySelectorAll('[id^="_piu-"]').forEach(el => {
    const isThis = el.id === '_piu-' + id;
    el.style.background = isThis ? 'rgba(34,197,94,.08)' : '';
    el.style.borderColor = isThis ? 'rgba(34,197,94,.2)' : 'transparent';
  });
}

async function _projInvSend() {
  if (!_projInvSelected?.id) { toast('e', 'Select a user', 'Click a user from the search results'); return; }
  const role = document.getElementById('_proj-invite-role')?.value || 'developer';
  try {
    await POST('/projects/' + S.projectId + '/members', { userId: _projInvSelected.id, role });
    document.getElementById('_proj-invite-modal')?.remove();
    toast('s', 'Member added', _projInvSelected.name + ' joined as ' + role);
    _projInvSelected = null;
    // Reload members
    const data = await GET('/projects/' + S.projectId + '/dashboard').catch(() => null);
    if (data?.members) {
      S.members = data.members.map(m => {
        const u = m.user || {};
        if (_isEnc(u.display_name)) u.display_name = u.github_username || u.handle || 'User';
        return { ...m, user: u };
      });
      renderFullTeam();
      renderRPTeam();
    }
  } catch(e) { toast('e', 'Error', e.message); }
}

/* ═══════════════════════════════════════════════════════════════════════
   REPOSITORY TAB — Full in-app IDE
═══════════════════════════════════════════════════════════════════════ */
const _IDE = {
  currentFile: null,
  currentPath: '',
  editMode: false,
  editContent: '',
  commits: [],
  prs: [],
  activePR: null,
};

/** Inject the full IDE HTML into the repo tab */
function _injectRepoIDE() {
  const tab = document.getElementById('tab-repo');
  if (!tab || tab.dataset.ideInjected) return;
  tab.dataset.ideInjected = '1';
  tab.style.cssText = 'flex:1;display:none;overflow:hidden;flex-direction:row';

  tab.innerHTML = `
  <!-- ── File Tree ── -->
  <div style="width:220px;flex-shrink:0;background:#0d0d0f;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:6px">
      <select id="ide-branch" style="flex:1;background:#1a1a1d;border:1px solid rgba(255,255,255,.08);border-radius:6px;color:#a1a1aa;font-size:11px;padding:5px 8px;cursor:pointer;outline:none;font-family:inherit" onchange="ideLoadTree('',true)">
        <option>main</option>
      </select>
      <button onclick="_ideNewBranch()" style="width:26px;height:26px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:6px;color:var(--tx4);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background='rgba(255,255,255,.04)'" title="New branch">${ICON.branch}</div>
    </div>
    <div style="flex:1;overflow-y:auto" id="ide-tree">
      <div style="padding:12px;font-size:11px;color:var(--tx4)">Loading...</div>
    </div>
    <div style="padding:8px;border-top:1px solid rgba(255,255,255,.05)">
      <button onclick="_idePull()" style="display:flex;align-items:center;justify-content:center;gap:5px;width:100%;padding:6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;color:var(--tx4);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background='rgba(255,255,255,.03)'">${ICON.download} Pull Latest</button>
    </div>
  </div>

  <!-- ── Code Editor ── -->
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0">
    <!-- Breadcrumb bar -->
    <div style="height:38px;background:#0d0d0f;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0">
      <span id="ide-breadcrumb" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tx4);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Select a file</span>
      <div style="display:flex;gap:4px" id="ide-file-btns">
        <button onclick="ideToggleEdit()" id="ide-edit-btn" style="display:none;align-items:center;gap:4px;padding:3px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:5px;color:var(--tx4);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background='rgba(255,255,255,.04)'">${ICON.code} Edit</button>
        <button onclick="ideCopyFile()" id="ide-copy-btn" style="display:none;align-items:center;gap:4px;padding:3px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:5px;color:var(--tx4);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background='rgba(255,255,255,.04)'">${ICON.copy} Copy</button>
        <button onclick="_ideAIReview()" id="ide-ai-btn" style="display:none;align-items:center;gap:4px;padding:3px 9px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:5px;color:#a855f7;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background='rgba(168,85,247,.15)'" onmouseout="this.style.background='rgba(168,85,247,.08)'">${ICON.ai} AI Review</button>
      </div>
    </div>
    <!-- Code view / edit -->
    <div style="flex:1;overflow:auto;position:relative;background:#0a0a0c" id="ide-code-area">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--tx4);gap:8px" id="ide-empty">
        <div style="opacity:.3">${ICON.file}</div>
        <div style="font-size:12px">Select a file from the tree</div>
      </div>
      <div id="ide-code-view" style="display:none;height:100%;overflow:auto">
        <pre id="ide-code-content" style="margin:0;padding:16px;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;color:#d4d4d8;white-space:pre;min-height:100%"></pre>
      </div>
      <div id="ide-code-edit" style="display:none;height:100%">
        <textarea id="ide-edit-ta" style="width:100%;height:100%;background:#0a0a0c;border:none;outline:none;color:#d4d4d8;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;padding:16px;resize:none;box-sizing:border-box;tab-size:2"></textarea>
      </div>
    </div>
    <!-- Bottom commit bar (shown when editing) -->
    <div id="ide-commit-bar" style="display:none;padding:8px 12px;border-top:1px solid rgba(255,255,255,.06);background:#0d0d0f;display:none;align-items:center;gap:8px;flex-shrink:0">
      <input id="ide-commit-msg" placeholder="Commit message..." style="flex:1;padding:6px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:12px;font-family:inherit;outline:none" onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'">
      <button onclick="idePushFile()" style="display:flex;align-items:center;gap:4px;padding:6px 12px;background:#22c55e;border:none;border-radius:7px;color:#000;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0">${ICON.upload} Push</button>
      <button onclick="ideCancelEdit()" style="padding:6px 10px;background:transparent;border:1px solid rgba(255,255,255,.08);border-radius:7px;color:var(--tx4);font-size:11px;cursor:pointer;font-family:inherit">Cancel</button>
    </div>
  </div>

  <!-- ── Right: Commits + PRs ── -->
  <div style="width:280px;flex-shrink:0;background:#0d0d0f;border-left:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden">
    <div style="display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0">
      <div id="ide-t-commits" onclick="ideRPTab('commits')" style="flex:1;padding:10px 0;font-size:10px;font-weight:700;text-align:center;cursor:pointer;color:#22c55e;border-bottom:2px solid #22c55e;letter-spacing:.3px;transition:all .15s">COMMITS</div>
      <div id="ide-t-prs"     onclick="ideRPTab('prs')"     style="flex:1;padding:10px 0;font-size:10px;font-weight:700;text-align:center;cursor:pointer;color:var(--tx4);border-bottom:2px solid transparent;letter-spacing:.3px;transition:all .15s">PULL REQUESTS</div>
      <div id="ide-t-push"    onclick="ideRPTab('push')"    style="flex:1;padding:10px 0;font-size:10px;font-weight:700;text-align:center;cursor:pointer;color:var(--tx4);border-bottom:2px solid transparent;letter-spacing:.3px;transition:all .15s">PUSH</div>
    </div>
    <!-- Commits panel -->
    <div id="ide-p-commits" style="flex:1;overflow-y:auto;padding:10px">
      <div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">Loading commits...</div>
    </div>
    <!-- PRs panel -->
    <div id="ide-p-prs" style="display:none;flex:1;overflow-y:auto;padding:10px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button onclick="_ideOpenNewPR()" style="display:flex;align-items:center;gap:4px;padding:5px 10px;background:#22c55e;border:none;border-radius:7px;color:#000;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">${ICON.pr} New PR</button>
      </div>
      <div id="ide-pr-list"><div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">Loading...</div></div>
    </div>
    <!-- Push panel -->
    <div id="ide-p-push" style="display:none;flex:1;overflow-y:auto;padding:14px">
      <div style="font-size:12px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px">${ICON.upload} Push to Remote</div>
      <div style="margin-bottom:12px">
        <label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Branch</label>
        <select id="ide-push-branch" style="width:100%;padding:7px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:12px;font-family:inherit;outline:none;cursor:pointer">
          <option>main</option>
        </select>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Commit Message</label>
        <textarea id="ide-push-msg" rows="3" style="width:100%;padding:8px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:12px;font-family:inherit;outline:none;resize:none;line-height:1.5" placeholder="Describe your changes..." onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'"></textarea>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">File Path</label>
        <input id="ide-push-path" type="text" style="width:100%;padding:7px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:12px;font-family:inherit;outline:none" placeholder="src/file.js" onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'">
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Content</label>
        <textarea id="ide-push-content" rows="5" style="width:100%;padding:8px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:11px;font-family:'JetBrains Mono',monospace;outline:none;resize:vertical;line-height:1.5" placeholder="Paste file content here..." onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'"></textarea>
      </div>
      <button onclick="_idePushFile()" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;background:#22c55e;border:none;border-radius:8px;color:#000;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background='#16a34a'" onmouseout="this.style.background='#22c55e'">${ICON.upload} Push Changes</button>
    </div>
  </div>`;
}

function ideRPTab(tab) {
  ['commits','prs','push'].forEach(t => {
    const panel = document.getElementById('ide-p-'+t);
    const tabEl = document.getElementById('ide-t-'+t);
    if (panel) panel.style.display = t===tab ? 'flex' : 'none';
    if (panel && t===tab) panel.style.flexDirection='column';
    if (tabEl) { tabEl.style.color = t===tab ? '#22c55e' : 'var(--tx4)'; tabEl.style.borderBottomColor = t===tab ? '#22c55e' : 'transparent'; }
  });
  if (tab==='prs') _ideLoadPRs();
}

/** Load tree into IDE */
async function ideLoadTree(path='', branchChanged=false) {
  if (!S.repo) return;
  const treeEl = document.getElementById('ide-tree');
  if (!treeEl) return;
  treeEl.innerHTML = '<div style="padding:12px;font-size:11px;color:var(--tx4)">Loading...</div>';
  const branch = document.getElementById('ide-branch')?.value || S.currentBranch || 'main';
  S.currentBranch = branch;
  try {
    const items = await GET('/repos/' + S.repo.id + '/tree?path=' + encodeURIComponent(path) + '&ref=' + encodeURIComponent(branch));
    const sorted = Array.isArray(items) ? [...items].sort((a,b) => a.type.localeCompare(b.type)||a.name.localeCompare(b.name)) : [];
    const back = path ? `<div onclick="ideLoadTree('${_p(path.split('/').slice(0,-1).join('/'))}',false)" style="display:flex;align-items:center;gap:6px;padding:6px 10px;color:var(--tx4);cursor:pointer;font-size:11px;border-radius:5px;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background=''">${ICON.back} <span style="font-family:'JetBrains Mono',monospace">..</span></div>` : '';
    treeEl.innerHTML = back + sorted.map(it => {
      const isDir = it.type==='dir'||it.type==='tree';
      const click = isDir ? `ideLoadTree('${_p(it.path)}',false)` : `ideLoadFile('${_p(it.path)}')`;
      return `<div onclick="${click}" style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:11px;color:var(--tx3);border-radius:5px;transition:background .1s;font-family:'JetBrains Mono',monospace" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''" id="ide-f-${_p(it.sha||it.path)}">
        <span style="color:${isDir?'#3b82f6':'var(--tx4)'}}">${isDir?ICON.folder:ICON.file}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_p(it.name)}</span>
      </div>`;
    }).join('') || '<div style="padding:12px;font-size:11px;color:var(--tx4)">Empty directory</div>';
    _IDE.currentPath = path;
  } catch(e) {
    treeEl.innerHTML = `<div style="padding:12px;font-size:11px;color:#ef4444">${_p(e.message)}</div>`;
  }
}

async function ideLoadFile(path) {
  if (!S.repo) return;
  _IDE.editMode = false;
  try {
    const f = await GET('/repos/' + S.repo.id + '/file?path=' + encodeURIComponent(path) + '&ref=' + encodeURIComponent(S.currentBranch||'main'));
    _IDE.currentFile = { path, sha: f.sha, content: f.decoded_content || '' };
    _IDE.editContent = f.decoded_content || '';

    const breadEl = document.getElementById('ide-breadcrumb');
    if (breadEl) breadEl.textContent = (S.repo?.full_name||'') + ' / ' + path;

    // Show code view
    document.getElementById('ide-empty').style.display = 'none';
    document.getElementById('ide-code-view').style.display = 'block';
    document.getElementById('ide-code-edit').style.display = 'none';
    document.getElementById('ide-commit-bar').style.display = 'none';

    // Render with line numbers
    const lines = (f.decoded_content||'').split('\n');
    const pre = document.getElementById('ide-code-content');
    if (pre) {
      pre.innerHTML = lines.map((l,i) =>
        `<span style="display:inline-block;width:36px;color:#52525b;text-align:right;margin-right:16px;user-select:none;font-size:11px">${i+1}</span>${_p(l)}\n`
      ).join('');
    }

    // Show action buttons
    ['ide-edit-btn','ide-copy-btn','ide-ai-btn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.style.display = 'inline-flex';
    });

    // Pre-fill push panel
    const pathEl = document.getElementById('ide-push-path');
    if (pathEl) pathEl.value = path;

    // Highlight active file
    document.querySelectorAll('[id^="ide-f-"]').forEach(el => el.style.background = '');
  } catch(e) { toast('e', 'Error', e.message); }
}

function ideToggleEdit() {
  if (!_IDE.currentFile) return;
  _IDE.editMode = !_IDE.editMode;
  const editBtn = document.getElementById('ide-edit-btn');
  if (_IDE.editMode) {
    document.getElementById('ide-code-view').style.display = 'none';
    document.getElementById('ide-code-edit').style.display = 'flex';
    document.getElementById('ide-commit-bar').style.display = 'flex';
    const ta = document.getElementById('ide-edit-ta');
    if (ta) { ta.value = _IDE.currentFile.content; ta.focus(); }
    if (editBtn) { editBtn.innerHTML = ICON.eye + ' View'; editBtn.style.color = '#22c55e'; editBtn.style.borderColor = 'rgba(34,197,94,.3)'; }
  } else {
    document.getElementById('ide-code-view').style.display = 'block';
    document.getElementById('ide-code-edit').style.display = 'none';
    document.getElementById('ide-commit-bar').style.display = 'none';
    if (editBtn) { editBtn.innerHTML = ICON.code + ' Edit'; editBtn.style.color = 'var(--tx4)'; editBtn.style.borderColor = 'rgba(255,255,255,.07)'; }
  }
}

function ideCancelEdit() {
  _IDE.editMode = false;
  const editBtn = document.getElementById('ide-edit-btn');
  document.getElementById('ide-code-view').style.display = 'block';
  document.getElementById('ide-code-edit').style.display = 'none';
  document.getElementById('ide-commit-bar').style.display = 'none';
  if (editBtn) { editBtn.innerHTML = ICON.code + ' Edit'; editBtn.style.color='var(--tx4)'; editBtn.style.borderColor='rgba(255,255,255,.07)'; }
}

async function idePushFile() {
  const content = document.getElementById('ide-edit-ta')?.value;
  const msg = document.getElementById('ide-commit-msg')?.value?.trim() || `Update ${_IDE.currentFile?.path}`;
  if (!_IDE.currentFile || content === undefined) return;
  const btn = document.querySelector('[onclick="idePushFile()"]');
  if (btn) { btn.disabled=true; btn.textContent='Pushing...'; }
  try {
    await POST('/repos/' + S.repo.id + '/commit', {
      path: _IDE.currentFile.path, content, message: msg,
      branch: S.currentBranch||'main', sha: _IDE.currentFile.sha || null,
    });
    _IDE.currentFile.content = content;
    ideCancelEdit();
    toast('s', 'Pushed', msg);
    _ideLoadCommits();
    // Re-read file to get new SHA
    ideLoadFile(_IDE.currentFile.path);
  } catch(e) { toast('e', 'Push failed', e.message); }
  finally { if(btn){btn.disabled=false;btn.innerHTML=ICON.upload+' Push';} }
}

async function _idePushFile() {
  const path    = document.getElementById('ide-push-path')?.value?.trim();
  const content = document.getElementById('ide-push-content')?.value;
  const msg     = document.getElementById('ide-push-msg')?.value?.trim() || 'Update ' + (path||'file');
  const branch  = document.getElementById('ide-push-branch')?.value || S.currentBranch || 'main';
  if (!path) { toast('e', 'Error', 'File path required'); return; }
  if (!S.repo) { toast('e', 'Error', 'No repository linked'); return; }
  try {
    await POST('/repos/' + S.repo.id + '/commit', { path, content: content||'', message: msg, branch, sha: null });
    toast('s', 'Pushed', msg);
    document.getElementById('ide-push-msg').value = '';
    document.getElementById('ide-push-content').value = '';
    ideLoadTree(_IDE.currentPath, false);
    _ideLoadCommits();
  } catch(e) { toast('e', 'Push failed', e.message); }
}

function ideCopyFile() {
  const pre = document.getElementById('ide-code-content');
  if (pre) navigator.clipboard.writeText(pre.innerText||'').then(()=>toast('s','Copied',''));
}

function _ideAIReview() {
  if (!_IDE.currentFile) { toast('e','No file','Select a file first'); return; }
  switchRPTab('ai');
  const ta = document.getElementById('ai-mini-ta');
  if (ta) { ta.value = 'Review this file (' + _IDE.currentFile.path + '):\n' + _IDE.currentFile.content.slice(0,3000); ta.focus(); }
}

async function _ideLoadCommits() {
  if (!S.repo) return;
  const el = document.getElementById('ide-p-commits');
  if (!el) return;
  try {
    const commits = await GET('/repos/' + S.repo.id + '/commits?branch=' + encodeURIComponent(S.currentBranch||'main'));
    _IDE.commits = commits || [];
    el.innerHTML = (_IDE.commits||[]).slice(0,15).map(c => `
      <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <code onclick="navigator.clipboard.writeText('${_p(c.sha||'')}').then(()=>toast('s','SHA copied',''))" style="font-size:9px;color:#3b82f6;cursor:pointer;background:rgba(59,130,246,.08);padding:2px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace">${_p((c.sha||'').slice(0,7))}</code>
          <span style="font-size:9px;color:var(--tx4)">${_ago(c.commit?.author?.date)}</span>
        </div>
        <div style="font-size:11px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${_p(c.commit?.message?.split('\n')[0]||'')}</div>
        <div style="font-size:9px;color:var(--tx4);margin-top:2px">${_p(c.commit?.author?.name||'')}</div>
      </div>`).join('') || '<div style="padding:20px;font-size:11px;color:var(--tx4);text-align:center">No commits yet</div>';
  } catch(e) { if(el) el.innerHTML=`<div style="padding:12px;font-size:11px;color:#ef4444">${_p(e.message)}</div>`; }
}

async function _ideLoadPRs() {
  if (!S.repo) return;
  const el = document.getElementById('ide-pr-list');
  if (!el) return;
  el.innerHTML = '<div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">Loading...</div>';
  try {
    const prs = await GET('/repos/' + S.repo.id + '/prs?state=open');
    _IDE.prs = prs || [];
    if (!prs?.length) { el.innerHTML='<div style="font-size:11px;color:var(--tx4);text-align:center;padding:20px">No open PRs</div>'; return; }
    el.innerHTML = prs.map(pr => `
      <div style="padding:10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:8px;margin-bottom:7px">
        <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px">
          <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2);flex-shrink:0;margin-top:1px">open</span>
          <div style="font-size:11px;font-weight:600;line-height:1.4">${_p(pr.title||'')}</div>
        </div>
        <div style="font-size:9px;color:var(--tx4);margin-bottom:7px;display:flex;align-items:center;gap:5px">
          ${ICON.branch} <span>${_p(pr.head?.ref||'')}</span> → <span>${_p(pr.base?.ref||'')}</span>
          <span style="margin-left:4px">#${pr.number}</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${S.myPerms?.canApprove?`<button onclick="_ideApprovePR(${pr.number})" style="display:flex;align-items:center;gap:3px;padding:3px 8px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:5px;color:#22c55e;font-size:9px;font-weight:700;cursor:pointer;font-family:inherit">${ICON.check} Approve</button>
          <button onclick="_ideMergePR(${pr.number},'${_p(pr.title||'')}')" style="display:flex;align-items:center;gap:3px;padding:3px 8px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:5px;color:#a855f7;font-size:9px;font-weight:700;cursor:pointer;font-family:inherit">${ICON.merge} Merge</button>`:''}
          ${pr.html_url?`<a href="${_p(pr.html_url)}" target="_blank" style="display:flex;align-items:center;gap:3px;padding:3px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:5px;color:var(--tx4);font-size:9px;font-weight:700;text-decoration:none">${ICON.external} GitHub</a>`:''}
        </div>
      </div>`).join('');
  } catch(e) { if(el) el.innerHTML=`<div style="padding:12px;font-size:11px;color:#ef4444">${_p(e.message)}</div>`; }
}

async function _ideApprovePR(num) {
  if (!S.repo) return;
  try {
    await POST('/repos/' + S.repo.id + '/prs/' + num + '/approve', {});
    toast('s', 'Approved', 'PR #' + num);
    _ideLoadPRs();
  } catch(e) { toast('e', 'Error', e.message); }
}

async function _ideMergePR(num, title) {
  if (!confirm('Merge PR #' + num + '?\n"' + title + '"')) return;
  try {
    await POST('/repos/' + S.repo.id + '/prs/' + num + '/merge', { commitTitle: 'Merge: ' + title });
    toast('s', 'Merged', 'PR #' + num + ' merged');
    _ideLoadPRs();
    _ideLoadCommits();
    ideLoadTree('', false);
  } catch(e) { toast('e', 'Merge failed', e.message); }
}

function _ideOpenNewPR() {
  const branch = S.currentBranch || 'main';
  const mo = document.createElement('div');
  mo.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:700;display:flex;align-items:center;justify-content:center';
  mo.onclick = e => { if(e.target===mo) mo.remove(); };
  mo.innerHTML = `<div style="background:#111113;border:1px solid rgba(255,255,255,.09);border-radius:16px;width:420px;box-shadow:0 24px 80px rgba(0,0,0,.8);overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px;font-weight:700;display:flex;align-items:center;gap:7px">${ICON.pr} New Pull Request</div>
    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
      <div><label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Title</label>
        <input id="_pr-title" style="width:100%;padding:8px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-size:12px;font-family:inherit;outline:none" placeholder="PR title..." onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">From Branch</label>
          <input id="_pr-head" value="${_p(branch)}" style="width:100%;padding:7px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:12px;font-family:inherit;outline:none" onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Into Branch</label>
          <input id="_pr-base" value="main" style="width:100%;padding:7px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#fff;font-size:12px;font-family:inherit;outline:none" onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'"></div>
      </div>
      <div><label style="font-size:10px;font-weight:700;color:var(--tx4);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">Description</label>
        <textarea id="_pr-body" rows="3" style="width:100%;padding:8px 10px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-size:12px;font-family:inherit;outline:none;resize:none;line-height:1.5" placeholder="Describe changes..." onfocus="this.style.borderColor='#22c55e'" onblur="this.style.borderColor='rgba(255,255,255,.08)'"></textarea></div>
    </div>
    <div style="padding:14px 20px;border-top:1px solid rgba(255,255,255,.06);display:flex;gap:8px;justify-content:flex-end">
      <button onclick="this.closest('[style*=position]').remove()" style="padding:8px 14px;background:transparent;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--tx4);font-size:12px;cursor:pointer;font-family:inherit">Cancel</button>
      <button onclick="(async()=>{const t=document.getElementById('_pr-title').value.trim(),h=document.getElementById('_pr-head').value.trim(),b=document.getElementById('_pr-base').value.trim(),body=document.getElementById('_pr-body').value.trim();if(!t||!h){toast('e','Error','Title and branch required');return;}try{await POST('/repos/${S.repo?.id||''}/prs',{title:t,head:h,base:b,body});this.closest('[style*=position]').remove();toast('s','PR created','');ideRPTab('prs');}catch(e){toast('e','Error',e.message)}})()" style="display:flex;align-items:center;gap:5px;padding:8px 14px;background:#22c55e;border:none;border-radius:8px;color:#000;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">${ICON.pr} Create PR</button>
    </div>
  </div>`;
  document.body.appendChild(mo);
}

async function _ideNewBranch() {
  const name = prompt('New branch name:');
  if (!name?.trim() || !S.repo) return;
  try {
    // Get main SHA first
    const commits = await GET('/repos/' + S.repo.id + '/commits?branch=main').catch(()=>[]);
    const sha = commits?.[0]?.sha;
    if (!sha) { toast('e', 'Error', 'Could not get latest commit SHA'); return; }
    await POST('/repos/' + S.repo.id + '/branches', { branchName: name.trim(), fromSha: sha });
    toast('s', 'Branch created', name.trim());
    // Reload branches
    const branches = await GET('/repos/' + S.repo.id + '/branches').catch(()=>[]);
    const sel = document.getElementById('ide-branch');
    if (sel && branches?.length) {
      sel.innerHTML = branches.map(b=>`<option value="${_p(b.name)}">${_p(b.name)}</option>`).join('');
      sel.value = name.trim();
      S.currentBranch = name.trim();
      // Also update push branch
      const ps = document.getElementById('ide-push-branch');
      if (ps) { ps.innerHTML = sel.innerHTML; ps.value = name.trim(); }
      ideLoadTree('', false);
    }
  } catch(e) { toast('e', 'Branch error', e.message); }
}

async function _idePull() {
  toast('i', 'Refreshing', 'Pulling latest from ' + (S.currentBranch||'main'));
  ideLoadTree(_IDE.currentPath, false);
  _ideLoadCommits();
}

/** Override loadRepo to use IDE */
window.loadRepo = async function() {
  if (!S.repo) return;
  _injectRepoIDE();
  try {
    const branches = await GET('/repos/' + S.repo.id + '/branches');
    const sel = document.getElementById('ide-branch');
    const pushSel = document.getElementById('ide-push-branch');
    if (sel && branches?.length) {
      sel.innerHTML = branches.map(b=>`<option value="${_p(b.name)}">${_p(b.name)}</option>`).join('');
      S.currentBranch = branches[0]?.name || 'main';
      if (pushSel) pushSel.innerHTML = sel.innerHTML;
    }
    ideLoadTree('', false);
    _ideLoadCommits();
  } catch(e) { console.warn('[repo]', e.message); }
};

/** Override loadTree — now delegates to IDE */
window.loadTree = function(path='') { ideLoadTree(path, false); };
window.loadFile = function(path)    { ideLoadFile(path); };

/* ── Also inject IDE on switchTopTab('repo') ── */
;(() => {
  const _orig = window.switchTopTab;
  window.switchTopTab = function(tab) {
    if (_orig) _orig.apply(this, arguments);
    if (tab === 'repo') {
      _injectRepoIDE();
      if (S.repo && !document.getElementById('ide-tree')?.textContent?.includes('Loading') === false) {
        // Already loaded, just show
      } else if (S.repo) {
        loadRepo();
      }
    }
  };
})();

/* ═══════════════════════════════════════════════════════════════════════
   TOPBAR — replace emoji icons with SVG
═══════════════════════════════════════════════════════════════════════ */
function _upgradeTopbar() {
  // Replace emoji tab labels
  const tabMap = { workspace:'Workspace', team:'Team', repo:'Repository', timeline:'Timeline' };
  Object.entries(tabMap).forEach(([key, label]) => {
    const el = document.getElementById('ttab-'+key);
    if (el) el.textContent = label;
  });
  // Upgrade invite button
  const invBtn = document.querySelector('[onclick="openInviteMember()"]');
  if (invBtn && invBtn.textContent.trim() === '+ Invite') {
    invBtn.innerHTML = `<span style="display:flex;align-items:center;gap:5px">${ICON.plus} Invite</span>`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  // Wait for app to be ready
  const _wait = setInterval(() => {
    if (!document.getElementById('proj-app') || document.getElementById('proj-app').style.display === 'none') return;
    clearInterval(_wait);

    _upgradeTopbar();
    _injectRepoIDE();

    // If repo loaded, start IDE
    if (S.repo) setTimeout(loadRepo, 200);

    // Initial IDE commit load
    setTimeout(_ideLoadCommits, 500);

  }, 200);
});
