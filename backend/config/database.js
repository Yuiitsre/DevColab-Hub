'use strict';
const { createClient } = require('@supabase/supabase-js');

let _supabase;
function getDB() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    _supabase = createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } });
  }
  return _supabase;
}

async function testConnection() {
  try {
    const { error } = await getDB().from('users').select('id').limit(1);
    if (error) { console.error('DB connection failed:', error.message); return false; }
    console.log('✓ Database connected');
    return true;
  } catch(e) { console.error('DB error:', e.message); return false; }
}

// ── Generic helpers ──────────────────────────────────────────────────────────
const db = {
  supabase: () => getDB(),

  // USERS
  async userById(id) { return getDB().from('users').select('*').eq('id',id).single(); },
  async userByGithubId(gid) { return getDB().from('users').select('*').eq('github_id',String(gid)).single(); },
  async userByHandle(h) { return getDB().from('users').select('*').eq('handle',h.toLowerCase()).single(); },
  async createUser(d) { return getDB().from('users').insert([d]).select().single(); },
  async updateUser(id,d) { return getDB().from('users').update({...d,updated_at:new Date().toISOString()}).eq('id',id).select().single(); },
  async searchUsers(q, limit=20) { return getDB().from('users').select('id,handle,display_name,avatar_url,role,status').ilike('handle','%'+q+'%').limit(limit); },

  // SESSIONS
  async createSession(d) { return getDB().from('user_sessions').insert([d]).select().single(); },
  async sessionByToken(h) { return getDB().from('user_sessions').select('*').eq('token_hash',h).single(); },
  async deleteSessions(userId) { return getDB().from('user_sessions').delete().eq('user_id',userId); },
  async deleteSession(id) { return getDB().from('user_sessions').delete().eq('id',id); },
  async sessionsByUser(uid) { return getDB().from('user_sessions').select('*').eq('user_id',uid).order('created_at',{ascending:false}); },

  // WORKSPACES
  async workspaceById(id) { return getDB().from('workspaces').select('*').eq('id',id).single(); },
  async workspacesByUser(uid) {
    const { data, error } = await getDB().from('workspace_members').select('role,workspaces(*)').eq('user_id',uid);
    return { data: data?.map(r=>({...r.workspaces, my_role:r.role})), error };
  },
  async createWorkspace(d) { return getDB().from('workspaces').insert([d]).select().single(); },
  async updateWorkspace(id,d) { return getDB().from('workspaces').update(d).eq('id',id).select().single(); },
  async addWorkspaceMember(wid,uid,role) { return getDB().from('workspace_members').insert([{workspace_id:wid,user_id:uid,role,joined_at:new Date().toISOString()}]).select().single(); },
  async workspaceMembers(wid) { return getDB().from('workspace_members').select('*,user:users(id,handle,display_name,avatar_url,role,status,github_username)').eq('workspace_id',wid); },
  async workspaceMember(wid,uid) { return getDB().from('workspace_members').select('*').eq('workspace_id',wid).eq('user_id',uid).single(); },
  async updateMemberRole(wid,uid,role) { return getDB().from('workspace_members').update({role}).eq('workspace_id',wid).eq('user_id',uid).select().single(); },
  async removeMember(wid,uid) { return getDB().from('workspace_members').delete().eq('workspace_id',wid).eq('user_id',uid); },

  // TEAMS
  async teamsByWorkspace(wid) { return getDB().from('teams').select('*,members:team_members(user_id,role,user:users(id,handle,display_name,avatar_url))').eq('workspace_id',wid); },
  async teamById(id) { return getDB().from('teams').select('*').eq('id',id).single(); },
  async createTeam(d) { return getDB().from('teams').insert([d]).select().single(); },
  async updateTeam(id,d) { return getDB().from('teams').update(d).eq('id',id).select().single(); },
  async deleteTeam(id) { return getDB().from('teams').delete().eq('id',id); },
  async addTeamMember(tid,uid,role) { return getDB().from('team_members').insert([{team_id:tid,user_id:uid,role,joined_at:new Date().toISOString()}]).select().single(); },
  async removeTeamMember(tid,uid) { return getDB().from('team_members').delete().eq('team_id',tid).eq('user_id',uid); },
  async teamMember(tid,uid) { return getDB().from('team_members').select('*').eq('team_id',tid).eq('user_id',uid).single(); },

  // PROJECTS
  async projectsByWorkspace(wid) { return getDB().from('projects').select('*,members:project_members(user_id,role,user:users(id,handle,display_name,avatar_url))').eq('workspace_id',wid).order('created_at',{ascending:false}); },
  async projectById(id) { return getDB().from('projects').select('*,members:project_members(user_id,role,user:users(id,handle,display_name,avatar_url))').eq('id',id).single(); },
  async createProject(d) { return getDB().from('projects').insert([d]).select().single(); },
  async updateProject(id,d) { return getDB().from('projects').update({...d,updated_at:new Date().toISOString()}).eq('id',id).select().single(); },
  async addProjectMember(pid,uid,role) { return getDB().from('project_members').insert([{project_id:pid,user_id:uid,role,added_at:new Date().toISOString()}]).select().single(); },
  async projectMember(pid,uid) { return getDB().from('project_members').select('*').eq('project_id',pid).eq('user_id',uid).single(); },

  // TASKS
  async tasksByProject(pid) { return getDB().from('tasks').select('*,assignee:users!tasks_assigned_to_fkey(id,handle,display_name,avatar_url),assigner:users!tasks_assigned_by_fkey(id,handle,display_name,avatar_url)').eq('project_id',pid).order('created_at',{ascending:false}); },
  async tasksByAssignee(uid) { return getDB().from('tasks').select('*,assigner:users!tasks_assigned_by_fkey(id,handle,display_name)').eq('assigned_to',uid).neq('status','done').order('deadline',{ascending:true}); },
  async taskById(id) { return getDB().from('tasks').select('*,assignee:users!tasks_assigned_to_fkey(id,handle,display_name,avatar_url),assigner:users!tasks_assigned_by_fkey(id,handle,display_name,avatar_url)').eq('id',id).single(); },
  async createTask(d) { return getDB().from('tasks').insert([d]).select().single(); },
  async updateTask(id,d) { return getDB().from('tasks').update({...d,updated_at:new Date().toISOString()}).eq('id',id).select().single(); },
  async deleteTask(id) { return getDB().from('tasks').delete().eq('id',id); },

  // CHANNELS
  async channelsByWorkspace(wid) { return getDB().from('channels').select('*').eq('workspace_id',wid).eq('archived',false).order('created_at',{ascending:true}); },
  async channelById(id) { return getDB().from('channels').select('*').eq('id',id).single(); },
  async createChannel(d) { return getDB().from('channels').insert([d]).select().single(); },
  async updateChannel(id,d) { return getDB().from('channels').update(d).eq('id',id).select().single(); },
  async channelMembers(cid) { return getDB().from('channel_members').select('*,user:users(id,handle,display_name,avatar_url)').eq('channel_id',cid); },
  async addChannelMember(cid,uid) { return getDB().from('channel_members').upsert([{channel_id:cid,user_id:uid,joined_at:new Date().toISOString()}]).select().single(); },

  // MESSAGES
  async messagesByChannel(cid, limit=50, before=null) {
    let q = getDB().from('messages').select('*,user:users!messages_user_id_fkey(id,handle,display_name,avatar_url)').eq('channel_id',cid).order('created_at',{ascending:false}).limit(limit);
    if (before) q = q.lt('created_at', before);
    return q;
  },
  async messageById(id) { return getDB().from('messages').select('*,user:users!messages_user_id_fkey(id,handle,display_name,avatar_url)').eq('id',id).single(); },
  async createMessage(d) { return getDB().from('messages').insert([d]).select('*,user:users!messages_user_id_fkey(id,handle,display_name,avatar_url)').single(); },
  async updateMessage(id,d) { return getDB().from('messages').update({...d,edited:true,updated_at:new Date().toISOString()}).eq('id',id).select().single(); },
  async softDeleteMessage(id,uid) { return getDB().from('messages').update({deleted:true,content_encrypted:null,metadata:null,deleted_at:new Date().toISOString(),deleted_by:uid}).eq('id',id).select().single(); },
  async hardDeleteMessage(id) { return getDB().from('messages').delete().eq('id',id); },
  async reactions(mid) { return getDB().from('message_reactions').select('emoji,user_id').eq('message_id',mid); },
  async addReaction(mid,uid,emoji) { return getDB().from('message_reactions').upsert([{message_id:mid,user_id:uid,emoji}]); },
  async removeReaction(mid,uid,emoji) { return getDB().from('message_reactions').delete().eq('message_id',mid).eq('user_id',uid).eq('emoji',emoji); },
  async pinMessage(cid,mid,uid) { return getDB().from('message_pins').insert([{channel_id:cid,message_id:mid,pinned_by:uid,pinned_at:new Date().toISOString()}]).select().single(); },
  async unpinMessage(mid) { return getDB().from('message_pins').delete().eq('message_id',mid); },
  async pinnedMessages(cid) { return getDB().from('message_pins').select('*,message:messages(id,content_encrypted,user:users(handle,display_name))').eq('channel_id',cid).order('pinned_at',{ascending:false}); },

  // DIRECT MESSAGES
  async dmRoomById(id) { return getDB().from('direct_message_rooms').select('*').eq('id',id).single(); },
  async dmRoomByParticipants(a,b) { const id=[a,b].sort().join(':'); return getDB().from('direct_message_rooms').select('*').eq('id',id).single(); },
  async createDMRoom(a,b) { const id=[a,b].sort().join(':'); return getDB().from('direct_message_rooms').upsert([{id,participants:[a,b],created_at:new Date().toISOString()}]).select().single(); },
  async dmsByRoom(rid,limit=50) { return getDB().from('direct_messages').select('*,from_user:users!direct_messages_from_user_fkey(id,handle,display_name,avatar_url)').eq('room_id',rid).order('created_at',{ascending:false}).limit(limit); },
  async createDM(d) { return getDB().from('direct_messages').insert([d]).select().single(); },
  async deleteDM(id,uid) {
    // Fetch current deleted_for array, append uid, then update
    const { data:existing } = await getDB().from('direct_messages').select('deleted_for').eq('id',id).single();
    const arr = existing?.deleted_for || [];
    if (!arr.includes(uid)) arr.push(uid);
    return getDB().from('direct_messages').update({ deleted_for: arr }).eq('id',id);
  },
  async dmRoomsByUser(uid) { return getDB().from('direct_message_rooms').select('*').contains('participants',[uid]); },

  // REPOS
  async reposByWorkspace(wid) { return getDB().from('linked_repos').select('*').eq('workspace_id',wid); },
  async repoById(id) { return getDB().from('linked_repos').select('*').eq('id',id).single(); },
  async repoByGithubId(gid,wid) { return getDB().from('linked_repos').select('*').eq('github_repo_id',String(gid)).eq('workspace_id',wid).single(); },
  async createRepo(d) { return getDB().from('linked_repos').insert([d]).select().single(); },
  async updateRepo(id,d) { return getDB().from('linked_repos').update(d).eq('id',id).select().single(); },
  async deleteRepo(id) { return getDB().from('linked_repos').delete().eq('id',id); },

  // PULL REQUESTS
  async prsByRepo(rid) { return getDB().from('pull_requests').select('*,author:users!pull_requests_author_id_fkey(id,handle,display_name,avatar_url)').eq('repo_id',rid).order('created_at',{ascending:false}); },
  async prById(id) { return getDB().from('pull_requests').select('*,author:users!pull_requests_author_id_fkey(id,handle,display_name,avatar_url),reviews:pr_reviews(*)').eq('id',id).single(); },
  async createPR(d) { return getDB().from('pull_requests').insert([d]).select().single(); },
  async updatePR(id,d) { return getDB().from('pull_requests').update(d).eq('id',id).select().single(); },
  async addPRReview(d) { return getDB().from('pr_reviews').insert([d]).select().single(); },
  async prComments(pid) { return getDB().from('pr_comments').select('*,user:users(id,handle,display_name,avatar_url)').eq('pr_id',pid).order('created_at',{ascending:true}); },
  async addPRComment(d) { return getDB().from('pr_comments').insert([d]).select().single(); },

  // NOTIFICATIONS
  async notifsByUser(uid,limit=50) { return getDB().from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(limit); },
  async createNotif(d) { return getDB().from('notifications').insert([d]).select().single(); },
  async markNotifRead(id) { return getDB().from('notifications').update({read:true}).eq('id',id); },
  async markAllNotifsRead(uid) { return getDB().from('notifications').update({read:true}).eq('user_id',uid).eq('read',false); },

  // AUDIT LOG
  async audit(d) { return getDB().from('audit_log').insert([d]); },

  // CODE ASSIGNMENTS
  async codeAssignmentsByTask(tid) { return getDB().from('code_assignments').select('*,from_user:users!code_assignments_from_user_fkey(id,handle,display_name),to_user:users!code_assignments_to_user_fkey(id,handle,display_name)').eq('task_id',tid); },
  async codeAssignmentsByUser(uid) { return getDB().from('code_assignments').select('*,from_user:users!code_assignments_from_user_fkey(id,handle,display_name),repo:linked_repos(id,full_name)').eq('to_user',uid).eq('acknowledged',false); },
  async createCodeAssignment(d) { return getDB().from('code_assignments').insert([d]).select().single(); },
  async acknowledgeCodeAssignment(id) { return getDB().from('code_assignments').update({acknowledged:true}).eq('id',id); },
};

module.exports = { db, testConnection };
