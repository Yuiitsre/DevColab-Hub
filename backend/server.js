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

// ── Startup env validation ────────────────────────────────────────────────────
if (NODE_ENV === 'production') {
  const required = ['SUPABASE_URL','SUPABASE_SERVICE_KEY','JWT_SECRET','ENCRYPTION_KEY','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_CALLBACK_URL','FRONTEND_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('❌ Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}

const app    = express();
const server = http.createServer(app);

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy:false, crossOriginEmbedderPolicy:false }));
// ── CORS allowed origins ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'https://devcolab.dev',
  'https://www.devcolab.dev',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (curl, Render health checks, redirects)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // allow any vercel.app preview URL for this project
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));
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
  cors: {
    origin: NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
    methods: ['GET','POST'],
  },
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
  // Track last_active timestamp
  await db.updateUser(userId, { last_active: new Date().toISOString() }).catch(()=>{});

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
      // Owner of workspace OR message author can delete
      const { data:wsMember } = await db.supabase().from('workspace_members').select('role').eq('user_id',userId).single();
      const isAdmin = ['owner','admin','manager'].includes(wsMember?.role||'');
      if (msg.user_id !== userId && !isAdmin) return socket.emit('error',{message:'Not your message'});
      // HARD DELETE — completely remove, no ghost
      await db.supabase().from('message_reactions').delete().eq('message_id', messageId);
      await db.supabase().from('message_pins').delete().eq('message_id', messageId);
      await db.supabase().from('messages').delete().eq('id', messageId);
      io.to(`ch:${msg.channel_id}`).emit('msg:deleted', { messageId, hard: true });
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
  socket.on('typing:start', ({ channelId }) => socket.to('ch:'+channelId).emit('typing:user', { userId, username:user.handle }));
  socket.on('typing:stop',  ({ channelId }) => socket.to('ch:'+channelId).emit('typing:off',  { userId }));
  // Task viewing presence
  socket.on('task:viewing', ({ taskId }) => {
    socket.join('task:'+taskId);
    socket.to('task:'+taskId).emit('task:viewer:joined', { userId, handle:user.handle, avatar_color:user.avatar_color });
  });
  socket.on('task:left', ({ taskId }) => {
    socket.leave('task:'+taskId);
    socket.to('task:'+taskId).emit('task:viewer:left', { userId });
  });
  // Task working live indicator (who is actively typing/editing on a task)
  socket.on('task:working', ({ taskId }) => {
    socket.to('task:'+taskId).emit('task:worker:active', { userId, handle:user.handle, avatar_color:user.avatar_color, ts:Date.now() });
  });

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


  // ── CHANNEL VIEW PRESENCE (who's looking at a channel right now) ──
  socket.on('channel:viewing', ({ channelId }) => {
    // Leave all previous view rooms
    const rooms = [...socket.rooms].filter(r => r.startsWith('view:'));
    rooms.forEach(r => { socket.leave(r); socket.to(r).emit('channel:viewer:left', { userId, channelId: r.replace('view:','') }); });
    socket.join(`view:${channelId}`);
    socket.to(`view:${channelId}`).emit('channel:viewer:joined', { userId, user: safeUser(user), channelId });
    socket.emit('channel:viewers', { channelId, viewers: [] }); // client will accumulate
  });

  // ── READ RECEIPTS ──
  socket.on('msg:read', async ({ channelId, messageId }) => {
    socket.to(`ch:${channelId}`).emit('msg:read:ack', { userId, messageId, channelId });
  });

  // ── THREAD REPLY ──
  socket.on('thread:send', async ({ parentMessageId, content, code }) => {
    try {
      const { data:parent } = await db.messageById(parentMessageId);
      if (!parent) return;
      const enc = content ? encrypt(safeStr(content, 5000)) : null;
      const msg = {
        id: uuid(), channel_id: parent.channel_id, user_id: userId,
        content_encrypted: enc, type: code ? 'code' : 'text',
        code_lang: code?.lang||null, code_body: code?.body ? encrypt(code.body) : null,
        thread_parent_id: parentMessageId,
        created_at: new Date().toISOString(), deleted: false, edited: false,
      };
      const { data:saved } = await db.createMessage(msg);
      const out = formatMsg(saved);
      io.to(`ch:${parent.channel_id}`).emit('thread:new', { parentMessageId, reply: out });
    } catch(e) { socket.emit('error', { message: e.message }); }
  });

  // ── PIN MESSAGE (via socket for instant update) ──
  socket.on('msg:pin', async ({ messageId, channelId }) => {
    try {
      await db.pinMessage(channelId, messageId, userId);
      io.to(`ch:${channelId}`).emit('msg:pinned', { messageId, channelId, pinnedBy: userId });
    } catch(e) {}
  });

  socket.on('msg:unpin', async ({ messageId, channelId }) => {
    try {
      await db.supabase().from('message_pins').delete().eq('message_id', messageId).eq('channel_id', channelId);
      io.to(`ch:${channelId}`).emit('msg:unpinned', { messageId, channelId });
    } catch(e) {}
  });

  // ── TASK ASSIGN (with notification) ──
  socket.on('task:assign', async ({ taskId, assigneeId }) => {
    try {
      await db.updateTask(taskId, { assigned_to: assigneeId });
      const { data:task } = await db.taskById(taskId);
      if (!task) return;
      io.to(`ws:${task.workspace_id||''}`).emit('task:assigned', { task });
      // notify assignee
      await db.createNotif({ id:uuid(), user_id:assigneeId, type:'task_assigned', title:encrypt(`Task assigned to you`), body:encrypt(safeStr(task.title||'',100)), read:false, data:JSON.stringify({taskId}), created_at:new Date().toISOString() });
      const assigneeSockets = onlineUsers.get(assigneeId);
      if (assigneeSockets) assigneeSockets.forEach(sid => io.to(sid).emit('notification:new', { type:'task_assigned', title:'Task Assigned', body: task.title||'' }));
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
    const baseHandle = ghUser.login.toLowerCase().replace(/[^a-z0-9_]/g,'') || 'user';
    let finalHandle = baseHandle;
    let attempt = 0;
    while (attempt < 20) {
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
  const out = (data||[]).map(ws => ({
    ...ws,
    name: ws.name ? tryDecrypt(ws.name) : 'Workspace',
    description: ws.description ? tryDecrypt(ws.description) : null,
  }));
  ok(res, out);
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
  const members = (data||[]).map(m => {
    const user = safeUser(m.user);
    if (user) {
      try { user.display_name = user.display_name ? decrypt(user.display_name) : user.github_username; } catch { user.display_name = user.github_username; }
    }
    return { ...m, user };
  });
  ok(res, members);
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

// ── PROJECT DETAIL + DASHBOARD DATA ──────────────────────────────────────
app.get('/api/projects/:id', authenticate, async (req,res) => {
  try {
    const { data:proj } = await db.projectById(req.params.id);
    if (!proj) return fail(res,'Not found',404);
    const name = proj.name ? tryDecrypt(proj.name) : 'Project';
    ok(res, { ...proj, name });
  } catch(e) { fail(res, e.message); }
});

app.get('/api/projects/:id/dashboard', authenticate, async (req,res) => {
  try {
    const { data:proj } = await db.projectById(req.params.id);
    if (!proj) return fail(res,'Not found',404);
    const name = proj.name ? tryDecrypt(proj.name) : 'Project';
    // Get all tasks for this project
    const { data:tasksRaw } = await db.tasksByProject(req.params.id);
    const tasks = (tasksRaw||[]).map(decryptTask);
    // Get project members
    const { data:members } = await db.supabase()
      .from('project_members')
      .select('*, user:users(id,handle,display_name,avatar_url,avatar_color,role,status,last_active)')
      .eq('project_id', req.params.id);
    // Get linked repos
    const { data:repos } = await db.supabase()
      .from('linked_repos').select('*').eq('workspace_id', proj.workspace_id);
    // Find project-specific repo (by name matching or first linked repo)
    const projectRepo = repos?.[0] || null;
    // Task stats
    const stats = {
      total: tasks.length,
      not_started: tasks.filter(t=>t.status==='not_started').length,
      in_progress: tasks.filter(t=>t.status==='in_progress').length,
      in_review: tasks.filter(t=>t.status==='in_review').length,
      approved: tasks.filter(t=>t.status==='approved').length,
      done: tasks.filter(t=>t.status==='done').length,
      blocked: tasks.filter(t=>t.status==='blocked').length,
      urgent: tasks.filter(t=>t.priority==='urgent'&&t.status!=='done').length,
    };
    const progress = tasks.length ? Math.round(tasks.filter(t=>t.status==='done'||t.status==='approved').length/tasks.length*100) : 0;
    ok(res, { project:{...proj,name}, tasks, members:members||[], stats, progress, repo:projectRepo });
  } catch(e) { fail(res, e.message); }
});

app.get('/api/projects/:id/members', authenticate, async (req,res) => {
  try {
    const { data } = await db.supabase()
      .from('project_members')
      .select('*, user:users(id,handle,display_name,avatar_url,avatar_color,role,status,last_active,github_username)')
      .eq('project_id', req.params.id);
    ok(res, (data||[]).map(m => {
      const u = m.user||{};
      try { if(u.display_name) u.display_name = tryDecrypt(u.display_name); } catch{}
      return { ...m, user:safeUser(u) };
    }));
  } catch(e) { fail(res, e.message); }
});

app.delete('/api/projects/:id/members/:uid', authenticate, async (req,res) => {
  try {
    await db.supabase().from('project_members').delete().eq('project_id',req.params.id).eq('user_id',req.params.uid);
    ok(res, { removed:true });
  } catch(e) { fail(res, e.message); }
});

app.patch('/api/projects/:id/tasks/:tid/status', authenticate, async (req,res) => {
  try {
    const { status } = req.body;
    await db.updateTask(req.params.tid, { status, updated_at:new Date().toISOString() });
    const { data:task } = await db.taskById(req.params.tid);
    io.to('ws:'+(task?.workspace_id||'')).emit('task:updated', { task:decryptTask(task) });
    ok(res, { status });
  } catch(e) { fail(res, e.message); }
});

app.delete('/api/projects/:id', authenticate, async (req,res) => {
  try {
    const { data:proj } = await db.projectById(req.params.id);
    if (!proj) return fail(res,'Not found',404);
    const { data:me } = await db.supabase().from('workspace_members').select('role').eq('workspace_id',proj.workspace_id).eq('user_id',req.userId).single();
    if (!hasPermission(me?.role||'viewer','CREATE_PROJECT')) return fail(res,'Permission denied',403);
    await db.supabase().from('tasks').delete().eq('project_id',req.params.id);
    await db.supabase().from('project_members').delete().eq('project_id',req.params.id);
    await db.supabase().from('projects').delete().eq('id',req.params.id);
    io.to('ws:'+proj.workspace_id).emit('project:deleted', { projectId:req.params.id });
    ok(res, { deleted:true });
  } catch(e) { fail(res, e.message); }
});

// ── CHANNEL MANAGEMENT ────────────────────────────────────────────────────
app.patch('/api/channels/:id', authenticate, async (req,res) => {
  try {
    const { name, description, type } = req.body;
    const updates = {};
    if (name) updates.name = safeStr(name.toLowerCase().replace(/[^a-z0-9-]/g,'-'),50);
    if (description !== undefined) updates.description = safeStr(description||'',300);
    if (type) updates.type = type;
    const { data, error } = await db.supabase().from('channels').update(updates).eq('id',req.params.id).select().single();
    if (error) return fail(res, error.message);
    io.to('ws:'+(data?.workspace_id||'')).emit('channel:updated', { channel:data });
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.delete('/api/channels/:id', authenticate, async (req,res) => {
  try {
    const { data:ch } = await db.supabase().from('channels').select('*').eq('id',req.params.id).single();
    if (!ch) return fail(res,'Not found');
    if (['general','github-feed','ai-help'].includes(ch.name)) return fail(res,'Cannot delete default channels');
    const { data:me } = await db.supabase().from('workspace_members').select('role').eq('workspace_id',ch.workspace_id).eq('user_id',req.userId).single();
    if (!hasPermission(me?.role||'viewer','CREATE_CHANNEL')) return fail(res,'Permission denied',403);
    await db.supabase().from('messages').delete().eq('channel_id',req.params.id);
    await db.supabase().from('channel_members').delete().eq('channel_id',req.params.id);
    await db.supabase().from('channels').delete().eq('id',req.params.id);
    io.to('ws:'+ch.workspace_id).emit('channel:deleted', { channelId:req.params.id });
    ok(res, { deleted:true });
  } catch(e) { fail(res, e.message); }
});

// ── WORKSPACE PROJECTS WITH GITHUB MANDATORY ─────────────────────────────

app.get('/api/workspaces/:wid/projects', authenticate, async (req,res) => {
  const { data } = await db.projectsByWorkspace(req.params.wid);
  ok(res, data||[]);
});

app.post('/api/workspaces/:wid/projects', authenticate, async (req,res) => {
  try {
    const { name, description, color='#22c55e', deadline, isPrivate=false } = req.body;
    if (!name) return fail(res,'Name required');
    // Check permission
    const { data:member } = await db.supabase().from('workspace_members').select('role').eq('user_id',req.userId).eq('workspace_id',req.params.wid).single();
    if (!hasPermission(member?.role||'viewer','CREATE_PROJECT')) return fail(res,'Permission denied',403);

    // MANDATORY: Create GitHub repo
    let ghRepo = null;
    const token = tryDecrypt(req.user.github_access_token);
    const repoSlug = name.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,100);
    try {
      ghRepo = await gh.createRepo(repoSlug, description||('DevCollab project: '+name), isPrivate, token);
    } catch(ghErr) {
      // If repo already exists with same name, try to get it
      try { ghRepo = await gh.getRepo(req.user.github_username, repoSlug, token); }
      catch { return fail(res,'GitHub repo creation failed: '+ghErr.message); }
    }

    const p = {
      id:uuid(), workspace_id:req.params.wid,
      name: encrypt(safeStr(name,100)),
      description: description ? encrypt(safeStr(description,1000)) : null,
      color, deadline:deadline||null, status:'active',
      created_by:req.userId,
      created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
    };
    // Store github info in metadata (avoid adding non-existent columns)
    const ghMeta = { full_name: ghRepo.full_name, html_url: ghRepo.html_url, id: ghRepo.id };
    const { data, error } = await db.createProject(p);
    if (error) return fail(res, error.message);

    // Link repo to workspace
    await db.createRepo({ id:uuid(), workspace_id:req.params.wid, github_repo_id:String(ghRepo.id), full_name:ghRepo.full_name, description:ghRepo.description||'', private:ghRepo.private, linked_by:req.userId, linked_at:new Date().toISOString() }).catch(()=>{});

    // Add creator as project owner
    await db.addProjectMember(data.id, req.userId, 'owner');

    // Create project-specific private channel with REAL project name
    const chanName = 'proj-'+repoSlug.slice(0,25);
    const newCh = await db.createChannel({ id:uuid(), workspace_id:req.params.wid, name:chanName, description:'Project: '+name, type:'private', created_by:req.userId, archived:false, created_at:new Date().toISOString() }).catch(()=>({data:null}));

    io.to('ws:'+req.params.wid).emit('project:created', { project:{...data, name, github_repo:ghRepo.full_name, github_url:ghRepo.html_url}, repo:ghRepo });
    ok(res, { ...data, name, github_repo:ghMeta.full_name, github_url:ghMeta.html_url }, 201);
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
    const updated = decryptTask(data);
    if (updated.workspace_id) {
      io.to(`ws:${updated.workspace_id}`).emit('task:updated', { task: updated });
    }
    ok(res, updated);
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


// ── GitHub Profile & Contribution routes ─────────────────
app.get('/api/github/profile', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const [profile, events] = await Promise.all([
      gh.getAuthUser(token),
      fetch(`https://api.github.com/users/${req.user.github_username}/events/public?per_page=30`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent':'DevCollab-Hub/2.0' }
      }).then(r=>r.json()).catch(()=>[]),
    ]);
    ok(res, { profile, events });
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/all', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    // Fetch up to 100 repos (2 pages) including private
    const [page1, page2] = await Promise.all([
      gh.getUserRepos(token, 1),
      gh.getUserRepos(token, 2).catch(()=>[]),
    ]);
    const all = [...(page1||[]), ...(page2||[])];
    ok(res, all);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/:owner/:repo/languages', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/languages`, {
      headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'DevCollab-Hub/2.0' }
    }).then(r=>r.json());
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/:owner/:repo/stats', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const [contributors, commitActivity, codeFreq] = await Promise.all([
      fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/stats/contributors?per_page=5`, {headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}}).then(r=>r.json()).catch(()=>[]),
      fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/stats/commit_activity`, {headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}}).then(r=>r.json()).catch(()=>[]),
      fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/stats/code_frequency`, {headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}}).then(r=>r.json()).catch(()=>[]),
    ]);
    ok(res, { contributors, commitActivity, codeFreq });
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/:owner/:repo/issues', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const state = req.query.state || 'open';
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/issues?state=${state}&per_page=20`, {
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}
    }).then(r=>r.json());
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/github/repos/:owner/:repo/issues', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const {title,body,labels} = req.body;
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/issues`, {
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'DevCollab-Hub/2.0'},
      body: JSON.stringify({title,body,labels}),
    }).then(r=>r.json());
    ok(res, data, 201);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/:owner/:repo/releases', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/releases?per_page=10`, {
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}
    }).then(r=>r.json());
    ok(res, Array.isArray(data) ? data : []);
  } catch(e) { fail(res, []); }
});

app.post('/api/github/repos/:owner/:repo/fork', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/forks`, {
      method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'},body:'{}'
    }).then(r=>r.json());
    ok(res, data, 202);
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/:owner/:repo/contributors', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/contributors?per_page=10`, {
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}
    }).then(r=>r.json());
    ok(res, Array.isArray(data)?data:[]);
  } catch(e) { fail(res, []); }
});

app.patch('/api/github/repos/:owner/:repo', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const {description,homepage,has_issues,has_projects,has_wiki,private:priv} = req.body;
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}`, {
      method:'PATCH',
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'DevCollab-Hub/2.0'},
      body:JSON.stringify({description,homepage,has_issues,has_projects,has_wiki,private:priv}),
    }).then(r=>r.json());
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/github/repos/:owner/:repo/star', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    await fetch(`https://api.github.com/user/starred/${req.params.owner}/${req.params.repo}`, {
      method:'PUT',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Length':'0','User-Agent':'DevCollab-Hub/2.0'}
    });
    ok(res, {starred:true});
  } catch(e) { fail(res, e.message); }
});

app.get('/api/github/repos/:owner/:repo/readme', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const data = await fetch(`https://api.github.com/repos/${req.params.owner}/${req.params.repo}/readme`, {
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'DevCollab-Hub/2.0'}
    }).then(r=>r.json());
    const content = data.content ? Buffer.from(data.content,'base64').toString('utf8') : '';
    ok(res, {content, name: data.name||'README.md'});
  } catch(e) { ok(res, {content:'',name:'README.md'}); }
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
    const result = await gemini.geminiChat(msgs, mode==='pro'||mode==='review'?'pro':mode==='deep'?'flash':'lite');
    ok(res, result);
  } catch(e) { fail(res, e.message); }
});

app.post('/api/ai/review', authenticate, aiLimiter, async (req,res) => {
  try {
    const { code, language='javascript', context='' } = req.body;
    if (!code) return fail(res,'Code required');
    const prompt = `Perform a comprehensive code review of this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\n${context}\n\nReview:\n1. **Bugs & Logic Errors**\n2. **Security Issues** (injection, XSS, auth flaws)\n3. **Performance** bottlenecks\n4. **Code Quality** and readability\n5. **Best Practices**\n6. **Improved Version** — full rewrite with all fixes`;
    const { reply, usage, model } = await gemini.geminiChat([{role:'user',parts:[{text:prompt}]}], 'flash');
    ok(res, { review:reply, usage, model });
  } catch(e) { fail(res, e.message); }
});

app.post('/api/ai/fix', authenticate, aiLimiter, async (req,res) => {
  try {
    const { code, error:errMsg, language='javascript' } = req.body;
    const prompt = `Fix this ${language} code${errMsg?` that produces: "${errMsg}"`:''}:\n\`\`\`${language}\n${code}\n\`\`\`\n\n1. Root cause of the bug\n2. Fixed code (complete)\n3. How to prevent this`;
    const { reply, usage, model } = await gemini.geminiChat([{role:'user',parts:[{text:prompt}]}], 'flash');
    ok(res, { fix:reply, usage, model });
  } catch(e) { fail(res, e.message); }
});

app.post('/api/ai/explain', authenticate, aiLimiter, async (req,res) => {
  try {
    const { code, language='' } = req.body;
    const prompt = `Explain this ${language} code clearly for developers of all levels:\n\`\`\`${language}\n${code}\n\`\`\`\n\nCover: what it does, how it works line by line, and important patterns used.`;
    const { reply, model } = await gemini.geminiChat([{role:'user',parts:[{text:prompt}]}], 'lite');
    ok(res, { explanation:reply, model });
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



app.post('/api/messages/:id/thread', authenticate, async (req,res) => {
  try {
    const { content } = req.body;
    const { data:parent } = await db.messageById(req.params.id);
    if (!parent) return fail(res,'parent not found');
    const enc = encrypt(safeStr(content,5000));
    const msg = { id:uuid(), channel_id:parent.channel_id, user_id:req.userId, content_encrypted:enc, type:'text', thread_parent_id:req.params.id, created_at:new Date().toISOString(), deleted:false };
    const { data:saved } = await db.createMessage(msg);
    const out = formatMsg(saved);
    io.to(`ch:${parent.channel_id}`).emit('thread:new', { parentMessageId:req.params.id, reply:out });
    ok(res, out, 201);
  } catch(e) { fail(res, e.message); }
});

// ── THREADS ──────────────────────────────────────────────────────────────
app.get('/api/messages/:id/thread', authenticate, async (req,res) => {
  try {
    const { data } = await db.supabase().from('messages')
      .select('*,user:users(id,github_username,handle,display_name,avatar_url,avatar_color,role)')
      .eq('thread_parent_id', req.params.id).order('created_at');
    ok(res, (data||[]).map(formatMsg));
  } catch(e) { fail(res, e.message); }
});

// ── CODE SEARCH ───────────────────────────────────────────────────────────
app.get('/api/github/search/code', authenticate, async (req,res) => {
  try {
    const { q, lang } = req.query;
    if (!q) return fail(res, 'q required');
    const token = tryDecrypt(req.user.github_access_token);
    const qualifier = lang ? `+language:${lang}` : '';
    const data = await fetch(
      `https://api.github.com/search/code?q=${encodeURIComponent(q)}+user:${req.user.github_username}${qualifier}&per_page=20`,
      { headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'DevCollab-Hub/2.0' } }
    ).then(r=>r.json());
    ok(res, data);
  } catch(e) { fail(res, e.message); }
});

// ── DIFF (between two commits or branches) ───────────────────────────────
app.get('/api/repos/:id/diff', authenticate, async (req,res) => {
  try {
    const { base, head } = req.query;
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res, 'Repo not found');
    const [owner, repoName] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const diff = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/compare/${base||'HEAD~1'}...${head||'HEAD'}`,
      { headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'DevCollab-Hub/2.0' } }
    ).then(r=>r.json());
    ok(res, diff);
  } catch(e) { fail(res, e.message); }
});

// ── COMMIT DIFF (single commit) ──────────────────────────────────────────
app.get('/api/repos/:id/commits/:sha/diff', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res, 'Repo not found');
    const [owner, repoName] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const commit = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/commits/${req.params.sha}`,
      { headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'DevCollab-Hub/2.0' } }
    ).then(r=>r.json());
    ok(res, commit);
  } catch(e) { fail(res, e.message); }
});

// ── GITHUB GRAPHQL (real contributions) ─────────────────────────────────
app.get('/api/github/contributions', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    const year = req.query.year || new Date().getFullYear();
    const from = `${year}-01-01T00:00:00Z`;
    const to   = `${year}-12-31T23:59:59Z`;
    const query = `{
      user(login: "${req.user.github_username}") {
        contributionsCollection(from: "${from}", to: "${to}") {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalRepositoryContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
        repositories(first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes { name }
        }
      }
    }`;
    const result = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'User-Agent':'DevCollab-Hub/2.0' },
      body: JSON.stringify({ query }),
    }).then(r=>r.json());
    if (result.errors) return fail(res, result.errors[0]?.message || 'GraphQL error');
    ok(res, result.data?.user?.contributionsCollection);
  } catch(e) { fail(res, e.message); }
});

// ── ACTIVITY FEED ─────────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/activity', authenticate, async (req,res) => {
  try {
    const limit = parseInt(req.query.limit)||30;
    const { data } = await db.supabase()
      .from('audit_log')
      .select('*')
      .eq('workspace_id', req.params.wid)
      .order('created_at', { ascending: false })
      .limit(limit);
    ok(res, data||[]);
  } catch(e) { fail(res, []); }
});

// ── BURNDOWN DATA ─────────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/burndown', authenticate, async (req,res) => {
  try {
    // Only owner/lead can see burndown
    const { data:me } = await db.supabase().from('workspace_members').select('role').eq('workspace_id',req.params.wid).eq('user_id',req.userId).single();
    if (!hasPermission(me?.role||'viewer','APPROVE_PR')) return fail(res,'Permission denied',403);
    const { data } = await db.supabase()
      .from('tasks')
      .select('id,created_at,status,updated_at,priority,title,assigned_to')
      .eq('workspace_id', req.params.wid)
      .order('created_at');
    // Compute daily burndown for last 30 days
    const tasks = data||[];
    const days = [];
    for (let i=29; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
      const dEnd = new Date(d); dEnd.setHours(23,59,59,999);
      const dStr = d.toISOString().split('T')[0];
      const open = tasks.filter(t => new Date(t.created_at) <= dEnd && t.status!=='done').length;
      const closed = tasks.filter(t => t.status==='done' && new Date(t.updated_at) <= dEnd && new Date(t.updated_at) >= d).length;
      days.push({ date:dStr, open, closed, total:tasks.filter(t=>new Date(t.created_at)<=dEnd).length });
    }
    ok(res, { tasks, days });
  } catch(e) { fail(res, []); }
});

// ── PERSONAL STATS ────────────────────────────────────────────────────────
app.get('/api/users/me/stats', authenticate, async (req,res) => {
  try {
    const token = tryDecrypt(req.user.github_access_token);
    // Get tasks completed this month
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const { data:tasks } = await db.supabase().from('tasks')
      .select('id,status,updated_at').eq('assigned_to', req.userId).eq('status','done').gte('updated_at', monthStart.toISOString());
    const tasksThisMonth = tasks?.length || 0;
    // Get recent commit count via GitHub
    let commitsThisWeek = 0;
    try {
      const weekAgo = new Date(Date.now() - 7*24*3600000).toISOString();
      const events = await fetch(`https://api.github.com/users/${req.user.github_username}/events?per_page=100`, {
        headers: { Authorization:`Bearer ${token}`, 'User-Agent':'DevCollab-Hub/2.0' }
      }).then(r=>r.json());
      commitsThisWeek = (Array.isArray(events) ? events : []).filter(e => e.type==='PushEvent' && new Date(e.created_at)>new Date(weekAgo))
        .reduce((sum,e) => sum + (e.payload?.commits?.length||0), 0);
    } catch {}
    ok(res, { tasksThisMonth, commitsThisWeek });
  } catch(e) { fail(res, { tasksThisMonth:0, commitsThisWeek:0 }); }
});

// ── INLINE PR COMMENT ─────────────────────────────────────────────────────
app.post('/api/repos/:id/prs/:num/comments', authenticate, async (req,res) => {
  try {
    const { body, path, position, commit_id } = req.body;
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res,'not found');
    const [owner, repoName] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const result = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${req.params.num}/comments`, {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json', 'User-Agent':'DevCollab-Hub/2.0' },
      body: JSON.stringify({ body, path, position, commit_id }),
    }).then(r=>r.json());
    ok(res, result, 201);
  } catch(e) { fail(res, e.message); }
});

// ── PR DIFF ───────────────────────────────────────────────────────────────
app.get('/api/repos/:id/prs/:num/diff', authenticate, async (req,res) => {
  try {
    const { data:repo } = await db.repoById(req.params.id);
    if (!repo) return fail(res,'not found');
    const [owner, repoName] = repo.full_name.split('/');
    const token = tryDecrypt(req.user.github_access_token);
    const diff = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${req.params.num}/files`, {
      headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'DevCollab-Hub/2.0' }
    }).then(r=>r.json());
    ok(res, diff);
  } catch(e) { fail(res, e.message); }
});


// ── ROLE MANAGEMENT ──────────────────────────────────────────────────────
app.get('/api/workspaces/:wid/my-role', authenticate, async (req,res) => {
  try {
    const { data } = await db.supabase().from('workspace_members')
      .select('role').eq('workspace_id',req.params.wid).eq('user_id',req.userId).single();
    ok(res, { role: data?.role || 'viewer', permissions: Object.entries(require('./config/constants').CAN).reduce((acc,[k,v])=>({...acc,[k]:v.includes(data?.role||'viewer')}),{}) });
  } catch(e) { ok(res, { role:'viewer', permissions:{} }); }
});

app.patch('/api/workspaces/:wid/members/:uid/role', authenticate, async (req,res) => {
  try {
    const { role } = req.body;
    const { data:me } = await db.supabase().from('workspace_members').select('role').eq('workspace_id',req.params.wid).eq('user_id',req.userId).single();
    if (!hasPermission(me?.role||'viewer','MANAGE_MEMBERS')) return fail(res,'Permission denied',403);
    await db.supabase().from('workspace_members').update({role}).eq('workspace_id',req.params.wid).eq('user_id',req.params.uid);
    io.to(`ws:${req.params.wid}`).emit('member:role_changed', { userId:req.params.uid, role, changedBy:req.userId });
    ok(res, { role });
  } catch(e) { fail(res, e.message); }
});

// ── OWNER DASHBOARD DATA ──────────────────────────────────────────────────
app.get('/api/workspaces/:wid/dashboard', authenticate, async (req,res) => {
  try {
    const [members, tasks, projects, channels] = await Promise.all([
      db.workspaceMembers(req.params.wid).then(r=>r.data||[]),
      db.supabase().from('tasks').select('*').eq('workspace_id',req.params.wid).then(r=>r.data||[]),
      db.supabase().from('projects').select('*').eq('workspace_id',req.params.wid).then(r=>r.data||[]),
      db.channelsByWorkspace(req.params.wid).then(r=>r.data||[]),
    ]);
    const now = Date.now();
    const membersWithStatus = members.map(m => {
      const u = m.user || {};
      const isOnline = onlineUsers.has(u.id);
      return { ...m, user:safeUser(u), online:isOnline };
    });
    const taskStats = {
      total: tasks.length,
      open: tasks.filter(t=>t.status!=='done').length,
      inReview: tasks.filter(t=>t.status==='in_review').length,
      done: tasks.filter(t=>t.status==='done').length,
      blocked: tasks.filter(t=>t.status==='blocked').length,
      urgent: tasks.filter(t=>t.priority==='urgent'&&t.status!=='done').length,
    };
    ok(res, { members:membersWithStatus, taskStats, projectCount:projects.length, channelCount:channels.length });
  } catch(e) { fail(res, e.message); }
});

// ── AUTO BRANCH CREATION ON TASK START ───────────────────────────────────
app.post('/api/tasks/:id/start', authenticate, async (req,res) => {
  try {
    const { data:task } = await db.taskById(req.params.id);
    if (!task) return fail(res,'Task not found');
    if (task.assigned_to !== req.userId) return fail(res,'Not assigned to you',403);
    await db.updateTask(req.params.id, { status:'in_progress', started_at:new Date().toISOString() });
    // Auto-create branch on the project repo
    let branchName = null;
    if (task.github_repo || task.workspace_id) {
      try {
        const token = tryDecrypt(req.user.github_access_token);
        // Find linked repo
        const { data:repos } = await db.supabase().from('linked_repos').select('*').eq('workspace_id',task.workspace_id).limit(1);
        if (repos?.length) {
          const [owner,repoName] = repos[0].full_name.split('/');
          const slug = (task.title||'task').toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,30);
          branchName = `task-${req.params.id.slice(0,8)}-${slug}`;
          const branches = await gh.getBranches(owner, repoName, token);
          const sha = branches[0]?.commit?.sha || '';
          if (sha) await gh.createBranch(owner, repoName, branchName, sha, token);
        }
      } catch(branchErr) { console.warn('[task:start] branch creation:', branchErr.message); }
    }
    await db.updateTask(req.params.id, { branch_name: branchName });
    io.to(`ws:${task.workspace_id||''}`).emit('task:started', { taskId:req.params.id, userId:req.userId, branchName });
    ok(res, { status:'in_progress', branchName });
  } catch(e) { fail(res, e.message); }
});

// ── SUBMIT TASK FOR REVIEW (auto-opens GitHub PR) ─────────────────────────
app.post('/api/tasks/:id/submit-review', authenticate, async (req,res) => {
  try {
    const { data:task } = await db.taskById(req.params.id);
    if (!task) return fail(res,'Task not found');
    if (task.assigned_to !== req.userId) return fail(res,'Not your task',403);
    const { prTitle, prBody } = req.body;
    let prData = null;
    if (task.branch_name) {
      try {
        const token = tryDecrypt(req.user.github_access_token);
        const { data:repos } = await db.supabase().from('linked_repos').select('*').eq('workspace_id',task.workspace_id).limit(1);
        if (repos?.length) {
          const [owner,repoName] = repos[0].full_name.split('/');
          const repo = await gh.getRepo(owner, repoName, token);
          prData = await gh.createPR(owner, repoName, prTitle||task.title, prBody||`Resolves task #${req.params.id}\n\n${task.description||''}`, task.branch_name, repo.default_branch||'main', token);
        }
      } catch(prErr) { console.warn('[task:submit] PR creation:', prErr.message); }
    }
    await db.updateTask(req.params.id, { status:'in_review', pr_url:prData?.html_url||null, pr_number:prData?.number||null });
    // Notify leads/owner
    const { data:leads } = await db.supabase().from('workspace_members').select('user_id').eq('workspace_id',task.workspace_id).in('role',['owner','admin','manager','lead']);
    for (const lead of leads||[]) {
      await db.createNotif({ id:uuid(), user_id:lead.user_id, type:'pr_review', title:encrypt(`PR ready for review`), body:encrypt(safeStr(task.title||'',100)), read:false, data:JSON.stringify({taskId:req.params.id, prUrl:prData?.html_url}), created_at:new Date().toISOString() });
      const sockets = onlineUsers.get(lead.user_id);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('notification:new', { type:'pr_review', title:'PR Ready for Review', body:task.title||'' }));
    }
    io.to(`ws:${task.workspace_id||''}`).emit('task:submitted', { taskId:req.params.id, userId:req.userId, pr:prData });
    ok(res, { status:'in_review', pr:prData });
  } catch(e) { fail(res, e.message); }
});

// ── APPROVE/REJECT TASK (Lead/Owner only) ────────────────────────────────
app.post('/api/tasks/:id/approve', authenticate, async (req,res) => {
  try {
    const { data:task } = await db.taskById(req.params.id);
    if (!task) return fail(res,'not found');
    const { data:me } = await db.supabase().from('workspace_members').select('role').eq('workspace_id',task.workspace_id).eq('user_id',req.userId).single();
    if (!hasPermission(me?.role||'viewer','APPROVE_PR')) return fail(res,'Permission denied',403);
    await db.updateTask(req.params.id, { status:'approved', approved_by:req.userId, approved_at:new Date().toISOString() });
    // Notify the assignee
    if (task.assigned_to) {
      await db.createNotif({ id:uuid(), user_id:task.assigned_to, type:'pr_approved', title:encrypt('Your work was approved!'), body:encrypt(safeStr(task.title||'',100)), read:false, data:JSON.stringify({taskId:req.params.id}), created_at:new Date().toISOString() });
      const sockets = onlineUsers.get(task.assigned_to);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('notification:new', { type:'pr_approved', title:'Work Approved! ✓', body:task.title||'' }));
    }
    io.to(`ws:${task.workspace_id||''}`).emit('task:approved', { taskId:req.params.id, approvedBy:req.userId });
    ok(res, { status:'approved' });
  } catch(e) { fail(res, e.message); }
});

app.post('/api/tasks/:id/reject', authenticate, async (req,res) => {
  try {
    const { reason } = req.body;
    const { data:task } = await db.taskById(req.params.id);
    if (!task) return fail(res,'not found');
    const { data:me } = await db.supabase().from('workspace_members').select('role').eq('workspace_id',task.workspace_id).eq('user_id',req.userId).single();
    if (!hasPermission(me?.role||'viewer','APPROVE_PR')) return fail(res,'Permission denied',403);
    await db.updateTask(req.params.id, { status:'in_progress', rejection_reason:reason||'' });
    if (task.assigned_to) {
      await db.createNotif({ id:uuid(), user_id:task.assigned_to, type:'system', title:encrypt('Changes requested'), body:encrypt(safeStr(reason||task.title||'',100)), read:false, data:JSON.stringify({taskId:req.params.id,reason}), created_at:new Date().toISOString() });
      const sockets = onlineUsers.get(task.assigned_to);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('notification:new', { type:'changes_requested', title:'Changes Requested', body:reason||'' }));
    }
    io.to(`ws:${task.workspace_id||''}`).emit('task:rejected', { taskId:req.params.id, rejectedBy:req.userId, reason });
    ok(res, { status:'in_progress' });
  } catch(e) { fail(res, e.message); }
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

// ── GITHUB WEBHOOK (posts formatted cards to #github-feed) ───────────────
async function postToGithubFeed(workspaceId, content, type='system') {
  try {
    const { data:channels } = await db.channelsByWorkspace(workspaceId);
    const feedCh = channels?.find(c => c.name === 'github-feed');
    if (!feedCh) return;
    const msg = {
      id: uuid(), channel_id: feedCh.id, user_id: 'system',
      content_encrypted: encrypt(content), type,
      created_at: new Date().toISOString(), deleted: false,
    };
    await db.createMessage(msg);
    io.to(`ch:${feedCh.id}`).emit('msg:new', { ...msg, userId:'system', content, ts:msg.created_at });
  } catch(e) { console.warn('[webhook feed]', e.message); }
}

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
    // Look up repo by github_repo_id only (no workspace filter needed in webhook)
    const { data:repo } = await db.supabase()
      .from('linked_repos').select('*').eq('github_repo_id', repoId).limit(1).single()
      .catch(() => ({ data: null }));
    if (repo) {
      const wid = repo.workspace_id;
      const { data:chans } = await db.channelsByWorkspace(wid);
      const feed = chans?.find(c => c.name==='github-feed');
      
      // Build rich card metadata
      let cardContent = null, cardMeta = null;
      const repoName = payload.repository?.full_name || '';
      const repoUrl  = payload.repository?.html_url || '';
      const sender   = payload.sender?.login || '';
      const senderAv = payload.sender?.avatar_url || '';

      if (event === 'push' && payload.commits?.length) {
        const branch = (payload.ref||'').replace('refs/heads/','');
        const commits = (payload.commits||[]).slice(0,5);
        cardContent = `🚀 **${sender}** pushed ${payload.commits.length} commit${payload.commits.length!==1?'s':''} to \`${branch}\` in **${repoName}**`;
        cardMeta = JSON.stringify({
          type:'push', repo:repoName, repoUrl, branch,
          sender, senderAv,
          commits: commits.map(cm => ({ sha:cm.id?.slice(0,7), message:cm.message?.split('\n')[0]?.slice(0,80), url:cm.url })),
          compareUrl: payload.compare,
          timestamp: new Date().toISOString(),
        });
      } else if (event === 'pull_request') {
        const pr = payload.pull_request;
        const icons = { opened:'🔀', closed: pr?.merged?'🎉':'✖️', reopened:'🔄', review_requested:'👀', synchronize:'📤' };
        const verb = payload.action==='closed' && pr?.merged ? 'merged' : payload.action;
        cardContent = `${icons[payload.action]||'🔀'} **${sender}** ${verb} PR #${pr?.number}: **${pr?.title}** — \`${pr?.head?.ref}\` → \`${pr?.base?.ref}\``;
        cardMeta = JSON.stringify({
          type:'pr', repo:repoName, repoUrl, sender, senderAv,
          pr:{ number:pr?.number, title:pr?.title, url:pr?.html_url, state:pr?.state,
               merged:pr?.merged, additions:pr?.additions, deletions:pr?.deletions,
               head:pr?.head?.ref, base:pr?.base?.ref },
          action: payload.action, timestamp: new Date().toISOString(),
        });
        if (payload.action==='closed' && pr?.merged)
          io.to('ws:'+wid).emit('pr:merged', { prNumber:pr?.number, by:sender });
        else if (payload.action==='opened')
          io.to('ws:'+wid).emit('pr:created', { pr });
      } else if (event === 'pull_request_review') {
        const rv = payload.review;
        const icons2 = { approved:'✅', changes_requested:'🔴', commented:'💬' };
        cardContent = `${icons2[rv?.state]||'💬'} **${sender}** ${rv?.state?.replace('_',' ')} PR #${payload.pull_request?.number}: **${payload.pull_request?.title}**`;
        cardMeta = JSON.stringify({
          type:'review', repo:repoName, repoUrl, sender, senderAv,
          review:{ state:rv?.state, body:rv?.body?.slice(0,150), url:rv?.html_url },
          timestamp: new Date().toISOString(),
        });
      } else if (event === 'issues') {
        if (['opened','closed','reopened'].includes(payload.action)) {
          const iss = payload.issue;
          const icons3 = { opened:'🐛', closed:'✅', reopened:'🔄' };
          cardContent = `${icons3[payload.action]||'🐛'} **${sender}** ${payload.action} issue #${iss?.number}: **${iss?.title}**`;
          cardMeta = JSON.stringify({
            type:'issue', repo:repoName, repoUrl, sender, senderAv,
            issue:{ number:iss?.number, title:iss?.title, url:iss?.html_url, state:iss?.state },
            timestamp: new Date().toISOString(),
          });
          // Auto-label: map issue labels to priority
          if (payload.action==='opened' && iss?.number) {
            try {
              const ghToken = process.env.GITHUB_TOKEN;
              const [owner, rname] = repoName.split('/');
              // Try to infer priority from title keywords
              const title = (iss.title||'').toLowerCase();
              const priority = title.includes('urgent')||title.includes('critical')||title.includes('hotfix') ? 'urgent' :
                               title.includes('bug')||title.includes('fix')||title.includes('broken') ? 'medium' : 'normal';
              const labelMap = { urgent:'priority: urgent', medium:'priority: medium', normal:'priority: normal' };
              await fetch('https://api.github.com/repos/'+owner+'/'+rname+'/issues/'+iss.number+'/labels', {
                method:'POST',
                headers:{ Authorization:'Bearer '+ghToken, Accept:'application/vnd.github+json', 'Content-Type':'application/json', 'User-Agent':'DevCollab-Hub/2.0' },
                body: JSON.stringify({ labels:[labelMap[priority]] }),
              }).catch(()=>{});
            } catch{}
          }
        }
      } else if (event === 'create' && payload.ref_type==='branch') {
        cardContent = '🌿 **'+sender+'** created branch `'+payload.ref+'` in **'+repoName+'**';
        cardMeta = JSON.stringify({ type:'branch', repo:repoName, repoUrl, sender, senderAv, branch:payload.ref, timestamp:new Date().toISOString() });
      } else if (event === 'release' && payload.action==='published') {
        const rel = payload.release;
        cardContent = '🚀 **'+sender+'** published release **'+( rel?.name||rel?.tag_name)+'** in **'+repoName+'**';
        cardMeta = JSON.stringify({ type:'release', repo:repoName, repoUrl, sender, senderAv, release:{ tag:rel?.tag_name, name:rel?.name, url:rel?.html_url, prerelease:rel?.prerelease }, timestamp:new Date().toISOString() });
      } else if (event === 'star' && payload.action==='created') {
        cardContent = '⭐ **'+sender+'** starred **'+repoName+'**';
        cardMeta = JSON.stringify({ type:'star', repo:repoName, repoUrl, sender, senderAv, timestamp:new Date().toISOString() });
      }

      if (cardContent && feed) {
        const m = {
          id:uuid(), channel_id:feed.id, user_id:'system',
          content_encrypted:encrypt(cardContent), type:'github_event',
          metadata: cardMeta ? encrypt(cardMeta) : null,
          created_at:new Date().toISOString(), deleted:false, edited:false,
        };
        await db.createMessage(m).catch(()=>{});
        // Emit rich card via socket
        const cardData = cardMeta ? JSON.parse(cardMeta) : {};
        io.to('ch:'+feed.id).emit('msg:new', { 
          ...m, userId:'system', content:cardContent, 
          githubCard:cardData, ts:m.created_at 
        });
        io.to('ws:'+wid).emit('github:event', { type:cardData.type, repo:repoName, sender, timestamp:new Date().toISOString() });
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
// ── NUDGE CRON: alert members with stale tasks every hour ───────────────
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { data:staleTasks } = await db.supabase()
      .from('tasks')
      .select('*, user:users!tasks_assigned_to_fkey(id,handle,display_name)')
      .in('status',['in_progress','not_started'])
      .lt('updated_at', cutoff)
      .not('assigned_to','is',null);
    for (const task of staleTasks||[]) {
      if (!task.assigned_to) continue;
      const sockets = onlineUsers.get(task.assigned_to);
      if (sockets?.size) {
        // Only nudge if they're online — otherwise it's just noise
        sockets.forEach(sid => io.to(sid).emit('notification:new', {
          type:'nudge', title:'Task needs attention ⏰',
          body:(task.title||'').slice(0,80)+' — no activity for 24h',
        }));
      }
    }
  } catch(e) { console.warn('[nudge cron]', e.message); }
}, 60*60*1000); // every hour

async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('\n❌ DATABASE CONNECTION FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Most likely cause: wrong Supabase key in Render env vars.');
    console.error('');
    console.error('Fix: Go to Supabase → Project Settings → API');
    console.error('  Copy the "service_role" secret key (NOT the anon key)');
    console.error('  Paste it as SUPABASE_SERVICE_KEY in Render → Environment');
    console.error('');
    console.error('Also check: SUPABASE_URL is correct (no trailing slash)');
    console.error('Also check: schema.sql has been run in Supabase SQL Editor');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    if (NODE_ENV === 'production') process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`\n🚀 DevCollab Hub v2.0 on :${PORT} [${NODE_ENV}]`);
    console.log(`   GitHub OAuth: /api/auth/github`);
    console.log(`   Frontend:     ${FRONTEND_URL}`);
    console.log(`   DB:           ${dbOk ? '✅ Connected' : '⚠️  Not connected'}\n`);
  });
}
start();

module.exports = { app, server, io };
