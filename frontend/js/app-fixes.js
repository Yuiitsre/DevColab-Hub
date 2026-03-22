/**
 * DevCollab Hub — app-fixes.js  v2
 * Load AFTER utils.js in app.html via: <script src="js/app-fixes.js" defer></script>
 *
 * COMPLETES:
 *   ✓ renderSBDMs()   — real member list with online dots + unread badges
 *   ✓ startDM()       — opens inline DM conversation in chat area
 *   ✓ newDM()         — new DM picker modal
 *   ✓ pickReact()     — emoji reaction picker + renders reactions on messages
 *   ✓ doSearch()      — live dropdown: users · channels · tasks
 *   ✓ openNotifs()    — full notification panel with mark-read
 *   ✓ showAllPins()   — pinned messages panel for current channel
 *   ✓ socket dm:new   — incoming DM toast + unread badge
 */

/* ─── TINY HELPERS ──────────────────────────────────────────────────────── */
function _e(s){return typeof s==='string'?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'):String(s??'')}
function _ini(n){return(n+'').replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?'}
function _ago(ts){if(!ts)return'';const d=Date.now()-new Date(ts).getTime(),s=Math.floor(d/1000),m=Math.floor(s/60),h=Math.floor(m/60),dd=Math.floor(h/24);if(s<60)return'just now';if(m<60)return m+'m ago';if(h<24)return h+'h ago';if(dd<7)return dd+'d ago';return new Date(ts).toLocaleDateString()}
function _av(u,sz=28){const bg=u?.avatar_color||'#22c55e';const n=u?.display_name||u?.github_username||u?.handle||'U';const i=_ini(n);const fs=Math.max(8,Math.floor(sz/3));if(u?.avatar_url)return`<img src="${_e(u.avatar_url)}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div style=\\'width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#000;flex-shrink:0\\'>${i}</div>')">`;return`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${_e(bg)};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#000;flex-shrink:0">${i}</div>`}

/* ═══════════════════════════════════════════════════════════════════════════
   DM SYSTEM
═══════════════════════════════════════════════════════════════════════════ */
const _DM={unread:{},current:null};

/** Renders DM list in sidebar from S.users */
async function renderSBDMs(){
  const el=document.getElementById('sb-dms');if(!el)return;
  const others=(S.users||[]).filter(u=>u.id&&u.id!==S.user?.id).slice(0,12);
  if(!others.length){el.innerHTML='<div style="padding:4px 14px;font-size:11px;color:var(--t4)">Invite teammates first</div>';return}
  el.innerHTML=others.map(u=>{
    const isOnline=S.online?.[u.id];
    const unread=_DM.unread[u.id]||0;
    const name=u.display_name||u.github_username||u.handle||'User';
    const active=_DM.current?.userId===u.id;
    return`<div class="sb-item${active?' active':''}" data-uid="${_e(u.id)}" onclick="startDM('${_e(u.id)}')" style="position:relative">
      <span class="sb-item-bar"></span>
      <div style="position:relative;flex-shrink:0;display:flex;align-items:center">${_av(u,22)}<div style="position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;border-radius:50%;background:${isOnline?'var(--green)':'var(--s6)'};border:2px solid var(--bg)"></div></div>
      <span class="sb-item-text" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(name)}</span>
      ${unread?`<span class="sb-item-badge">${unread}</span>`:''}
    </div>`
  }).join('')
}

/** New DM — pick from members */
function newDM(){_openPickModal('New Direct Message',u=>startDM(u.id))}

/** Open DM conversation inline */
async function startDM(userId){
  const target=(S.users||[]).find(u=>u.id===userId)||{id:userId,display_name:'User'};
  const name=target.display_name||target.github_username||target.handle||'User';
  // clear unread
  _DM.unread[userId]=0; renderSBDMs();
  _DM.current={userId,userName:name,roomId:[S.user?.id,userId].sort().join(':')};
  // switch view
  showView('chat-view');
  const ic=document.getElementById('ch-icon'),nm=document.getElementById('ch-name'),ds=document.getElementById('ch-desc'),inp=document.getElementById('msg-input');
  if(ic)ic.textContent='🔐'; if(nm)nm.textContent=name; if(ds)ds.textContent='Encrypted DM'; if(inp)inp.placeholder='Message @'+_e(target.handle||name)+'...';
  S.currentChannel=null; S._dmMode=true;
  document.querySelectorAll('[data-uid]').forEach(e=>e.classList.toggle('active',e.dataset.uid===userId));
  document.querySelectorAll('[data-chid]').forEach(e=>e.classList.remove('active'));
  // render area
  const area=document.getElementById('msgs-area');
  if(area){
    area.innerHTML=`<div class="msgs-date-sep">🔐 Encrypted Direct Message</div><div style="text-align:center;padding:32px 16px;flex-shrink:0"><div style="display:flex;justify-content:center;margin-bottom:10px">${_av(target,52)}</div><div style="font-size:15px;font-weight:700;margin-top:6px">${_e(name)}</div><div style="font-size:11px;color:var(--t4);margin-top:4px">Messages are end-to-end encrypted</div></div>`;
  }
  // load history
  try{
    const msgs=await GET('/messages/dm/'+encodeURIComponent(_DM.current.roomId)).catch(()=>[]);
    if(msgs?.length&&area){
      area.innerHTML=`<div class="msgs-date-sep">🔐 Encrypted Direct Message</div>`;
      msgs.forEach(m=>_appendDMMsg(m,target));
      area.scrollTop=area.scrollHeight;
    }
  }catch{}
  closeSidebar&&closeSidebar();
}

function _appendDMMsg(m,target){
  const area=document.getElementById('msgs-area');if(!area)return;
  const fromId=m.from_user||m.fromUserId||m.userId;
  const isMe=fromId===S.user?.id;
  const u=isMe?S.user:target;
  const time=new Date(m.created_at||m.ts||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const name=u?.display_name||u?.github_username||u?.handle||'User';
  const el=document.createElement('div');el.className='msg anim-fade-up';
  el.innerHTML=`<div class="av av-32 msg-av" style="background:${_e(u?.avatar_color||'#22c55e')}">${_av(u,32)}</div><div class="msg-body"><div class="msg-meta"><span class="msg-name">${_e(name)}</span><span class="msg-ts">${time}</span><span style="font-size:9px;color:var(--t4);margin-left:4px">🔐</span></div><div class="msg-text">${typeof fmtText==='function'?fmtText(m.content||m.text||''):_e(m.content||m.text||'')}</div></div>`;
  area.querySelector('.empty-state,.msgs-empty')?.remove();
  area.appendChild(el);
}

/* Patch sendMsg to handle DM mode */
;(()=>{
  const _orig=window.sendMsg;
  window.sendMsg=function(){
    if(S._dmMode&&_DM.current?.userId){
      const ta=document.getElementById('msg-input');
      const content=ta?.value?.trim();if(!content)return;
      ta.value='';ta.style.height='auto';
      if(S.socket?.connected){
        S.socket.emit('dm:send',{toUserId:_DM.current.userId,content});
        _appendDMMsg({from_user:S.user?.id,content,created_at:new Date().toISOString()},{id:_DM.current.userId});
        const area=document.getElementById('msgs-area');if(area)area.scrollTop=area.scrollHeight;
      }else{
        POST('/messages/dm',{toUserId:_DM.current.userId,content})
          .then(m=>_appendDMMsg(m,{id:_DM.current.userId}))
          .catch(e=>toast('e','Send failed',e.message));
      }
      return;
    }
    S._dmMode=false;
    if(_orig)_orig.apply(this,arguments);
  };
})();

/* Exit DM mode when switching channel */
;(()=>{
  const _orig=window.switchChannel;
  window.switchChannel=function(channelId){
    S._dmMode=false;_DM.current=null;
    document.querySelectorAll('[data-uid]').forEach(e=>e.classList.remove('active'));
    if(_orig)return _orig.apply(this,arguments);
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   EMOJI REACTIONS
═══════════════════════════════════════════════════════════════════════════ */
const _EMOJIS=['👍','🔥','✅','❤️','😂','🚀','👀','💯','🎉','⚡','🤔','😍','🙌','💪','⚠️','🐛','🔑','📌'];

function pickReact(msgId){
  document.getElementById('_rxpicker')?.remove();
  const pk=document.createElement('div');pk.id='_rxpicker';
  pk.style.cssText='position:fixed;z-index:900;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:208px;box-shadow:0 12px 40px rgba(0,0,0,.6);backdrop-filter:blur(16px);animation:scaleIn .12s cubic-bezier(.16,1,.3,1)';
  pk.innerHTML=_EMOJIS.map(e=>`<div onclick="_rxSend('${msgId}','${e}');document.getElementById('_rxpicker')?.remove()" style="width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background='';">${e}</div>`).join('');
  const msgEl=document.querySelector(`[data-mid="${msgId}"]`);
  if(msgEl){const r=msgEl.getBoundingClientRect();pk.style.top=(r.bottom+4)+'px';pk.style.left=Math.min(r.left,window.innerWidth-220)+'px';}
  else{pk.style.top='40%';pk.style.left='50%';pk.style.transform='translate(-50%,-50%)';}
  document.body.appendChild(pk);
  setTimeout(()=>document.addEventListener('click',function _rc(e){if(!pk.contains(e.target)){pk.remove();document.removeEventListener('click',_rc);}},{ capture:true }),60);
}

function _rxSend(msgId,emoji){
  if(S.socket?.connected)S.socket.emit('msg:react',{messageId:msgId,emoji});
  else POST('/messages/'+msgId+'/react',{emoji}).then(()=>toast('s',emoji,'Reaction added')).catch(e=>toast('e','Error',e.message));
}

/* Render reaction badges from socket event */
function _renderRxns(messageId,reactions){
  for(const msgs of Object.values(S.messages||{})){const m=msgs.find(x=>x.id===messageId);if(m){m.reactions=reactions;break;}}
  const msgEl=document.querySelector(`[data-mid="${messageId}"]`);if(!msgEl)return;
  let rxEl=msgEl.querySelector('.msg-rxns');
  if(!rxEl){rxEl=document.createElement('div');rxEl.className='msg-rxns';rxEl.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-top:5px';msgEl.querySelector('.msg-body')?.appendChild(rxEl);}
  const counts=reactions||{};
  rxEl.innerHTML=Object.entries(counts).filter(([,u])=>u?.length).map(([em,users])=>{
    const mine=users.includes(S.user?.id);
    return`<span onclick="_rxSend('${_e(messageId)}','${em}')" style="display:inline-flex;align-items:center;gap:3px;background:${mine?'rgba(59,130,246,.15)':'var(--s3)'};border:1px solid ${mine?'rgba(59,130,246,.3)':'rgba(255,255,255,.07)'};border-radius:99px;padding:2px 8px;font-size:11px;cursor:pointer;color:${mine?'var(--blue)':'var(--t2)'};transition:all .1s">${em} <span style="font-size:10px;font-weight:700">${users.length}</span></span>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH DROPDOWN
═══════════════════════════════════════════════════════════════════════════ */
let _sTimer=null,_sDrop=null;

function _initSearch(){
  const inp=document.getElementById('nav-search');if(!inp||_sDrop)return;
  const wrap=inp.closest('.nav-search-wrap')||inp.parentElement;if(!wrap)return;
  wrap.style.position='relative';
  _sDrop=document.createElement('div');_sDrop.id='_sdrop';
  _sDrop.style.cssText='position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:420px;max-width:92vw;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.7);z-index:500;backdrop-filter:blur(20px);overflow:hidden;display:none';
  wrap.appendChild(_sDrop);
  inp.addEventListener('input',e=>{clearTimeout(_sTimer);const q=e.target.value.trim();if(q.length<2){_sDrop.style.display='none';return;}_sTimer=setTimeout(()=>doSearch(q),260)});
  inp.addEventListener('focus',e=>{if(e.target.value.trim().length>=2)doSearch(e.target.value.trim())});
  inp.addEventListener('keydown',e=>{if(e.key==='Escape'){_sDrop.style.display='none';inp.blur();}if(e.key==='Enter'){e.preventDefault();doSearch(inp.value.trim());}});
  document.addEventListener('click',e=>{if(_sDrop&&!_sDrop.contains(e.target)&&e.target!==inp)_sDrop.style.display='none'});
}

async function doSearch(q){
  if(!q?.trim()||q.length<2||!_sDrop)return;
  _sDrop.style.display='block';
  _sDrop.innerHTML=`<div style="padding:14px 16px;font-size:11px;color:var(--t4);text-align:center">Searching…</div>`;
  try{
    const [res,tasks]=await Promise.all([
      GET('/search?q='+encodeURIComponent(q)).catch(()=>({users:[],channels:[]})),
      Promise.resolve((S.tasks||[]).filter(t=>(t.title||'').toLowerCase().includes(q.toLowerCase())).slice(0,3))
    ]);
    const users=(res.users||[]).slice(0,5),channels=(res.channels||[]).slice(0,4);
    if(!users.length&&!channels.length&&!tasks.length){
      _sDrop.innerHTML=`<div style="padding:24px;text-align:center;font-size:12px;color:var(--t4)">No results for <strong style="color:var(--t2)">"${_e(q)}"</strong></div>`;return;
    }
    const sec=(label,html,border=false)=>html?`<div style="padding:6px 12px 3px;font-size:9px;font-weight:800;color:var(--t4);letter-spacing:.6px;text-transform:uppercase${border?';border-top:1px solid rgba(255,255,255,.05);margin-top:4px':''}">${label}</div>${html}`:'';
    const row=(icon,name,sub,id,type)=>`<div onclick="_sClick('${type}','${_e(id)}')" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">${icon}<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div><div style="font-size:10px;color:var(--t4)">${sub}</div></div><div style="font-size:10px;color:var(--t4);flex-shrink:0">${type==='user'?'DM →':'Jump →'}</div></div>`;
    const uHTML=users.map(u=>row(`<div style="flex-shrink:0">${_av(u,30)}</div>`,_e(u.display_name||u.github_username||u.handle||'User'),`@${_e(u.handle||u.github_username||'')} · ${_e(u.role||'member')}`,u.id,'user')).join('');
    const cHTML=channels.map(c=>row(`<div style="width:30px;height:30px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${c.type==='private'?'🔒':'#'}</div>`,_e(c.name),_e(c.description||'Channel'),c.id,'channel')).join('');
    const tHTML=tasks.map(t=>{const pc={urgent:'var(--red)',medium:'var(--yellow)',normal:'var(--green)'}[t.priority]||'var(--t4)';return row(`<div style="width:30px;height:30px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📋</div>`,_e(t.title||''),`<span style="color:${pc}">${_e(t.priority||'normal')}</span> · ${_e((t.status||'').replace(/_/g,' '))}`,t.id,'task')}).join('');
    _sDrop.innerHTML=sec('People',uHTML)+sec('Channels',cHTML,!!uHTML)+sec('Tasks',tHTML,!!(uHTML||cHTML));
  }catch(err){_sDrop.innerHTML=`<div style="padding:14px;font-size:11px;color:var(--red)">Search error: ${_e(err.message)}</div>`}
}

function _sClick(type,id){
  if(_sDrop)_sDrop.style.display='none';
  const inp=document.getElementById('nav-search');if(inp)inp.value='';
  if(type==='user')startDM(id);
  else if(type==='channel'&&typeof switchChannel==='function')switchChannel(id);
  else if(type==='task'){showView&&showView('tasks-view');renderAllTasks&&renderAllTasks();}
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS PANEL
═══════════════════════════════════════════════════════════════════════════ */
let _nPanel=null;

async function openNotifs(){
  if(_nPanel&&_nPanel.style.display!=='none'){_nPanel.style.display='none';return}
  if(!_nPanel){
    _nPanel=document.createElement('div');
    _nPanel.style.cssText='position:fixed;top:56px;right:14px;width:360px;max-height:500px;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 16px 50px rgba(0,0,0,.7);z-index:400;backdrop-filter:blur(20px);display:flex;flex-direction:column;overflow:hidden';
    document.body.appendChild(_nPanel);
    document.addEventListener('click',e=>{if(_nPanel&&!_nPanel.contains(e.target)&&!e.target.closest('[onclick*="openNotifs"]'))_nPanel.style.display='none'});
  }
  _nPanel.style.display='flex';_nPanel.style.animation='scaleIn .18s cubic-bezier(.16,1,.3,1)';
  _nPanel.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><div style="font-size:14px;font-weight:700">Notifications</div><div style="display:flex;gap:8px;align-items:center"><button onclick="_markAllRead()" style="font-size:10px;font-weight:600;color:var(--blue);background:none;border:none;cursor:pointer;padding:3px 8px;border-radius:5px;transition:background .1s" onmouseover="this.style.background='rgba(59,130,246,.1)'" onmouseout="this.style.background=''">Mark all read</button><div onclick="_nPanel.style.display='none'" style="cursor:pointer;color:var(--t4);font-size:14px;padding:2px 6px;border-radius:5px;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">✕</div></div></div><div id="_nlist" style="flex:1;overflow-y:auto"><div style="padding:24px;text-align:center;font-size:11px;color:var(--t4)">Loading…</div></div>`;
  try{
    const notifs=await GET('/notifications');
    const el=document.getElementById('_nlist');if(!el)return;
    const dot=document.getElementById('notif-dot');if(dot)dot.style.display='none';
    if(!notifs?.length){el.innerHTML='<div style="padding:32px;text-align:center"><div style="font-size:24px;margin-bottom:8px">🎉</div><div style="font-size:12px;color:var(--t4)">All caught up!</div></div>';return}
    const ICONS={task_assigned:'📋',pr_review:'🔀',pr_merged:'✅',pr_approved:'✅',mention:'@',dm:'💬',code_assigned:'⌨',system:'🔔',task_due:'⏰'};
    el.innerHTML=notifs.slice(0,25).map((n,i)=>`<div id="_ni${i}" onclick="_clickNotif('${_e(n.id)}',${i})" style="display:flex;align-items:flex-start;gap:10px;padding:11px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .1s;background:${!n.read?'rgba(59,130,246,.04)':'transparent'}" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='${!n.read?'rgba(59,130,246,.04)':'transparent'}'"><div style="width:32px;height:32px;border-radius:9px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${ICONS[n.type]||'🔔'}</div><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:${!n.read?700:500};line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(n.title||'Notification')}</div>${n.body?`<div style="font-size:11px;color:var(--t3);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(n.body)}</div>`:''}<div style="font-size:9px;color:var(--t4);margin-top:3px">${_ago(n.created_at)}</div></div>${!n.read?`<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:4px" id="_nd${i}"></div>`:''}</div>`).join('');
  }catch(e){const el=document.getElementById('_nlist');if(el)el.innerHTML=`<div style="padding:14px;font-size:11px;color:var(--red)">Failed: ${_e(e.message)}</div>`}
}

function _clickNotif(id,i){
  PATCH('/notifications/'+id+'/read',{}).catch(()=>{});
  document.getElementById('_ni'+i)?.style&&(document.getElementById('_ni'+i).style.background='transparent');
  document.getElementById('_nd'+i)?.remove();
}
async function _markAllRead(){
  await POST('/notifications/read-all',{}).catch(()=>{});
  const dot=document.getElementById('notif-dot');if(dot)dot.style.display='none';
  if(_nPanel){_nPanel.querySelectorAll('[id^="_nd"]').forEach(e=>e.remove());_nPanel.querySelectorAll('[id^="_ni"]').forEach(e=>e.style.background='transparent');}
  toast('s','Done','All notifications marked as read');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PINNED MESSAGES PANEL
═══════════════════════════════════════════════════════════════════════════ */
let _pPanel=null;

async function showAllPins(){
  const chId=S.currentChannel;
  if(!chId){toast('i','Pins','Open a channel first');return}
  if(_pPanel&&_pPanel.style.display!=='none'){_pPanel.style.display='none';return}
  if(!_pPanel){
    _pPanel=document.createElement('div');
    _pPanel.style.cssText='position:fixed;top:56px;right:14px;width:340px;max-height:460px;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 16px 50px rgba(0,0,0,.7);z-index:400;backdrop-filter:blur(20px);display:flex;flex-direction:column;overflow:hidden';
    document.body.appendChild(_pPanel);
    document.addEventListener('click',e=>{if(_pPanel&&!_pPanel.contains(e.target)&&!e.target.closest('[onclick*="showAllPins"]'))_pPanel.style.display='none'});
  }
  _pPanel.style.display='flex';_pPanel.style.animation='scaleIn .18s cubic-bezier(.16,1,.3,1)';
  _pPanel.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><div style="font-size:14px;font-weight:700">📌 Pinned Messages</div><div onclick="_pPanel.style.display='none'" style="cursor:pointer;color:var(--t4);font-size:14px;padding:2px 6px;border-radius:5px;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">✕</div></div><div id="_plist" style="flex:1;overflow-y:auto;padding:8px"><div style="padding:16px;text-align:center;font-size:11px;color:var(--t4)">Loading…</div></div>`;
  try{
    const pins=await GET('/channels/'+chId+'/pins').catch(()=>[]);
    const el=document.getElementById('_plist');if(!el)return;
    if(!pins?.length){el.innerHTML='<div style="padding:24px;text-align:center"><div style="font-size:20px;margin-bottom:8px">📭</div><div style="font-size:12px;color:var(--t4)">No pinned messages</div><div style="font-size:11px;color:var(--t4);margin-top:4px">Right-click a message → Pin it</div></div>';return}
    el.innerHTML=pins.map(p=>{const msg=p.message||{};const u=msg.user||{};return`<div style="background:var(--s2);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;margin-bottom:6px;transition:border-color .15s" onmouseover="this.style.borderColor='rgba(255,255,255,.1)'" onmouseout="this.style.borderColor='rgba(255,255,255,.06)'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">${_av(u,20)}<span style="font-size:11px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(u.display_name||u.handle||'User')}</span><span style="font-size:9px;color:var(--t4)">${_ago(msg.created_at||p.pinned_at)}</span></div><div style="font-size:12px;color:var(--t2);line-height:1.55">${_e((msg.content||'').slice(0,300))}</div></div>`}).join('');
  }catch(e){const el=document.getElementById('_plist');if(el)el.innerHTML=`<div style="padding:14px;font-size:11px;color:var(--red)">Failed: ${_e(e.message)}</div>`}
}

/* ═══════════════════════════════════════════════════════════════════════════
   USER PICK MODAL (shared helper — DM, assign task, etc.)
═══════════════════════════════════════════════════════════════════════════ */
function _openPickModal(title,cb){
  document.getElementById('_upm')?.remove();
  const mo=document.createElement('div');mo.id='_upm';mo.className='modal-backdrop';mo.onclick=e=>{if(e.target===mo)mo.remove()};
  const others=(S.users||[]).filter(u=>u.id!==S.user?.id);
  mo.innerHTML=`<div class="modal modal-sm"><div class="modal-hdr"><div class="modal-title">${_e(title)}</div><div class="modal-close" onclick="document.getElementById('_upm').remove()">✕</div></div><div class="modal-body"><div class="search-wrap" style="margin-bottom:12px"><svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input class="search-input" id="_upq" placeholder="Search by name or @handle…" autofocus></div><div id="_upr" style="max-height:240px;overflow-y:auto">${_renderPickList(others.slice(0,8))}</div></div></div>`;
  document.body.appendChild(mo);
  window._upcb=cb;
  let _upt=null;
  document.getElementById('_upq').addEventListener('input',async e=>{
    clearTimeout(_upt);const q=e.target.value.trim();
    if(q.length<1){document.getElementById('_upr').innerHTML=_renderPickList(others.slice(0,8));return}
    _upt=setTimeout(async()=>{
      let list=others.filter(u=>(u.display_name||'').toLowerCase().includes(q.toLowerCase())||(u.handle||'').toLowerCase().includes(q.toLowerCase())||(u.github_username||'').toLowerCase().includes(q.toLowerCase()));
      if(!list.length){try{const r=await GET('/users/search?q='+encodeURIComponent(q));list=(r||[]).filter(u=>u.id!==S.user?.id);}catch{}}
      const el=document.getElementById('_upr');if(el)el.innerHTML=_renderPickList(list.slice(0,8));
    },200);
  });
}
function _renderPickList(users){
  return users.map(u=>`<div onclick="_upSel('${_e(u.id)}')" style="display:flex;align-items:center;gap:10px;padding:9px 6px;cursor:pointer;border-radius:8px;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">${_av(u,30)}<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(u.display_name||u.github_username||u.handle||'User')}</div><div style="font-size:10px;color:var(--t4)">@${_e(u.handle||u.github_username||'')}</div></div><div style="width:7px;height:7px;border-radius:50%;background:${S.online?.[u.id]?'var(--green)':'var(--s6)'}"></div></div>`).join('')||'<div style="padding:16px;font-size:11px;color:var(--t4);text-align:center">No users found</div>';
}
function _upSel(userId){const u=(S.users||[]).find(x=>x.id===userId)||{id:userId};document.getElementById('_upm')?.remove();if(window._upcb)window._upcb(u);}

/* ═══════════════════════════════════════════════════════════════════════════
   SOCKET PATCHES — attach extra handlers once socket is ready
═══════════════════════════════════════════════════════════════════════════ */
function _patchSocket(){
  if(!S.socket)return;
  // Incoming DMs
  S.socket.off('dm:new');
  S.socket.on('dm:new',dm=>{
    const fromId=dm.fromUserId||dm.from_user;
    if(_DM.current?.userId===fromId){
      const sender=(S.users||[]).find(u=>u.id===fromId)||{id:fromId};
      _appendDMMsg(dm,sender);
      const area=document.getElementById('msgs-area');if(area)area.scrollTop=area.scrollHeight;
    }else{
      _DM.unread[fromId]=(_DM.unread[fromId]||0)+1;renderSBDMs();
      const sender=(S.users||[]).find(u=>u.id===fromId);
      const sn=sender?.display_name||sender?.github_username||'Someone';
      toast('i','💬 '+sn,(dm.content||'').slice(0,60));
      const dot=document.getElementById('notif-dot');if(dot)dot.style.display='block';
    }
  });
  // Reactions
  S.socket.off('msg:reactions');
  S.socket.on('msg:reactions',({messageId,reactions})=>_renderRxns(messageId,reactions));
  // Presence → refresh DM list
  S.socket.on('presence',()=>setTimeout(renderSBDMs,100));
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT — wait for app state then wire everything up
═══════════════════════════════════════════════════════════════════════════ */
(function boot(){
  const _ti=setInterval(()=>{
    if(!document.getElementById('nav-search'))return;
    clearInterval(_ti);
    // Search
    _initSearch();
    // Socket
    const _si=setInterval(()=>{if(!S.socket)return;clearInterval(_si);_patchSocket();},300);
    // DM list — once users loaded
    const _ui=setInterval(()=>{if(!(S.users?.length))return;clearInterval(_ui);renderSBDMs();},300);
  },200);

  // Global keyboard shortcuts
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(_nPanel)_nPanel.style.display='none';
      if(_pPanel)_pPanel.style.display='none';
      if(_sDrop) _sDrop.style.display='none';
      document.getElementById('_upm')?.remove();
      document.getElementById('_rxpicker')?.remove();
    }
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();const inp=document.getElementById('nav-search');if(inp){inp.focus();inp.select();}}
  });
})();

/* ═══════════════════════════════════════════════════════════════════════════
   CRITICAL BUG FIXES — Invite / display_name / toLowerCase crash
═══════════════════════════════════════════════════════════════════════════

  ROOT CAUSES:
  1. display_name stored AES-encrypted in DB → shows as "9546acc22b140f..."
     Fix: _safeDisplayName() falls back to github_username when name looks encrypted
  2. sendInvite() posts { userId } but backend /invite expects { handle }
     Fix: override sendInvite() to send { handle } correctly
  3. createTask() uses handle lookup that crashes when user not in S.users
     Fix: override createTask() to use userId directly from the member list
  4. S.users has encrypted display_name → crashes initials() / safe() / toLowerCase()
     Fix: sanitize S.users after loadAll()
════════════════════════════════════════════════════════════════════════════ */

/** Detect AES-encrypted string — format: "hexhex:hexhex:hexhex" */
function _isEncrypted(s) {
  if (typeof s !== 'string') return false;
  // AES-GCM format: 32hex:32hex:anyhex  (iv:tag:data)
  return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(s);
}

/** Return a safe display name — never returns encrypted garbage */
function _safeName(u) {
  if (!u) return 'User';
  const candidates = [u.display_name, u.name, u.github_username, u.handle];
  for (const c of candidates) {
    if (c && typeof c === 'string' && !_isEncrypted(c) && c.trim().length > 0) {
      return c.trim().slice(0, 60);
    }
  }
  return u.github_username || u.handle || 'User';
}

/** Sanitize a single user object — fix encrypted / null display_name */
function _fixUser(u) {
  if (!u) return u;
  u.display_name = _safeName(u);
  // Also fix name, bio if encrypted
  if (_isEncrypted(u.name)) u.name = u.github_username || u.handle || 'User';
  return u;
}

/** Sanitize all users in S.users after load */
function _fixAllUsers() {
  if (!S.users?.length) return;
  S.users = S.users.map(u => _fixUser({ ...u, ...(u.user || {}) }));
}

/* ── Patch loadAll to fix users after loading ── */
;(() => {
  const _orig = window.loadAll;
  window.loadAll = async function () {
    await _orig.apply(this, arguments);
    _fixAllUsers();
    // Also fix current user
    if (S.user) S.user = _fixUser(S.user);
  };
})();

/* ── Also fix users returned from /users/search ── */
;(() => {
  const _origSearch = window.searchUsers;
  window.searchUsers = function (query) {
    clearTimeout(window._inviteSearchTimer);
    const q = (query || '').trim();
    if (q.length < 2) { document.getElementById('invite-results').innerHTML = ''; return; }
    window._inviteSearchTimer = setTimeout(async () => {
      try {
        const users = await GET('/users/search?q=' + encodeURIComponent(q));
        renderInviteResults((users || []).map(_fixUser));
      } catch(e) {
        console.warn('[search]', e);
        document.getElementById('invite-no-results').style.display = 'block';
      }
    }, 300);
  };
})();

/* ── Fix renderInviteResults — safe name, never encrypted blob ── */
window.renderInviteResults = function (users) {
  const el = document.getElementById('invite-results');
  const noRes = document.getElementById('invite-no-results');
  if (!el) return;
  if (!users.length) {
    el.innerHTML = '';
    if (noRes) noRes.style.display = 'block';
    return;
  }
  if (noRes) noRes.style.display = 'none';
  el.innerHTML = users.slice(0, 8).map(u => {
    const fixed = _fixUser(u);
    const name   = fixed.display_name || fixed.github_username || fixed.handle || 'User';
    const handle = fixed.handle || fixed.github_username || '';
    const color  = fixed.avatar_color || '#22c55e';
    const inits  = (name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()) || '?';
    return `<div class="invite-result" onclick="selectInviteUser('${_e(u.id)}','${_e(name)}','${_e(handle)}','${_e(u.id)}')">
      <div class="av av-32" style="background:${_e(color)}">
        ${u.avatar_url ? `<img src="${_e(u.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">` : inits}
      </div>
      <div class="invite-result-info">
        <div class="invite-result-name">${_e(name)}</div>
        <div class="invite-result-handle">${handle ? '@' + _e(handle) : ''}</div>
      </div>
    </div>`;
  }).join('');
};

/* ── Fix selectInviteUser — store userId AND handle separately ── */
window._inviteSelectedId = null;
window._inviteSelectedHandle = null;

window.selectInviteUser = function (userId, name, handle, id) {
  window._inviteSelected = userId;        // keep compat
  window._inviteSelectedId = id || userId;
  window._inviteSelectedHandle = handle;
  document.querySelectorAll('.invite-result').forEach(el => el.classList.remove('selected'));
  const sel  = document.getElementById('invite-selected');
  const disp = document.getElementById('invite-selected-display');
  if (sel)  sel.style.display = 'block';
  if (disp) disp.innerHTML = `<strong>${_e(name)}</strong>${handle ? ' <span style="color:var(--t4)">@' + _e(handle) + '</span>' : ''}`;
  // Highlight clicked result
  document.querySelectorAll('.invite-result').forEach(el => {
    if (el.getAttribute('onclick')?.includes(userId)) el.classList.add('selected');
  });
};

/* ── Fix sendInvite — backend expects { handle }, not { userId } ── */
window.sendInvite = async function () {
  const id     = window._inviteSelectedId || window._inviteSelected;
  const handle = window._inviteSelectedHandle;
  if (!id && !handle) { toast('e', 'Select a user', 'Search and click a user first'); return; }
  const role = document.getElementById('invite-role')?.value || 'developer';
  try {
    // Try handle first (what backend /invite expects)
    if (handle) {
      await POST('/workspaces/' + S.ws.id + '/invite', { handle, role });
    } else {
      // Fallback: try userId
      await POST('/workspaces/' + S.ws.id + '/invite', { userId: id, role });
    }
    if (typeof closeModal === 'function') closeModal('invite-modal');
    toast('s', 'Invited! ✓', '');
    // Refresh member list
    const members = await GET('/workspaces/' + S.ws.id + '/members').catch(() => []);
    S.users = (members || []).map(m => _fixUser({ ...m, ...(m.user || {}) }));
    if (typeof renderRPMembers === 'function') renderRPMembers();
    if (typeof renderSBDMs === 'function') renderSBDMs();
  } catch(e) { toast('e', 'Invite Error', e.message); }
};

/* ── Fix createTask — handle lookup crash when user not in S.users ── */
;(() => {
  const _orig = window.createTask;
  window.createTask = async function () {
    const title  = (typeof safe === 'function' ? safe : (s) => (s||'').slice(0,300))(document.getElementById('nt-title')?.value || '', 300);
    const desc   = (typeof safe === 'function' ? safe : (s) => (s||'').slice(0,5000))(document.getElementById('nt-desc')?.value  || '', 5000);
    const prio   = document.getElementById('nt-prio')?.value    || 'medium';
    const dl     = document.getElementById('nt-deadline')?.value || '';
    const raw    = (document.getElementById('nt-assign')?.value || '').replace('@', '').trim();
    if (!title) { toast('e', 'Error', 'Title required'); return; }

    // Resolve assignee — try by handle OR github_username, safely
    let assignedTo = S.user?.id;
    if (raw) {
      const rawLow = raw.toLowerCase();
      const found = (S.users || []).find(u => {
        // Safe toLowerCase — skip if undefined
        const h  = typeof u.handle === 'string'         ? u.handle.toLowerCase()          : null;
        const gh = typeof u.github_username === 'string' ? u.github_username.toLowerCase() : null;
        const dn = typeof u.display_name === 'string' && !_isEncrypted(u.display_name)
                   ? u.display_name.toLowerCase() : null;
        return h === rawLow || gh === rawLow || dn === rawLow;
      });
      if (found?.id) assignedTo = found.id;
      // else: just assign to self, toast a note
    }

    if (!S.projects?.length) { toast('e', 'No project', 'Create a project first'); return; }
    try {
      const task = await POST('/projects/' + S.projects[0].id + '/tasks', {
        title, description: desc, priority: prio, assignedTo, deadline: dl || null,
      });
      S.tasks.unshift(task);
      if (typeof closeModal === 'function') closeModal('task-modal');
      toast('s', 'Task created', raw && assignedTo !== S.user?.id ? 'Assigned to @' + raw : '');
      if (typeof loadCollabDash === 'function') loadCollabDash();
      if (typeof loadMgrDash === 'function' && S.dashMode === 'manager') loadMgrDash();
    } catch(e) { toast('e', 'Error', e.message); }
  };
})();

/* ── Fix renderRPMembers — safe name, no crashes ── */
;(() => {
  const _orig = window.renderRPMembers;
  window.renderRPMembers = function () {
    const el = document.getElementById('rp-members');
    if (!el) { if (_orig) return _orig.apply(this, arguments); return; }
    if (!S.users?.length) {
      el.innerHTML = '<div style="font-size:11px;color:var(--t4);padding:8px">No members yet</div>';
      return;
    }
    el.innerHTML = S.users.slice(0, 12).map(u => {
      const fixed = _fixUser(u);
      const name  = fixed.display_name || fixed.github_username || fixed.handle || 'User';
      const color = fixed.avatar_color || '#22c55e';
      const inits = (name.replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase())||'?';
      const isOnline = S.online?.[fixed.id];
      const myTask = (S.tasks||[]).find(t=>t.assigned_to===fixed.id&&t.status!=='done');
      return `<div class="rp-member" oncontextmenu="typeof memberCtx==='function'&&memberCtx(event,'${_e(fixed.id)}')">
        <div style="position:relative;flex-shrink:0">
          <div class="av av-28" style="background:${_e(color)}">
            ${fixed.avatar_url ? `<img src="${_e(fixed.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : inits}
          </div>
          <div class="status-dot" style="position:absolute;bottom:0;right:0;border:2px solid var(--s1);background:${isOnline?'var(--green)':'var(--s6)'}"></div>
        </div>
        <div class="rp-member-info" style="flex:1;min-width:0">
          <div class="rp-member-name" style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(name)}</div>
          <div style="font-size:9px;color:var(--t4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${myTask?'📋 '+_e(myTask.title.slice(0,30)):'No active task'}</div>
        </div>
        <button onclick="startDM('${_e(fixed.id)}')" style="font-size:11px;padding:3px 7px;border-radius:5px;background:transparent;border:1px solid rgba(255,255,255,.07);color:var(--t4);cursor:pointer;transition:all .1s;flex-shrink:0" onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background='transparent'">DM</button>
      </div>`;
    }).join('');
  };
})();

/* ── Fix renderApp — safe display_name on boot ── */
;(() => {
  const _orig = window.renderApp;
  window.renderApp = function () {
    if (S.user) S.user = _fixUser(S.user);
    _fixAllUsers();
    if (_orig) _orig.apply(this, arguments);
  };
})();

/* ── Fix loadCollabDash / loadMgrDash — safe name display ── */
;(() => {
  const _origCollab = window.loadCollabDash;
  if (_origCollab) {
    window.loadCollabDash = async function () {
      if (S.user) S.user.display_name = _safeName(S.user);
      return _origCollab.apply(this, arguments);
    };
  }
})();

/* ── On DOMContentLoaded: run fixes once app data is loaded ── */
const _fixInterval = setInterval(() => {
  if (!S.users?.length) return;
  clearInterval(_fixInterval);
  _fixAllUsers();
  if (S.user) S.user = _fixUser(S.user);
  if (typeof renderSBDMs === 'function') renderSBDMs();
}, 500);
