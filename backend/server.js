'use strict';
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const compression= require('compression');
const rateLimit  = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto     = require('crypto');

const { db, testConnection } = require('./config/database');
const { authenticate }       = require('./middleware/auth');
const { encrypt, decrypt, uuid } = require('./services/crypto');
const gh         = require('./services/github');
const gemini     = require('./services/gemini');
const { ROLES, TASK_PRIORITY, TASK_STATUS, TASK_TEMPLATES, NOTIF_TYPE, hasPermission } = require('./config/constants');
const { makeToken, verifyJWT } = require('./middleware/auth');

const PORT         = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const NODE_ENV     = process.env.NODE_ENV || 'development';

const app    = express();
const server = http.createServer(app);

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy:false, crossOriginEmbedderPolicy:false }));
app.use(cors({ origin: [FRONTEND_URL,'http://localhost:3000','http://127.0.0.1:5500'], credentials:true, methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(compression());
app.use(express.json({ limit:'10mb' }));
app.use(express.urlencoded({ extended:true }));
app.use(cookieParser());

const limiter    = rateLimit({ windowMs:15*60*1000, max:500 });
const authLimiter= rateLimit({ windowMs:15*60*1000, max:20 });
const aiLimiter  = rateLimit({ windowMs:60*1000,    max:30 });
app.use('/api/', limiter);

// ── Helpers ───────────────────────────────────────────────────────────────────
function ok(res, data, status=200) { res.status(status).json({ success:true, data }); }
function fail(res, msg, status=400) { res.status(status).json({ success:false, error:msg }); }
function esc(s) { if(typeof s!=='string')return s; return s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
function safeStr(s,max=500) { return typeof s==='string' ? esc(s.trim()).slice(0,max) : ''; }

// Safe user (no github_access_token)
function safeUser(u) {
  if (!u) return null;
  const { github_access_token, ...rest } = u;
  return rest;
}

// Socket.io
const io = new Server(server, {
  cors: { origin: NODE_ENV === 'production' ? FRONTEND_URL : '*', methods:['GET','POST'] },
  pingTimeout:60000, pingInterval:25000,
});

// Socket auth
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    const payload = verifyJWT(token);
    const { data:user } = await db.userById(payload.userId);
    if (!user) return next(new Error('User not found'));
    socket.user = safeUser(user);
    socket.userId = user.id;
    // Store raw token for GitHub calls
    socket.githubToken = user.github_access_token;
    next();
  } catch(e) { next(new Error('Auth failed')); }
});

const onlineUsers = new Map(); // userId → Set<socketId>

io.on('connection', async (socket) => {
  const { userId, user } = socket;
  console.log(`[+] ${user.handle} connected`);

  // Track presence
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  await db.updateUser(userId, { status:'online' });
  io.emit('presence', { userId, status:'online' });

  // Join all workspace channels
  try {
    const { data:wms } = await db.workspacesByUser(userId);
    for (const ws of wms||[]) {
      const { data:channels } = await db.channelsByWorkspace(ws.id);
      for (const ch of channels||[]) socket.join(`ch:${ch.id}`);
      socket.join(`ws:${ws.id}`);
    }
  } catch(e) {}

  socket.emit('connected', { user: safeUser(user) });

  // ── SEND MESSAGE ──
  socket.on('msg:send', async ({ channelId, content, type='text', code, metadata }) => {
    try {
      if (!content && !code) return;
      const enc = content ? encrypt(safeStr(content, 5000)) : null;
      const metaEnc = metadata ? encrypt(JSON.stringify(metadata)) : null;
      const msg = {
        id: uuid(), channel_id:channelId, user_id:userId,
        content_encrypted:enc, type, metadata:metaEnc,
        code_lang:code?.lang||null, code_body:code?.body?encrypt(code.body):null,
        created_at:new Date().toISOString(), deleted:false, edited:false,
      };
      const { data:saved } = await db.createMessage(msg);
      const out = formatMsg(saved);
      io.to(`ch:${channelId}`).emit('msg:new', out);
    } catch(e) { socket.emit('error', { message:e.message }); }
  });

  // ── EDIT MESSAGE ──
  socket.on('msg:edit', async ({ messageId, content }) => {
    try {
      const { data:msg } = await db.messageById(messageId);
      if (!msg || msg.user_id !== userId) return socket.emit('error',{message:'Not your message'});
      await db.updateMessage(messageId, { content_encrypted: encrypt(safeStr(content,5000)) });
      io.to(`ch:${msg.channel_id}`).emit('msg:updated', { messageId, content:safeStr(content,5000), edited:true });
    } catch(e) { socket.emit('error',{message:e.message}); }
  });

  // ── DELETE MESSAGE ──
  socket.on('msg:delete', async ({ messageId, forEveryone=false }) => {
    try {
      const { data:msg } = await db.messageById(messageId);
      if (!msg) return;
      if (msg.user_id !== userId) return socket.emit('error',{message:'Not your message'});
      const receipt = require('./services/crypto').deletionReceipt(messageId, userId);
      await db.softDeleteMessage(messageId, userId);
      await db.audit({ id:uuid(), action:'message_deleted', actor_id:userId, resource_id:messageId, metadata:JSON.stringify(receipt), created_at:new Date().toISOString() });
      io.to(`ch:${msg.channel_id}`).emit('msg:deleted', { messageId, receipt });
    } catch(e) { socket.emit('error',{message:e.message}); }
  });

  // ── REACT ──
  socket.on('msg:react', async ({ messageId, emoji }) => {
    try {
      const { data:msg } = await db.messageById(messageId);
      if (!msg) return;
      const { data:existing } = await db.supabase().from('message_reactions').select('id').eq('message_id',messageId).eq('user_id',userId).eq('emoji',emoji).single();
      if (existing) { await db.removeReaction(messageId,userId,emoji); }
      else { await db.addReaction(messageId,userId,emoji); }
      const { data:all } = await db.reactions(messageId);
      io.to(`ch:${msg.channel_id}`).emit('msg:reactions', { messageId, reactions: groupReactions(all) });
    } catch(e) {}
  });

  // ── TYPING ──
  socket.on('typing:start', ({ channelId }) => socket.to(`ch:${channelId}`).emit('typing:user', { userId, username:user.handle }));
  socket.on('typing:stop',  ({ channelId }) => socket.to(`ch:${channelId}`).emit('typing:off',  { userId }));

  // ── DM ──
  socket.on('dm:send', async ({ toUserId, content }) => {
    try {
      const { data:room } = await db.createDMRoom(userId, toUserId);
      const enc = encrypt(safeStr(content, 5000));
      const dm = { id:uuid(), room_id:room.id, from_user:userId, content_encrypted:enc, created_at:new Date().toISOString() };
      const { data:saved } = await db.createDM(dm);
      // notify both
      const out = { id:saved.id, roomId:room.id, fromUserId:userId, content:safeStr(content,5000), ts:saved.created_at };
      const recipientSockets = onlineUsers.get(toUserId);
      if (recipientSockets) recipientSockets.forEach(sid => io.to(sid).emit('dm:new', out));
      socket.emit('dm:new', out);
      // notification
      await db.createNotif({ id:uuid(), user_id:toUserId, type:NOTIF_TYPE.DM, title:encrypt(`DM from @${user.handle}`), body:encrypt(safeStr(content,100)), read:false, data:JSON.stringify({fromUserId:userId}), created_at:new Date().toISOString() });
    } catch(e) { socket.emit('error',{message:e.message}); }
  });

  // ── TASK UPDATE ──
  socket.on('task:status', async ({ taskId, status }) => {
    try {
      const { data:task } = await db.taskById(taskId);
      if (!task) return;
      await db.updateTask(taskId, { status });
      io.to(`ws:${task.workspace_id||''}`).emit('task:updated', { taskId, status, updatedBy:userId });
    } catch(e) {}
  });

  // ── JOIN CHANNEL ──
  socket.on('channel:join', async ({ channelId }) => {
    socket.join(`ch:${channelId}`);
    try {
      const { data:msgs } = await db.messagesByChannel(channelId, 50);
      socket.emit('channel:history', { channelId, messages: (msgs||[]).reverse().map(formatMsg) });
    } catch(e) {}
  });

  // ── DISCONNECT ──
  socket.on('disconnect', async () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) { sockets.delete(socket.id); if(!sockets.size) onlineUsers.delete(userId); }
    if (!onlineUsers.has(userId)) {
      await db.updateUser(userId, { status:'offline' }).catch(()=>{});
      io.emit('presence', { userId, status:'offline' });
    }
    console.log(`[-] ${user.handle} disconnected`);
  });
});

function formatMsg(m) {
  if (!m) return null;
  const content = m.content_encrypted ? (() => { try { return decrypt(m.content_encrypted); } catch { return '[encrypted]'; } })() : null;
  const codeBody = m.code_body ? (() => { try { return decrypt(m.code_body); } catch { return null; } })() : null;
  return {
    id:m.id, channelId:m.channel_id, userId:m.user_id,
    user:m.user, content, type:m.type,
    code: m.code_lang ? { lang:m.code_lang, body:codeBody } : null,
    edited:m.edited, deleted:m.deleted,
    reactions:{}, ts:m.created_at,
  };
}
function groupReactions(arr) {
  const r = {};
  for (const x of arr||[]) { if(!r[x.emoji])r[x.emoji]=[]; r[x.emoji].push(x.user_id); }
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// HEALTH
app.get('/health', (req,res) => res.json({ status:'ok', version:'2.0.0', env:NODE_ENV }));

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.get('/api/auth/github', authLimiter, (req,res) => {
  const state = require('./services/crypto').randomBase64url();
  res.cookie('oauth_state', state, { httpOnly:true, secure:NODE_ENV==='production', maxAge:600000, sameSite:'lax' });
  const url = `https://github.com/login/oauth/authorize?` +
    `client_id=${process.env.GITHUB_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.GITHUB_CALLBACK_URL)}&` +
    `scope=${encodeURIComponent('read:user user:email repo')}&` +
    `state=${state}`;
  res.redirect(url);
});

app.get('/api/auth/github/callback', authLimiter, async (req,res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${FRONTEND_URL}?error=no_code`);
    res.clearCookie('oauth_state');

    const accessToken = await gh.exchangeCode(code);
    const ghUser = await gh.getAuthUser(accessToken);
    if (!ghUser.id) return res.redirect(`${FRONTEND_URL}?error=user_fetch_failed`);

    let { data:user } = await db.userByGithubId(ghUser.id);
    const isNew = !user;

    // generate unique handle from github login
    const baseHandle = ghUser.login.toLowerCase().replace(/[^a-z0-9_]/g,'');
    let finalHandle = baseHandle;
    // ensure handle is unique
    let attempt = 0;
    while (true) {
      const { data: existing } = await db.userByHandle(finalHandle);
      if (!existing) break;
      attempt++;
      finalHandle = `${baseHandle}${attempt}`;
    }

    if (isNew) {
      const newUser = {
        id: uuid(), github_id: String(ghUser.id),
        handle: finalHandle,
        display_name: encrypt(ghUser.name || ghUser.login),
        avatar_url: ghUser.avatar_url,
        github_username: ghUser.login,
        github_access_token: encrypt(accessToken),
        bio: ghUser.bio ? encrypt(ghUser.bio) : null,
        status: 'online', setup_complete: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const { data:created, error:ce } = await db.createUser(newUser);
      if (ce) return res.redirect(`${FRONTEND_URL}?error=user_create_failed`);
      user = created;
    } else {
      // refresh token
      await db.updateUser(user.id, { github_access_token:encrypt(accessToken), status:'online' });
      user.github_access_token = accessToken;
    }

    const token = makeToken(user.id, 'access');
    const refreshTok = makeToken(user.id, 'refresh');

    // Store session
    await db.createSession({
      id:uuid(), user_id:user.id,
      token_hash: require('./services/crypto').hashToken(token),
      refresh_hash: require('./services/crypto').hashToken(refreshTok),
      created_at:new Date().toISOString(),
      expires_at: new Date(Date.now()+86400000).toISOString(),
    });

    const q = new URLSearchParams({ token, refresh:refreshTok, new_user:isNew?'1':'0' });
    res.redirect(`${FRONTEND_URL}?${q.toString()}`);
  } catch(e) {
    console.error('OAuth error:', e);
    res.redirect(`${FRONTEND_URL}?error=${encodeURIComponent(e.message)}`);
  }
});

app.post('/api/auth/logout', authenticate, async (req,res) => {
  try {
    const token = req.headers.authorization?.slice(7);
    if (token) await db.supabase().from('user_sessions').delete().eq('token_hash', require('./services/crypto').hashToken(token));
    await db.updateUser(req.userId, { status:'offline' });
    ok(res, { message:'Logged out' });
  } catch(e) { fail(res, e.message); }
});

app.get('/api/auth/me', authenticate, async (req,res) => {
  const u = safeUser(req.user);
  // decrypt display fields
  try { u.display_name = req.user.display_name ? decrypt(req.user.display_name) : u.github_username; } catch {}
  try { u.bio = req.user.bio ? decrypt(req.user.bio) : null; } catch {}
  ok(res, u);
});

// ── USERS ─────────────────────────────────────────────────────────────────────
app.patch('/api/users/me', authenticate, async (req,res) => {
  try {
    const { display_name, role, bio, status, avatar_color, setup_complete } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (display_name) updates.display_name = encrypt(safeStr(display_name,100));
    if (role) updates.role = safeStr(role,50);
    if (bio !== undefined) updates.bio = bio ? encrypt(safeStr(bio,500)) : null;
    if (status) updates.status = status;
    if (avatar_color) updates.avatar_color = safeStr(avatar_color,20);
    if (setup_complete !== undefined) updates.setup_complete = Boolean(setup_complete);
    const { data, error } = await db.updateUser(req.userId, updates);
    if (error) return fail(res, error.message);
    const u = safeUser(data);
    try { u.display_name = data.display_name ? decrypt(data.display_name) : null; } catch {}
    ok(res, u);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/users/search', authenticate, async (req,res) => {
  const q = (req.query.q||'').trim();
  if (q.length < 2) return ok(res, []);
  const { data } = await db.searchUsers(q, 20);
  ok(res, data||[]);
});

app.get('/api/users/:handle', authenticate, async (req,res) => {
  const { data, error } = await db.userByHandle(req.params.handle.toLowerCase());
  if (error || !data) return fail(res, 'User not found', 404);
  const u = safeUser(data);
  try { u.display_name = data.display_name ? decrypt(data.display_name) : data.github_username; } catch {}
  try { u.bio = data.bio ? decrypt(data.bio) : null; } catch {}
  ok(res, u);
});

// ── WORKSPACES ────────────────────────────────────────────────────────────────
app.get('/api/workspaces', authenticate, async (req,res) => {
  const { data } = await db.workspacesByUser(req.userId);
  ok(res, data||[]);
});

app.post('/api/workspaces', authenticate, async (req,res) => {
  try {
    const { name, description } = req.body;
    if (!name) return fail(res,'Name required');
    const slug = safeStr(name,50).toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-');
    const ws = {
      id:uuid(), name:encrypt(safeStr(name,100)),
      slug:`${slug}-${require('./services/crypto').randomHex(3)}`,
      description: description?encrypt(safeStr(description,500)):null,
      owner_id:req.userId, created_at:new Date().toISOString(),
    };
    const { data:created, error } = await db.createWorkspace(ws);
    if (error) return fail(res, error.message);
    await db.addWorkspaceMember(created.id, req.userId, ROLES.OWNER);
    // Create default channels
    for (const [name,desc] of [['general','Main discussion'],['github-feed','Repository activity'],['ai-help','AI coding assistant']]) {
      await db.createChannel({ id:uuid(), workspace_id:created.id, name, description:desc, type:'public', created_by:req.userId, archived:false, created_at:new Date().toISOString() });
    }
    ok(res, { ...created, name:safeStr(name,100) }, 201);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/workspaces/:id', authenticate, async (req,res) => {
  const { data, error } = await db.workspaceById(req.params.id);
  if (error || !data) return fail(res,'Not found',404);
  const out = { ...data };
  try { out.name = data.name ? decrypt(data.name) : null; } catch {}
  try { out.description = data.description ? decrypt(data.description) : null; } catch {}
  ok(res, out);
});

app.post('/api/workspaces/:id/invite', authenticate, async (req,res) => {
  try {
    const { handle, role='developer' } = req.body;
    const { data:invitee } = await db.userByHandle(handle.toLowerCase());
    if (!invitee) return fail(res,'User not found',404);
    const { data:existing } = await db.workspaceMember(req.params.id, invitee.id);
    if (existing) return fail(res,'Already a member');
    await db.addWorkspaceMember(req.params.id, invitee.id, role);
    // notify
    await db.createNotif({ id:uuid(), user_id:invitee.id, type:NOTIF_TYPE.SYSTEM, title:encrypt('Workspace invite'), body:encrypt(`You were added to a workspace`), read:false, data:JSON.stringify({workspaceId:req.params.id}), created_at:new Date().toISOString() });
    ok(res, { message:'Member added' });
  } catch(e) { fail(res, e.message); }
});

app.get('/api/workspaces/:id/members', authenticate, async (req,res) => {
  const { data } = await db.workspaceMembers(req.params.id);
  ok(res, (data||[]).map(m => ({ ...m, user:safeUser(m.user) })));
});

// ── TEAMS ─────────────────────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/teams', authenticate, async (req,res) => {
  const { data } = await db.teamsByWorkspace(req.params.wid);
  ok(res, data||[]);
});

app.post('/api/workspaces/:wid/teams', authenticate, async (req,res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return fail(res,'Name required');
    const { data, error } = await db.createTeam({ id:uuid(), workspace_id:req.params.wid, name:safeStr(name,100), description:safeStr(description||'',300), color:color||'#39d353', lead_id:req.userId, created_at:new Date().toISOString() });
    if (error) return fail(res, error.message);
    await db.addTeamMember(data.id, req.userId, 'lead');
    ok(res, data, 201);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/teams/:tid/members', authenticate, async (req,res) => {
  try {
    const { userId, role='developer' } = req.body;
    const { data, error } = await db.addTeamMember(req.params.tid, userId, role);
    if (error) return fail(res, error.message);
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.delete('/api/teams/:tid/members/:uid', authenticate, async (req,res) => {
  await db.removeTeamMember(req.params.tid, req.params.uid);
  ok(res, { message:'Removed' });
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/projects', authenticate, async (req,res) => {
  const { data } = await db.projectsByWorkspace(req.params.wid);
  ok(res, data||[]);
});

app.post('/api/workspaces/:wid/projects', authenticate, async (req,res) => {
  try {
    const { name, description, color, deadline, teamId } = req.body;
    if (!name) return fail(res,'Name required');
    const p = {
      id:uuid(), workspace_id:req.params.wid, team_id:teamId||null,
      name:safeStr(name,100), description:safeStr(description||'',1000),
      color:color||'#39d353', deadline:deadline||null, status:'active',
      created_by:req.userId, created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
    };
    const { data, error } = await db.createProject(p);
    if (error) return fail(res, error.message);
    await db.addProjectMember(data.id, req.userId, 'manager');
    // auto-create project channel
    await db.createChannel({ id:uuid(), workspace_id:req.params.wid, name:`proj-${safeStr(name,20).toLowerCase().replace(/[^a-z0-9]/g,'-')}`, description:`Project: ${name}`, type:'private', created_by:req.userId, archived:false, created_at:new Date().toISOString() });
    ok(res, data, 201);
  } catch(e) { fail(res, e.message); }
});

app.patch('/api/projects/:id', authenticate, async (req,res) => {
  try {
    const allowed = ['name','description','color','deadline','status'];
    const updates = {};
    for (const k of allowed) if (req.body[k]!==undefined) updates[k]=req.body[k];
    const { data, error } = await db.updateProject(req.params.id, updates);
    if (error) return fail(res, error.message);
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/projects/:id/members', authenticate, async (req,res) => {
  try {
    const { userId, role='contributor' } = req.body;
    const { data, error } = await db.addProjectMember(req.params.id, userId, role);
    if (error) return fail(res, error.message);
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

// ── TASKS ─────────────────────────────────────────────────────────────────────
app.get('/api/projects/:pid/tasks', authenticate, async (req,res) => {
  const { data } = await db.tasksByProject(req.params.pid);
  const tasks = (data||[]).map(t => decryptTask(t));
  ok(res, tasks);
});

app.get('/api/tasks/mine', authenticate, async (req,res) => {
  const { data } = await db.tasksByAssignee(req.userId);
  ok(res, (data||[]).map(decryptTask));
});

app.post('/api/projects/:pid/tasks', authenticate, async (req,res) => {
  try {
    const { title, description, priority='normal', assignedTo, deadline, linkedRepo, linkedFile, linkedBranch, linkedLines } = req.body;
    if (!title) return fail(res,'Title required');
    const tmpl = TASK_TEMPLATES[priority] || TASK_TEMPLATES.normal;
    const dl = deadline || new Date(Date.now() + tmpl.deadlineHours*3600000).toISOString();
    const { data:proj } = await db.projectById(req.params.pid);
    if (!proj) return fail(res,'Project not found',404);

    const task = {
      id:uuid(), project_id:req.params.pid, workspace_id:proj.workspace_id,
      title:encrypt(safeStr(title,300)),
      description: description?encrypt(safeStr(description,5000)):null,
      priority, status:TASK_STATUS.NOT_STARTED,
      assigned_to:assignedTo||null, assigned_by:req.userId,
      deadline:dl, linked_repo:linkedRepo||null, linked_file:linkedFile||null,
      linked_branch:linkedBranch||null, linked_lines:linkedLines?JSON.stringify(linkedLines):null,
      created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
    };
    const { data, error } = await db.createTask(task);
    if (error) return fail(res, error.message);

    // Notify assignee
    if (assignedTo && assignedTo !== req.userId) {
      await db.createNotif({ id:uuid(), user_id:assignedTo, type:NOTIF_TYPE.TASK_ASSIGNED, title:encrypt(`New task assigned`), body:encrypt(safeStr(title,100)), read:false, data:JSON.stringify({taskId:data.id,priority}), created_at:new Date().toISOString() });
      const sockets = onlineUsers.get(assignedTo);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('task:assigned', { task:decryptTask(data) }));
    }
    ok(res, decryptTask(data), 201);
  } catch(e) { fail(res, e.message); }
});

app.patch('/api/tasks/:id', authenticate, async (req,res) => {
  try {
    const { status, priority, deadline, title, description } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (deadline) updates.deadline = deadline;
    if (title) updates.title = encrypt(safeStr(title,300));
    if (description !== undefined) updates.description = description?encrypt(safeStr(description,5000)):null;
    const { data, error } = await db.updateTask(req.params.id, updates);
    if (error) return fail(res, error.message);
    io.emit('task:updated', { task:decryptTask(data) });
    ok(res, decryptTask(data));
  } catch(e) { fail(res, e.message); }
});

app.delete('/api/tasks/:id', authenticate, async (req,res) => {
  await db.deleteTask(req.params.id);
  ok(res, { message:'Deleted' });
});

// ── CODE ASSIGNMENTS ──────────────────────────────────────────────────────────
app.post('/api/code-assignments', authenticate, async (req,res) => {
  try {
    const { toUserId, taskId, repoId, filePath, startLine, endLine, code, note } = req.body;
    const ca = {
      id:uuid(), task_id:taskId||null, from_user:req.userId, to_user:toUserId,
      repo_id:repoId||null, file_path:filePath||null,
      start_line:startLine||null, end_line:endLine||null,
      code_encrypted:code?encrypt(safeStr(code,20000)):null,
      note_encrypted:note?encrypt(safeStr(note,1000)):null,
      acknowledged:false, created_at:new Date().toISOString(),
    };
    const { data, error } = await db.createCodeAssignment(ca);
    if (error) return fail(res, error.message);
    // notify
    await db.createNotif({ id:uuid(), user_id:toUserId, type:NOTIF_TYPE.CODE_ASSIGNED, title:encrypt('Code assignment'), body:encrypt(`From @${req.user.handle}: ${filePath||'snippet'}`), read:false, data:JSON.stringify({assignmentId:data.id}), created_at:new Date().toISOString() });
    const sockets = onlineUsers.get(toUserId);
    if (sockets) sockets.forEach(sid => io.to(sid).emit('code:assigned', { ...data, code:code, note:note }));
    ok(res, data, 201);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/code-assignments/mine', authenticate, async (req,res) => {
  const { data } = await db.codeAssignmentsByUser(req.userId);
  ok(res, (data||[]).map(ca => ({ ...ca, code: ca.code_encrypted ? tryDecrypt(ca.code_encrypted) : null, note: ca.note_encrypted ? tryDecrypt(ca.note_encrypted) : null })));
});

// ── CHANNELS ──────────────────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/channels', authenticate, async (req,res) => {
  const { data } = await db.channelsByWorkspace(req.params.wid);
  ok(res, data||[]);
});

app.post('/api/workspaces/:wid/channels', authenticate, async (req,res) => {
  try {
    const { name, description, type='public' } = req.body;
    if (!name) return fail(res,'Name required');
    const clean = name.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,50);
    const { data, error } = await db.createChannel({ id:uuid(), workspace_id:req.params.wid, name:clean, description:safeStr(description||'',300), type, created_by:req.userId, archived:false, created_at:new Date().toISOString() });
    if (error) return fail(res, error.message);
    io.to(`ws:${req.params.wid}`).emit('channel:created', data);
    ok(res, data, 201);
  } catch(e) { fail(res, e.message); }
});

app.delete('/api/channels/:id', authenticate, async (req,res) => {
  await db.updateChannel(req.params.id, { archived:true });
  ok(res, { message:'Archived' });
});

// ── MESSAGES ──────────────────────────────────────────────────────────────────
app.get('/api/channels/:id/messages', authenticate, async (req,res) => {
  const { before } = req.query;
  const { data } = await db.messagesByChannel(req.params.id, 50, before||null);
  ok(res, (data||[]).reverse().map(formatMsg));
});

app.post('/api/channels/:id/messages/pin', authenticate, async (req,res) => {
  try {
    const { messageId } = req.body;
    const { data, error } = await db.pinMessage(req.params.id, messageId, req.userId);
    if (error) return fail(res, error.message);
    io.to(`ch:${req.params.id}`).emit('msg:pinned', { messageId });
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/channels/:id/pins', authenticate, async (req,res) => {
  const { data } = await db.pinnedMessages(req.params.id);
  ok(res, data||[]);
});

// ── REPOS ─────────────────────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/repos', authenticate, async (req,res) => {
  const { data } = await db.reposByWorkspace(req.params.wid);
  ok(res, data||[]);
});

app.get('/api/repos/mine', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const repos = await gh.getUserRepos(token);
    ok(res, repos);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/workspaces/:wid/repos', authenticate, async (req,res) => {
  try {
    const { owner, name: repoName } = req.body;
    if (!owner || !repoName) return fail(res,'owner and name required');
    const token = tryDecrypt(req.user.github_access_token);
    const ghRepo = await gh.getRepo(owner, repoName, token);
    const { data, error } = await db.createRepo({ id:uuid(), workspace_id:req.params.wid, github_repo_id:String(ghRepo.id), full_name:ghRepo.full_name, description:ghRepo.description||'', private:ghRepo.private, linked_by:req.userId, linked_at:new Date().toISOString() });
    if (error) return fail(res, error.message);
    ok(res, data, 201);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/repos/create', authenticate, async (req,res) => {
  try {
    const { workspaceId, name: repoName, description, isPrivate } = req.body;
    const token = tryDecrypt(req.user.github_access_token);
    const ghRepo = await gh.createRepo(repoName, description||'', Boolean(isPrivate), token);
    const { data } = await db.createRepo({ id:uuid(), workspace_id:workspaceId, github_repo_id:String(ghRepo.id), full_name:ghRepo.full_name, description:ghRepo.description||'', private:ghRepo.private, linked_by:req.userId, linked_at:new Date().toISOString() });
    ok(res, { repo:data, github:ghRepo }, 201);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/repos/:id/tree', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res,'Repo not found',404);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const contents = await gh.getRepoContents(owner, name, req.query.path||'', req.query.ref||'main', token);
    ok(res, contents);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/repos/:id/file', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res,'Repo not found',404);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const file = await gh.getFileContent(owner, name, req.query.path, req.query.ref||'main', token);
    ok(res, file);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/repos/:id/commit', authenticate, async (req,res) => {
  try {
    const { path, content, message, branch, sha } = req.body;
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res,'Repo not found',404);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const result = await gh.createOrUpdateFile(owner, name, path, content, message, sha||null, branch||'main', token);
    io.to(`ws:${repo.workspace_id}`).emit('repo:commit', { repoId:req.params.id, path, message, author:req.user.handle });
    ok(res, result);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/repos/:id/branches', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    ok(res, await gh.getBranches(owner, name, token));
  } catch(e) { fail(res, e.message); }
});

app.post('/api/repos/:id/branches', authenticate, async (req,res) => {
  try {
    const { branchName, fromSha } = req.body;
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    ok(res, await gh.createBranch(owner, name, branchName, fromSha, token));
  } catch(e) { fail(res, e.message); }
});

app.get('/api/repos/:id/commits', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    ok(res, await gh.getCommits(owner, name, req.query.branch||'main', 20, token));
  } catch(e) { fail(res, e.message); }
});

// ── PULL REQUESTS ─────────────────────────────────────────────────────────────
app.get('/api/repos/:id/prs', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    ok(res, await gh.getPRs(owner, name, req.query.state||'open', token));
  } catch(e) { fail(res, e.message); }
});

app.post('/api/repos/:id/prs', authenticate, async (req,res) => {
  try {
    const { title, body, head, base='main' } = req.body;
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const pr = await gh.createPR(owner, name, title, body||'', head, base, token);
    io.to(`ws:${repo.workspace_id}`).emit('pr:created', { repoId:req.params.id, pr });
    ok(res, pr);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/repos/:id/prs/:num/approve', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const r = await gh.approvePR(owner, name, req.params.num, token);
    io.to(`ws:${repo.workspace_id}`).emit('pr:approved', { repoId:req.params.id, prNumber:req.params.num, by:req.user.handle });
    ok(res, r);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/repos/:id/prs/:num/merge', authenticate, async (req,res) => {
  try {
    const { commitTitle } = req.body;
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const r = await gh.mergePR(owner, name, req.params.num, commitTitle||`Merge PR #${req.params.num}`, token);
    io.to(`ws:${repo.workspace_id}`).emit('pr:merged', { repoId:req.params.id, prNumber:req.params.num, by:req.user.handle });
    ok(res, r);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/repos/:id/prs/:num/diff', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    const [owner, name] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const diff = await gh.getPRDiff(owner, name, req.params.num, token);
    ok(res, { diff });
  } catch(e) { fail(res, e.message); }
});

// ── AI ────────────────────────────────────────────────────────────────────────
app.post('/api/ai/chat', authenticate, aiLimiter, async (req,res) => {
  try {
    const { message, history=[], mode='flash' } = req.body;
    if (!message) return fail(res,'Message required');
    const msgs = [
      ...history.map(h => ({ role:h.role, parts:[{text:h.text}] })),
      { role:'user', parts:[{text:message}] },
    ];
    const result = await gemini.geminiChat(msgs, mode==='deep'||mode==='review'?'pro':'flash');
    ok(res, result);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/ai/review', authenticate, aiLimiter, async (req,res) => {
  try {
    const { code, language='javascript', context='' } = req.body;
    if (!code) return fail(res,'Code required');
    const prompt = `Perform a comprehensive code review of this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\n${context}\n\nReview:\n1. **Bugs & Logic Errors**\n2. **Security Issues** (injection, XSS, auth flaws)\n3. **Performance** bottlenecks\n4. **Code Quality** and readability\n5. **Best Practices**\n6. **Improved Version** — full rewrite with all fixes`;
    const { reply, usage } = await gemini.geminiChat([{role:'user',parts:[{text:prompt}]}], 'pro');
    ok(res, { review:reply, usage });
  } catch(e) { fail(res, e.message); }
});

app.post('/api/ai/fix', authenticate, aiLimiter, async (req,res) => {
  try {
    const { code, error:errMsg, language='javascript' } = req.body;
    const prompt = `Fix this ${language} code${errMsg?` that produces: "${errMsg}"`:''}:\n\`\`\`${language}\n${code}\n\`\`\`\n\n1. Root cause of the bug\n2. Fixed code (complete)\n3. How to prevent this`;
    const { reply, usage } = await gemini.geminiChat([{role:'user',parts:[{text:prompt}]}], 'pro');
    ok(res, { fix:reply, usage });
  } catch(e) { fail(res, e.message); }
});

app.post('/api/ai/explain', authenticate, aiLimiter, async (req,res) => {
  try {
    const { code, language='' } = req.body;
    const prompt = `Explain this ${language} code clearly for developers of all levels:\n\`\`\`${language}\n${code}\n\`\`\`\n\nCover: what it does, how it works line by line, and important patterns used.`;
    const { reply } = await gemini.geminiChat([{role:'user',parts:[{text:prompt}]}], 'flash');
    ok(res, { explanation:reply });
  } catch(e) { fail(res, e.message); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
app.get('/api/notifications', authenticate, async (req,res) => {
  const { data } = await db.notifsByUser(req.userId);
  const notifs = (data||[]).map(n => ({
    ...n,
    title: n.title ? tryDecrypt(n.title) : null,
    body: n.body ? tryDecrypt(n.body) : null,
  }));
  ok(res, notifs);
});

app.post('/api/notifications/read-all', authenticate, async (req,res) => {
  await db.markAllNotifsRead(req.userId);
  ok(res, { message:'All marked read' });
});

app.patch('/api/notifications/:id/read', authenticate, async (req,res) => {
  await db.markNotifRead(req.params.id);
  ok(res, { message:'Marked read' });
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
app.get('/api/search', authenticate, async (req,res) => {
  const q = (req.query.q||'').trim();
  if (q.length < 2) return ok(res, { users:[], channels:[] });
  const [{ data:users }, { data:channels }] = await Promise.all([
    db.searchUsers(q, 10),
    db.supabase().from('channels').select('id,name,description,type').ilike('name','%'+q+'%').limit(10),
  ]);
  ok(res, { users:users||[], channels:channels||[] });
});

// ── GITHUB WEBHOOK ────────────────────────────────────────────────────────────
app.post('/webhooks/github', express.raw({type:'application/json'}), async (req,res) => {
  try {
    const sig = req.headers['x-hub-signature-256'];
    const secret = process.env.WEBHOOK_SECRET;
    if (sig && secret) {
      const expected = 'sha256='+crypto.createHmac('sha256',secret).update(req.body).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.status(401).send('Invalid signature');
    }
    const event = req.headers['x-github-event'];
    const payload = JSON.parse(req.body.toString());
    const repoId = String(payload.repository?.id);
    const { data:repo } = await db.repoByGithubId(repoId, '').catch(()=>({data:null}));
    if (repo) {
      let msg = null;
      if (event==='push') msg = `📤 **${payload.pusher?.name}** pushed ${payload.commits?.length||0} commit(s) to \`${payload.ref?.replace('refs/heads/','')}\``;
      if (event==='pull_request') msg = `🔀 PR #${payload.number}: **${payload.pull_request?.title}** [${payload.action}] by @${payload.sender?.login}`;
      if (event==='pull_request_review') msg = `${payload.review?.state==='approved'?'✅':'💬'} PR review by @${payload.sender?.login}: ${payload.review?.state}`;
      if (msg) {
        // post to github-feed channel
        const { data:chans } = await db.channelsByWorkspace(repo.workspace_id);
        const feed = chans?.find(c=>c.name==='github-feed');
        if (feed) {
          const m = { id:uuid(), channel_id:feed.id, user_id:null, content_encrypted:encrypt(msg), type:'system', created_at:new Date().toISOString(), deleted:false, edited:false };
          await db.createMessage(m);
          io.to(`ch:${feed.id}`).emit('msg:new', { ...m, content:msg });
        }
      }
    }
    res.status(200).send('OK');
  } catch(e) { res.status(200).send('OK'); }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err,req,res,next) => {
  console.error(err);
  res.status(err.status||500).json({ success:false, error: NODE_ENV==='production'?'Internal error':err.message });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryDecrypt(s) { try { return decrypt(s); } catch { return s; } }
function decryptTask(t) {
  if (!t) return null;
  return {
    ...t,
    title: t.title ? tryDecrypt(t.title) : null,
    description: t.description ? tryDecrypt(t.description) : null,
  };
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  const ok = await testConnection();
  if (!ok && NODE_ENV==='production') { console.error('DB failed'); process.exit(1); }
  server.listen(PORT, () => {
    console.log(`\n🚀 DevCollab Hub v2.0 on :${PORT} [${NODE_ENV}]`);
    console.log(`   GitHub OAuth: /api/auth/github`);
    console.log(`   Frontend: ${FRONTEND_URL}\n`);
  });
}
start();

module.exports = { app, server, io };
