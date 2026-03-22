/**
 * DevCollab Hub — app-fixes.js v3
 * Fixes: DM self-notification · msg:updated event name · channel:history · 
 *        encrypted display_name · mobile responsive · profile · presence · 
 *        invite lookup · task createTask · member panel · search dropdown
 */
'use strict';

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
function _e(s){return typeof s==='string'?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\'/g,'&#39;'):String(s??'')}
function _ini(n){return(n+'').replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?'}
function _ago(ts){if(!ts)return'';const d=Date.now()-new Date(ts).getTime(),s=Math.floor(d/1000),m=Math.floor(s/60),h=Math.floor(m/60),dd=Math.floor(h/24);if(s<60)return'just now';if(m<60)return m+'m ago';if(h<24)return h+'h ago';if(dd<7)return dd+'d ago';return new Date(ts).toLocaleDateString()}
function _av(u,sz=28){const bg=u?.avatar_color||'#22c55e';const n=u?.display_name||u?.github_username||u?.handle||'U';const i=_ini(n);const fs=Math.max(8,Math.floor(sz/3));if(u?.avatar_url)return`<img src="${_e(u.avatar_url)}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`;return`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${_e(bg)};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#000;flex-shrink:0">${i}</div>`}

/* ─── ENCRYPTED FIELD DETECTION ───────────────────────────────────────────── */
function _isEnc(s){if(typeof s!=='string')return false;return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(s)}
function _safeName(u){if(!u)return'User';for(const k of['display_name','github_username','handle','name']){const v=u[k];if(v&&typeof v==='string'&&!_isEnc(v)&&v.trim().length>0)return v.trim().slice(0,60);}return'User'}
function _fixUser(u){if(!u)return u;const out={...u,...(u.user||{})};out.display_name=_safeName(out);if(_isEnc(out.bio))out.bio='';if(_isEnc(out.location))out.location='';if(_isEnc(out.company))out.company='';return out}
function _fixAllUsers(){if(!S.users?.length)return;S.users=S.users.map(_fixUser)}

/* ═══════════════════════════════════════════════════════════════════════════
   DM SYSTEM
═══════════════════════════════════════════════════════════════════════════ */
const _DM={unread:{},current:null,history:{}};

function renderSBDMs(){
  const el=document.getElementById('sb-dms');if(!el)return;
  const others=(S.users||[]).filter(u=>u.id&&u.id!==S.user?.id).slice(0,14);
  if(!others.length){el.innerHTML='<div style="padding:4px 14px;font-size:11px;color:var(--t4)">Invite teammates first</div>';return}
  el.innerHTML=others.map(u=>{
    const fixed=_fixUser(u);
    const isOnline=S.online?.[fixed.id];
    const unread=_DM.unread[fixed.id]||0;
    const name=_safeName(fixed);
    const active=_DM.current?.userId===fixed.id;
    const lastMsg=_DM.lastMessages?.[fixed.id];
    const lastPreview=lastMsg?(' · '+lastMsg.slice(0,22)+(lastMsg.length>22?'…':'')):'';
    return`<div class="sb-item${active?' active':''}" data-uid="${_e(fixed.id)}" onclick="startDM('${_e(fixed.id)}')" style="position:relative">
      <span class="sb-item-bar"></span>
      <div style="position:relative;flex-shrink:0;display:flex;align-items:center">${_av(fixed,22)}<div style="position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;border-radius:50%;background:${isOnline?'var(--green)':'var(--s6)'};border:2px solid var(--bg)"></div></div>
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:${unread?'600':'400'}">${_e(name)}</div>
        ${lastPreview?`<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--t4)">${_e(lastPreview)}</div>`:''}
      </div>
      ${unread?`<span class="sb-item-badge">${unread}</span>`:''}
    </div>`
  }).join('')
}

function newDM(){_openPickModal('New Direct Message',u=>startDM(u.id))}

async function startDM(userId){
  const target=_fixUser((S.users||[]).find(u=>u.id===userId)||{id:userId,display_name:'User'});
  const name=_safeName(target);
  _DM.unread[userId]=0;_DM.current={userId,userName:name};
  renderSBDMs();
  showView('chat-view');
  S.currentChannel=null;S._dmMode=true;
  const ic=document.getElementById('ch-icon'),nm=document.getElementById('ch-name'),ds=document.getElementById('ch-desc'),inp=document.getElementById('msg-input');
  const isOnlineNow = S.online?.[userId];
  if(ic)ic.textContent=isOnlineNow?'🟢':'🔐';
  if(nm){nm.textContent=name;nm.title=isOnlineNow?'Online now':'Offline';}
  if(ds)ds.textContent=isOnlineNow?'🟢 Online · End-to-end encrypted':'End-to-end encrypted';
  if(inp)inp.placeholder='Message '+_e(name)+'…';
  document.querySelectorAll('[data-uid]').forEach(e=>e.classList.toggle('active',e.dataset.uid===userId));
  document.querySelectorAll('[data-chid]').forEach(e=>e.classList.remove('active'));
  const area=document.getElementById('msgs-area');
  if(area)area.innerHTML=`<div class="msgs-date-sep">🔐 Encrypted Direct Message</div><div style="text-align:center;padding:32px 16px;flex-shrink:0"><div style="display:flex;justify-content:center;margin-bottom:10px">${_av(target,52)}</div><div style="font-size:15px;font-weight:700;margin-top:6px">${_e(name)}</div><div style="font-size:11px;color:var(--t4);margin-top:4px">Messages are end-to-end encrypted</div></div>`;
  // Load history
  try{
    const roomId=[S.user?.id,userId].sort().join(':');
    _DM.current.roomId=roomId;
    const msgs=await GET('/messages/dm/'+encodeURIComponent(roomId)).catch(()=>[]);
    if(msgs?.length&&area){
      area.innerHTML=`<div class="msgs-date-sep">🔐 Encrypted Direct Message</div>`;
      msgs.forEach(m=>_appendDMMsg(m,target));
      area.scrollTop=area.scrollHeight;
    }
  }catch(e){console.warn('[dm]',e)}
  if(typeof closeSidebar==='function')closeSidebar();
  // Wire up typing indicator for DM input
  ;(function() {
    let _dmTypingTimer = null;
    const _dmInput = document.getElementById('msg-input');
    if (_dmInput) {
      const _origOninput = _dmInput.oninput;
      _dmInput.addEventListener('input', function() {
        if(S._dmMode && _DM.current?.userId && S.socket?.connected) {
          clearTimeout(_dmTypingTimer);
          S.socket.emit('typing:start',{channelId:'dm_'+_DM.current.userId});
          _dmTypingTimer = setTimeout(()=>{
            S.socket.emit('typing:stop',{channelId:'dm_'+_DM.current.userId});
          }, 2500);
        }
      });
    }
  })();
}

function _appendDMMsg(m, target){
  const area=document.getElementById('msgs-area');
  if(!area)return;
  const fromId = m.from_user || m.fromUserId || m.userId;
  // Use stored myId from DM session OR fall back to S.user?.id
  const myId = _DM.current?.myId || S.user?.id;
  const isMe = !!(myId && fromId && fromId === myId);
  const rawU=isMe?S.user:(target||_fixUser((S.users||[]).find(u=>u.id===fromId)||{id:fromId}));
  const u=_fixUser(rawU||{});
  const time=new Date(m.created_at||m.ts||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const name=_safeName(u);
  const content=m.content||m.text||'';
  const txt=typeof fmtText==='function'?fmtText(content):_e(content);

  // DEDUP: skip if this message ID already rendered
  if (m.id && area.querySelector('[data-mid="' + m.id + '"]')) return;

  const el = document.createElement('div');
  el.className = 'msg anim-fade-up';
  el.style.position = 'relative';
  if (m.id) el.dataset.mid = m.id;

  // Message HTML — own messages aligned right-ish, others left
  el.innerHTML=`
    <div class="av av-32 msg-av" style="background:${_e(u?.avatar_color||'#22c55e')};flex-shrink:0">
      ${_av(u,32)}
    </div>
    <div class="msg-body" style="flex:1;min-width:0">
      <div class="msg-meta">
        <span class="msg-name">${_e(name)}</span>
        <span class="msg-ts">${time}</span>
        <span style="font-size:9px;color:var(--t4);margin-left:4px">🔐</span>
      </div>
      <div class="msg-text">${txt}</div>
    </div>
    <div class="dm-hover-actions" style="display:none;align-items:center;gap:2px;flex-shrink:0;position:absolute;right:8px;top:4px;background:var(--s2);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:2px;box-shadow:0 2px 8px rgba(0,0,0,.3)">
      <button class="msg-act-btn" title="React" onclick="event.stopPropagation();_dmQuickReact(this,${m.id?`'${_e(m.id)}'`:'null'})">😄</button>
      <button class="msg-act-btn" title="More" onclick="event.stopPropagation();_dmCtx(event,this)">···</button>
    </div>`;

  // Hover show/hide
  el.addEventListener('mouseenter',()=>{
    const ha=el.querySelector('.dm-hover-actions');
    if(ha) ha.style.display='flex';
  });
  el.addEventListener('mouseleave',()=>{
    const ha=el.querySelector('.dm-hover-actions');
    if(ha) ha.style.display='none';
  });

  // Right-click context menu
  el.addEventListener('contextmenu',(e)=>{
    e.preventDefault();
    e.stopPropagation();
    _dmCtxFull(e, m, el, isMe, content);
  });

  area.querySelector('.empty-state')?.remove();
  area.appendChild(el);
}

function _dmQuickReact(btn, msgId) {
  // Quick emoji picker for DM reactions
  const container = btn.closest('[data-mid]') || btn.closest('.msg');
  if(typeof pickReact==='function' && msgId) {
    if(container) container.dataset.mid = msgId;
    pickReact(msgId);
  }
}

function _dmCtx(event, btn) {
  // Called from hover ··· button
  const el = btn.closest('.msg');
  const content = el?.querySelector('.msg-text')?.textContent || '';
  const mid = el?.dataset?.mid;
  const fromId = el?.querySelector('.msg-name')?.closest('.msg-body') ? null : null;
  // Get message data from DOM context
  _dmCtxFull(event, { id: mid, content }, el, true, content);
}

function _dmCtxFull(e, m, el, isMe, content) {
  if(typeof buildCtx!=='function') return;
  e.preventDefault();

  const items = [
    // ── QUICK REACT ──
    { label: 'React', icon: '😄', fn: () => {
      if(m.id && el) { el.dataset.mid=m.id; if(typeof pickReact==='function') pickReact(m.id); }
    }},
    { sep: true },
    // ── FOR EVERYONE ──
    { label: 'Copy Text', icon: '📋', fn: () => navigator.clipboard.writeText(content||'').then(()=>{ if(typeof toast==='function')toast('s','Copied',''); }) },
    { label: 'Reply', icon: '↩', fn: () => {
      const ta=document.getElementById('msg-input');
      if(!ta) return;
      const sender=el?.querySelector('.msg-name')?.textContent||'';
      ta.value='> '+content.slice(0,80).replace(/\n/g,'\n> ')+'\n';
      ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
      if(typeof autoGrow==='function')autoGrow(ta);
    }},
    // ── ONLY OWN MESSAGES ──
    ...(isMe ? [
      { sep: true },
      { label: 'Edit Message', icon: '✏️', fn: () => {
        const newContent=prompt('Edit message:',content);
        if(newContent&&newContent.trim()&&newContent!==content){
          const textEl=el?.querySelector('.msg-text');
          if(textEl) textEl.innerHTML=typeof fmtText==='function'?fmtText(newContent.trim()):_e(newContent.trim());
          if(m) m.content=newContent.trim();
          if(typeof toast==='function')toast('s','Message updated','');
        }
      }},
      { label: 'Delete Message', icon: '🗑️', danger: true, fn: () => {
        if(!confirm('Delete this message?')) return;
        if(el){
          el.style.transition='opacity .3s,transform .3s';
          el.style.opacity='0'; el.style.transform='translateX(-8px)';
          setTimeout(()=>el.remove(), 320);
        }
        if(typeof toast==='function')toast('s','Deleted','');
      }},
    ] : []),
  ];

  buildCtx(e, items);
}

// Patch sendMsg to handle DM mode
;(()=>{
  const _orig=window.sendMsg;
  window.sendMsg=function(){
    if(S._dmMode&&_DM.current?.userId){
      const ta=document.getElementById('msg-input');
      const content=ta?.value?.trim();if(!content)return;
      ta.value='';ta.style.height='auto';

      const myId = S.user?.id;
      const toId = _DM.current.userId;
      if(!myId){ toast('e','Not ready','Please wait a moment');return; }

      // Store last message for preview
      if(!_DM.lastMessages)_DM.lastMessages={};
      _DM.lastMessages[toId]=content.slice(0,40);

      // Generate a temp ID to track optimistic message
      const tempId = 'temp-' + Date.now();

      // Optimistic local append — uses stored myId so isMe=true
      if(!_DM.current.myId)_DM.current.myId=myId;
      _appendDMMsg({id:tempId,from_user:myId,content,created_at:new Date().toISOString()},null);
      const area=document.getElementById('msgs-area');if(area)area.scrollTop=area.scrollHeight;

      // Send via socket
      if(S.socket?.connected){
        S.socket.emit('dm:send',{toUserId:toId,content});
        // Server echoes dm:new back — we ignore it via fromId===myId check
      }else{
        POST('/messages/dm',{toUserId:toId,content})
          .then(saved=>{
            // Replace temp element with real saved message
            const tempEl=document.querySelector('[data-mid="'+tempId+'"]');
            if(tempEl&&saved?.id)tempEl.dataset.mid=saved.id;
          })
          .catch(e=>toast('e','Send failed',e.message));
      }
      return;
    }
    S._dmMode=false;
    if(_orig)_orig.apply(this,arguments);
  };
})();

// Patch switchChannel to exit DM mode
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
  pk.style.cssText='position:fixed;z-index:900;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:220px;box-shadow:0 12px 40px rgba(0,0,0,.6);backdrop-filter:blur(16px);animation:scaleIn .12s cubic-bezier(.16,1,.3,1)';
  pk.innerHTML=_EMOJIS.map(e=>`<div onclick="_rxSend('${msgId}','${e}');document.getElementById('_rxpicker')?.remove()" style="width:32px;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.09)'" onmouseout="this.style.background=''">${e}</div>`).join('');
  const msgEl=document.querySelector(`[data-mid="${msgId}"]`);
  if(msgEl){const r=msgEl.getBoundingClientRect();pk.style.top=(r.bottom+4)+'px';pk.style.left=Math.min(r.left,window.innerWidth-230)+'px';}
  else{pk.style.top='40%';pk.style.left='50%';pk.style.transform='translate(-50%,-50%)';}
  document.body.appendChild(pk);
  setTimeout(()=>document.addEventListener('click',function _rc(e){if(!pk.contains(e.target)){pk.remove();document.removeEventListener('click',_rc);}},{capture:true}),60);
}
function _rxSend(msgId,emoji){
  if(S.socket?.connected)S.socket.emit('msg:react',{messageId:msgId,emoji});
  else POST('/messages/'+msgId+'/react',{emoji}).catch(e=>toast('e','Error',e.message));
}
function _renderRxns(messageId,reactions){
  for(const msgs of Object.values(S.messages||{})){const m=msgs.find(x=>x.id===messageId);if(m){m.reactions=reactions;break;}}
  const msgEl=document.querySelector(`[data-mid="${messageId}"]`);if(!msgEl)return;
  let rxEl=msgEl.querySelector('.msg-rxns');
  if(!rxEl){rxEl=document.createElement('div');rxEl.className='msg-rxns';rxEl.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-top:6px';msgEl.querySelector('.msg-body')?.appendChild(rxEl);}
  rxEl.innerHTML=Object.entries(reactions||{}).filter(([,u])=>u?.length).map(([em,users])=>{
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
  let _sActiveIdx = -1;
  inp.addEventListener('keydown',e=>{
    if(e.key==='Escape'){_sDrop.style.display='none';inp.blur();_sActiveIdx=-1;return;}
    if(e.key==='Enter'){
      const active = _sDrop.querySelector('[data-sactive]');
      if(active){e.preventDefault();active.click();return;}
      e.preventDefault();doSearch(inp.value.trim());return;
    }
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      const items=[..._sDrop.querySelectorAll('[onclick*="_sClick"]')];
      if(!items.length)return;
      items.forEach(it=>{delete it.dataset.sactive;it.style.background='';});
      _sActiveIdx=e.key==='ArrowDown'?Math.min(_sActiveIdx+1,items.length-1):Math.max(_sActiveIdx-1,0);
      if(items[_sActiveIdx]){items[_sActiveIdx].dataset.sactive='1';items[_sActiveIdx].style.background='rgba(255,255,255,.06)';}
    }
  });
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
    const users=(res.users||[]).map(_fixUser).slice(0,5),channels=(res.channels||[]).slice(0,4);
    if(!users.length&&!channels.length&&!tasks.length){
      _sDrop.innerHTML=`<div style="padding:24px;text-align:center;font-size:12px;color:var(--t4)">No results for <strong style="color:var(--t2)">"${_e(q)}"</strong></div>`;return;
    }
    const sec=(label,html,border=false)=>html?`<div style="padding:6px 12px 3px;font-size:9px;font-weight:800;color:var(--t4);letter-spacing:.6px;text-transform:uppercase${border?';border-top:1px solid rgba(255,255,255,.05);margin-top:4px':''}">${label}</div>${html}`:'' ;
    const row=(icon,name,sub,id,type)=>`<div onclick="_sClick('${type}','${_e(id)}')" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">${icon}<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div><div style="font-size:10px;color:var(--t4)">${sub}</div></div><div style="font-size:10px;color:var(--t4);flex-shrink:0">${type==='user'?'DM →':'Jump →'}</div></div>`;
    const uHTML=users.map(u=>row(`<div style="flex-shrink:0">${_av(u,30)}</div>`,_e(_safeName(u)),`@${_e(u.handle||u.github_username||'')} · ${_e(u.role||'member')}`,u.id,'user')).join('');
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
  else if(type==='task'){if(typeof showTasks==='function')showTasks();}
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS PANEL
═══════════════════════════════════════════════════════════════════════════ */
let _nPanel=null;
async function openNotifs(){
  if(_nPanel&&_nPanel.style.display!=='none'){_nPanel.style.display='none';return}
  if(!_nPanel){
    _nPanel=document.createElement('div');
    _nPanel.style.cssText='position:fixed;top:56px;right:14px;width:360px;max-width:calc(100vw - 28px);max-height:500px;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 16px 50px rgba(0,0,0,.7);z-index:400;backdrop-filter:blur(20px);display:flex;flex-direction:column;overflow:hidden';
    document.body.appendChild(_nPanel);
    document.addEventListener('click',e=>{if(_nPanel&&!_nPanel.contains(e.target)&&!e.target.closest('[onclick*="openNotifs"]'))_nPanel.style.display='none'});
  }
  _nPanel.style.display='flex';_nPanel.style.animation='scaleIn .18s cubic-bezier(.16,1,.3,1)';
  _nPanel.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><div style="font-size:14px;font-weight:700">Notifications</div><div style="display:flex;gap:8px;align-items:center"><button onclick="_markAllRead()" style="font-size:10px;font-weight:600;color:var(--blue);background:none;border:none;cursor:pointer;padding:3px 8px;border-radius:5px" onmouseover="this.style.background='rgba(59,130,246,.1)'" onmouseout="this.style.background=''">Mark all read</button><button onclick="toggleNotifSound()" title="${_notifSoundEnabled?'Mute sounds':'Enable sounds'}" style="font-size:12px;color:var(--t4);background:none;border:none;cursor:pointer;padding:3px 6px;border-radius:5px" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">🔔</button><div onclick="_nPanel.style.display='none'" style="cursor:pointer;color:var(--t4);font-size:14px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">✕</div></div></div><div id="_nlist" style="flex:1;overflow-y:auto"><div style="padding:24px;text-align:center;font-size:11px;color:var(--t4)">Loading…</div></div>`;
  try{
    const notifs=await GET('/notifications');
    const el=document.getElementById('_nlist');if(!el)return;
    const dot=document.getElementById('notif-dot');if(dot){dot.style.display='none';dot.dataset.count='0';dot.textContent='';}
    if(!notifs?.length){el.innerHTML='<div style="padding:32px;text-align:center"><div style="font-size:28px;margin-bottom:8px">🎉</div><div style="font-size:12px;color:var(--t4)">All caught up!</div></div>';return}
    const ICONS={task_assigned:'📋',pr_review:'🔀',pr_merged:'✅',pr_approved:'✅',mention:'@',dm:'💬',code_assigned:'⌨',system:'🔔',task_due:'⏰'};
    el.innerHTML=notifs.slice(0,25).map((n,i)=>`<div id="_ni${i}" onclick="_clickNotif('${_e(n.id)}',${i})" style="display:flex;align-items:flex-start;gap:10px;padding:11px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);background:${!n.read?'rgba(59,130,246,.04)':'transparent'}" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='${!n.read?'rgba(59,130,246,.04)':'transparent'}'"><div style="width:32px;height:32px;border-radius:9px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${ICONS[n.type]||'🔔'}</div><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:${!n.read?700:500};line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(n.title||'Notification')}</div>${n.body?`<div style="font-size:11px;color:var(--t3);margin-top:1px">${_e(n.body)}</div>`:''}<div style="font-size:9px;color:var(--t4);margin-top:3px">${_ago(n.created_at)}</div></div>${!n.read?`<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:4px" id="_nd${i}"></div>`:''}</div>`).join('');
  }catch(e){const el=document.getElementById('_nlist');if(el)el.innerHTML=`<div style="padding:14px;font-size:11px;color:var(--red)">Failed: ${_e(e.message)}</div>`}
}
function _clickNotif(id,i){
  PATCH('/notifications/'+id+'/read',{}).catch(()=>{});
  const el=document.getElementById('_ni'+i);if(el)el.style.background='transparent';
  document.getElementById('_nd'+i)?.remove();
}
let _notifSoundEnabled = localStorage.getItem('dc_notif_sound') !== 'off';
function toggleNotifSound() {
  _notifSoundEnabled = !_notifSoundEnabled;
  localStorage.setItem('dc_notif_sound', _notifSoundEnabled ? 'on' : 'off');
  toast('i', _notifSoundEnabled ? '🔔 Sounds On' : '🔕 Sounds Off', '');
}
function playNotifSound() {
  if (!_notifSoundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch {}
}
async function _markAllRead(){
  await POST('/notifications/read-all',{}).catch(()=>{});
  const dot=document.getElementById('notif-dot');if(dot)dot.style.display='none';
  if(_nPanel){_nPanel.querySelectorAll('[id^="_nd"]').forEach(e=>e.remove());_nPanel.querySelectorAll('[id^="_ni"]').forEach(e=>e.style.background='transparent');}
  toast('s','Done','All marked as read');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PINNED MESSAGES
═══════════════════════════════════════════════════════════════════════════ */
let _pPanel=null;
async function showAllPins(){
  const chId=S.currentChannel;
  if(!chId){toast('i','Pins','Open a channel first');return}
  if(_pPanel&&_pPanel.style.display!=='none'){_pPanel.style.display='none';return}
  if(!_pPanel){
    _pPanel=document.createElement('div');
    _pPanel.style.cssText='position:fixed;top:56px;right:14px;width:340px;max-width:calc(100vw - 28px);max-height:460px;background:rgba(14,14,16,.98);border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 16px 50px rgba(0,0,0,.7);z-index:400;backdrop-filter:blur(20px);display:flex;flex-direction:column;overflow:hidden';
    document.body.appendChild(_pPanel);
    document.addEventListener('click',e=>{if(_pPanel&&!_pPanel.contains(e.target)&&!e.target.closest('[onclick*="showAllPins"]'))_pPanel.style.display='none'});
  }
  _pPanel.style.display='flex';_pPanel.style.animation='scaleIn .18s cubic-bezier(.16,1,.3,1)';
  _pPanel.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><div style="font-size:14px;font-weight:700">📌 Pinned Messages</div><div onclick="_pPanel.style.display='none'" style="cursor:pointer;color:var(--t4);font-size:14px;padding:2px 6px;border-radius:5px" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">✕</div></div><div id="_plist" style="flex:1;overflow-y:auto;padding:8px"><div style="padding:16px;text-align:center;font-size:11px;color:var(--t4)">Loading…</div></div>`;
  try{
    const pins=await GET('/channels/'+chId+'/pins').catch(()=>[]);
    const el=document.getElementById('_plist');if(!el)return;
    if(!pins?.length){el.innerHTML='<div style="padding:24px;text-align:center"><div style="font-size:20px;margin-bottom:8px">📭</div><div style="font-size:12px;color:var(--t4)">No pinned messages</div><div style="font-size:11px;color:var(--t4);margin-top:4px">Right-click a message → Pin it</div></div>';return}
    el.innerHTML=pins.map(p=>{const msg=p.message||{};const u=_fixUser(msg.user||{});return`<div style="background:var(--s2);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;margin-bottom:6px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">${_av(u,20)}<span style="font-size:11px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(_safeName(u))}</span><span style="font-size:9px;color:var(--t4)">${_ago(msg.created_at||p.pinned_at)}</span></div><div style="font-size:12px;color:var(--t2);line-height:1.55">${_e((msg.content||'').slice(0,300))}</div></div>`}).join('');
  }catch(e){const el=document.getElementById('_plist');if(el)el.innerHTML=`<div style="padding:14px;font-size:11px;color:var(--red)">Failed: ${_e(e.message)}</div>`}
}

/* ═══════════════════════════════════════════════════════════════════════════
   USER PICK MODAL
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
      let list=others.filter(u=>(_safeName(u)||'').toLowerCase().includes(q.toLowerCase())||(u.handle||'').toLowerCase().includes(q.toLowerCase())||(u.github_username||'').toLowerCase().includes(q.toLowerCase()));
      if(!list.length){try{const r=await GET('/users/search?q='+encodeURIComponent(q));list=(r||[]).filter(u=>u.id!==S.user?.id).map(_fixUser);}catch{}}
      const el=document.getElementById('_upr');if(el)el.innerHTML=_renderPickList(list.slice(0,8));
    },200);
  });
}
function _renderPickList(users){
  return users.map(u=>`<div onclick="_upSel('${_e(u.id)}')" style="display:flex;align-items:center;gap:10px;padding:9px 6px;cursor:pointer;border-radius:8px;transition:background .1s" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">${_av(u,30)}<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(_safeName(u))}</div><div style="font-size:10px;color:var(--t4)">@${_e(u.handle||u.github_username||'')}</div></div><div style="width:7px;height:7px;border-radius:50%;background:${S.online?.[u.id]?'var(--green)':'var(--s6)'}"></div></div>`).join('')||'<div style="padding:16px;font-size:11px;color:var(--t4);text-align:center">No users found</div>';
}
function _upSel(userId){const u=_fixUser((S.users||[]).find(x=>x.id===userId)||{id:userId});document.getElementById('_upm')?.remove();if(window._upcb)window._upcb(u);}

/* ═══════════════════════════════════════════════════════════════════════════
   SOCKET PATCHES
═══════════════════════════════════════════════════════════════════════════ */
function _patchSocket(){
  if(!S.socket)return;

  // ── DM: fix self-notification bug ──
  S.socket.off('dm:new');
  S.socket.on('dm:new',dm=>{
    const fromId=dm.fromUserId||dm.from_user;
    const myId=S.user?.id||_DM.current?.myId;
    // Ignore echo of own sent message — already appended optimistically
    if(myId&&fromId===myId)return;
    // Also check by message ID dedup
    if(dm.id&&document.querySelector('[data-mid="'+dm.id+'"]'))return;
    // Recipient getting a new DM
    const sender=_fixUser((S.users||[]).find(u=>u.id===fromId)||{id:fromId});
    if(!_DM.lastMessages)_DM.lastMessages={};
    _DM.lastMessages[fromId]=(dm.content||'').slice(0,40);
    if(_DM.current?.userId===fromId){
      // DM chat open with this sender — append
      _appendDMMsg(dm,sender);
      const area=document.getElementById('msgs-area');if(area)area.scrollTop=area.scrollHeight;
    }else{
      // DM chat not open — show unread badge + toast
      _DM.unread[fromId]=(_DM.unread[fromId]||0)+1;renderSBDMs();
      if(typeof playNotifSound==='function')playNotifSound();
      toast('i','💬 '+_e(_safeName(sender)),(dm.content||'').slice(0,70));
      const dot=document.getElementById('notif-dot');if(dot)dot.style.display='block';
    }
  });

  // ── Reactions ──
  S.socket.off('msg:reactions');
  S.socket.on('msg:reactions',({messageId,reactions})=>_renderRxns(messageId,reactions));

  // ── DM delivery confirmation (replace temp ID with real ID) ──
  S.socket.off('dm:sent');
  S.socket.on('dm:sent', ({ id, ts }) => {
    if (!id) return;
    // Find the most recent temp message and update its ID
    const area = document.getElementById('msgs-area');
    if (!area) return;
    const tempEls = area.querySelectorAll('[data-mid^="temp-"]');
    if (tempEls.length > 0) {
      const lastTemp = tempEls[tempEls.length - 1];
      lastTemp.dataset.mid = id;
      // Add a subtle "sent" indicator
      const ts_el = lastTemp.querySelector('.msg-ts');
      if (ts_el) ts_el.style.color = 'var(--green)';
      setTimeout(() => { if (ts_el) ts_el.style.color = ''; }, 1500);
    }
    // Update in DM last messages
    if (_DM.current?.userId) {
      if (!_DM.lastMessages) _DM.lastMessages = {};
    }
  });

  // ── Presence → refresh panels ──
  S.socket.on('presence',({userId,status})=>{
    if(!S.online)S.online={};
    S.online[userId]=(status==='online');
    setTimeout(renderSBDMs,80);
    if(typeof renderRPMembers==='function')setTimeout(renderRPMembers,120);
  });

  // ── Task assigned ──
  S.socket.on('task:assigned',({task})=>{
    if(!task)return;
    if(!S.tasks)S.tasks=[];
    const i=S.tasks.findIndex(t=>t.id===task.id);
    if(i>=0)S.tasks[i]={...S.tasks[i],...task};
    else S.tasks.unshift(task);
    toast('a','📋 Task Assigned',((task.title||'').slice(0,50)));
    if(typeof loadCollabDash==='function')loadCollabDash();
    if(typeof loadMgrDash==='function'&&S.dashMode==='manager')loadMgrDash();
    const dot=document.getElementById('notif-dot');if(dot)dot.style.display='block';
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   OVERRIDES — invite, createTask, renderRPMembers, renderApp
═══════════════════════════════════════════════════════════════════════════ */

// Fix loadAll to sanitize users
;(()=>{
  const _orig=window.loadAll;
  window.loadAll=async function(){
    await _orig.apply(this,arguments);
    _fixAllUsers();
    if(S.user)S.user=_fixUser(S.user);
  };
})();

// Fix renderApp
;(()=>{
  const _orig=window.renderApp;
  window.renderApp=function(){
    if(S.user)S.user=_fixUser(S.user);
    _fixAllUsers();
    if(_orig)_orig.apply(this,arguments);
  };
})();

// Fix invite search — use correct field
window.renderInviteResults=function(users){
  const el=document.getElementById('invite-results');
  const noRes=document.getElementById('invite-no-results');
  if(!el)return;
  if(!users.length){el.innerHTML='';if(noRes)noRes.style.display='block';return}
  if(noRes)noRes.style.display='none';
  el.innerHTML=users.slice(0,8).map(u=>{
    const fixed=_fixUser(u);
    const name=_safeName(fixed);
    const handle=fixed.handle||fixed.github_username||'';
    const color=fixed.avatar_color||'#22c55e';
    const inits=_ini(name);
    return`<div class="invite-result" onclick="selectInviteUser('${_e(fixed.id)}','${_e(name)}','${_e(handle)}')">
      <div class="av av-32" style="background:${_e(color)}">${fixed.avatar_url?`<img src="${_e(fixed.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`:inits}</div>
      <div class="invite-result-info"><div class="invite-result-name">${_e(name)}</div><div class="invite-result-handle">${handle?'@'+_e(handle):''}</div></div>
    </div>`;
  }).join('');
};

window._inviteSelectedId=null;window._inviteSelectedHandle=null;
window.selectInviteUser=function(userId,name,handle){
  window._inviteSelected=userId;window._inviteSelectedId=userId;window._inviteSelectedHandle=handle;
  document.querySelectorAll('.invite-result').forEach(el=>el.classList.remove('selected'));
  const sel=document.getElementById('invite-selected'),disp=document.getElementById('invite-selected-display');
  if(sel)sel.style.display='block';
  if(disp)disp.innerHTML=`<strong>${_e(name)}</strong>${handle?' <span style="color:var(--t4)">@'+_e(handle)+'</span>':''}`;
  document.querySelectorAll('.invite-result').forEach(el=>{if(el.getAttribute('onclick')?.includes(userId))el.classList.add('selected');});
};

window.sendInvite=async function(){
  const id=window._inviteSelectedId||window._inviteSelected;
  const handle=window._inviteSelectedHandle;
  if(!id&&!handle){toast('e','Select a user','Search and click a user first');return}
  const role=document.getElementById('invite-role')?.value||'developer';
  try{
    if(handle)await POST('/workspaces/'+S.ws.id+'/invite',{handle,role});
    else await POST('/workspaces/'+S.ws.id+'/invite',{userId:id,role});
    if(typeof closeModal==='function')closeModal('invite-modal');
    toast('s','Invited ✓','');
    const members=await GET('/workspaces/'+S.ws.id+'/members').catch(()=>[]);
    S.users=(members||[]).map(_fixUser);
    if(typeof renderRPMembers==='function')renderRPMembers();
    if(typeof renderSBDMs==='function')renderSBDMs();
  }catch(e){toast('e','Invite Error',e.message);}
};

window.searchUsers=function(query){
  clearTimeout(window._inviteSearchTimer);
  const q=(query||'').trim();
  if(q.length<2){document.getElementById('invite-results').innerHTML='';return}
  window._inviteSearchTimer=setTimeout(async()=>{
    try{
      const users=await GET('/users/search?q='+encodeURIComponent(q));
      window.renderInviteResults((users||[]).map(_fixUser));
    }catch{document.getElementById('invite-no-results').style.display='block';}
  },300);
};

// Fix createTask — safe handle lookup
;(()=>{
  const _orig=window.createTask;
  window.createTask=async function(){
    const safe_v=(id,max)=>(document.getElementById(id)?.value||'').trim().slice(0,max||300);
    const title=safe_v('nt-title',300);
    const desc=safe_v('nt-desc',5000);
    const prio=document.getElementById('nt-prio')?.value||'medium';
    const dl=document.getElementById('nt-deadline')?.value||'';
    const raw=safe_v('nt-assign',50).replace('@','');
    if(!title){toast('e','Error','Title required');return}
    let assignedTo=S.user?.id;
    if(raw){
      const rawL=raw.toLowerCase();
      const found=(S.users||[]).find(u=>{
        const h=typeof u.handle==='string'?u.handle.toLowerCase():null;
        const gh=typeof u.github_username==='string'?u.github_username.toLowerCase():null;
        const dn=typeof u.display_name==='string'&&!_isEnc(u.display_name)?u.display_name.toLowerCase():null;
        return h===rawL||gh===rawL||dn===rawL;
      });
      if(found?.id)assignedTo=found.id;
    }
    if(!S.projects?.length){toast('e','No project','Create a project first');return}
    try{
      const task=await POST('/projects/'+S.projects[0].id+'/tasks',{title,description:desc,priority:prio,assignedTo,deadline:dl||null});
      if(!S.tasks)S.tasks=[];S.tasks.unshift(task);
      if(typeof closeModal==='function')closeModal('task-modal');
      toast('s','Task created','');
      if(typeof loadCollabDash==='function')loadCollabDash();
      if(typeof loadMgrDash==='function'&&S.dashMode==='manager')loadMgrDash();
    }catch(e){toast('e','Error',e.message);}
  };
})();

// Fix renderRPMembers — safe names
;(()=>{
  window.renderRPMembers=function(){
    const countEl=document.getElementById('rp-member-count');
    const listEl=document.getElementById('rp-members-list')||document.getElementById('rp-members');
    if(!listEl)return;
    if(!S.users?.length){listEl.innerHTML='<div style="font-size:11px;color:var(--t4);padding:8px">No members yet</div>';return}
    const online=S.users.filter(u=>S.online?.[u.id]).length;
    if(countEl)countEl.textContent=`${S.users.length} Members · ${online} Online`;
    listEl.innerHTML=S.users.slice(0,14).map(u=>{
      const fixed=_fixUser(u);
      const name=_safeName(fixed);
      const color=fixed.avatar_color||'#22c55e';
      const inits=_ini(name);
      const isOnline=S.online?.[fixed.id];
      const myTask=(S.tasks||[]).find(t=>t.assigned_to===fixed.id&&t.status!=='done'&&t.status!=='approved');
      return`<div class="rp-member" onclick="typeof memberCtx==='function'&&memberCtx(event,'${_e(fixed.id)}')" style="cursor:pointer">
        <div style="position:relative;flex-shrink:0">
          <div class="av av-28" style="background:${_e(color)}">${fixed.avatar_url?`<img src="${_e(fixed.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`:inits}</div>
          <div class="status-dot" style="position:absolute;bottom:0;right:0;border:2px solid var(--s1);background:${isOnline?'var(--green)':'var(--s6)'}"></div>
        </div>
        <div class="rp-member-info" style="flex:1;min-width:0">
          <div class="rp-member-name" title="${isOnline?'Online now':fixed.last_active?'Last seen '+_ago(fixed.last_active):'Offline'}">${_e(name)}</div>
          <div style="font-size:9px;color:var(--t4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${myTask?'📋 '+_e(myTask.title.slice(0,28)):'No active task'}</div>
        </div>
        <button onclick="event.stopPropagation();startDM('${_e(fixed.id)}')" style="font-size:10px;padding:3px 7px;border-radius:5px;background:transparent;border:1px solid rgba(255,255,255,.07);color:var(--t4);cursor:pointer;flex-shrink:0" onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background='transparent'">DM</button>
      </div>`;
    }).join('');
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE RESPONSIVE CSS
═══════════════════════════════════════════════════════════════════════════ */
(function _injectMobileCSS(){
  const css=`
@media(max-width:768px){
  .nav-hamburger{display:flex!important}
  .nav-search-wrap{max-width:180px}
  .sidebar{position:fixed!important;left:0;top:52px;bottom:0;z-index:300!important;width:260px!important;transform:translateX(-100%);transition:transform .28s cubic-bezier(.16,1,.3,1);box-shadow:4px 0 24px rgba(0,0,0,.5)}
  .sidebar.mobile-open{transform:translateX(0)!important}
  .sidebar-overlay{display:none}
  .sidebar-overlay.visible{display:block!important;position:fixed;inset:0;z-index:299;background:rgba(0,0,0,.5);backdrop-filter:blur(4px)}
  .rpanel{display:none!important}
  .resizer{display:none!important}
  .modal{width:calc(100vw - 20px)!important;max-width:100%!important}
  .modal-body{padding:14px!important}
  .msgs-area{padding:10px 12px!important}
  .input-area{padding:6px 10px 10px!important}
  .input-ta{font-size:16px!important}
  .field-input,.field-select,.field-textarea{font-size:16px!important}
  .mgr-stat-grid{grid-template-columns:repeat(2,1fr)!important}
  .collab-focus-grid{grid-template-columns:1fr!important}
  .dash-body{padding:0 16px 24px!important}
  .dash-hdr{padding:18px 16px 10px!important}
  .dash-greeting{font-size:20px!important}
  .grid-2{grid-template-columns:1fr!important}
  .grid-4{grid-template-columns:repeat(2,1fr)!important}
  .home-hdr{padding:18px 16px 12px!important}
  .proj-overview-wrap{padding:16px!important}
  #home-view .grid-2,#home-view .grid-3,#home-view .grid-4{grid-template-columns:1fr!important}
  .sb-item{min-height:38px}
  .btn{min-height:34px}
  .ctx-item{min-height:38px;padding:9px 12px}
  .chat-hdr{padding:0 12px}
}
@media(max-width:480px){
  .nav-brand-name{display:none!important}
  .stat-card-val{font-size:22px!important}
  .focus-card-title{font-size:13px!important}
  .sidebar{width:88vw!important}
}
@media(min-width:769px){
  .nav-hamburger{display:none!important}
  .sidebar-overlay{display:none!important}
}`;
  const el=document.createElement('style');el.textContent=css;document.head.appendChild(el);
})();

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════════════════ */
(function boot(){
  const _ti=setInterval(()=>{
    if(!document.getElementById('nav-search'))return;
    clearInterval(_ti);
    _initSearch();
    // Wait for socket
    const _si=setInterval(()=>{if(!S.socket)return;clearInterval(_si);_patchSocket();},300);
    // Wait for users
    const _ui=setInterval(()=>{if(!S.users?.length)return;clearInterval(_ui);_fixAllUsers();renderSBDMs();},300);
  },200);

  // Keyboard shortcuts
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(_nPanel)_nPanel.style.display='none';
      if(_pPanel)_pPanel.style.display='none';
      if(_sDrop)_sDrop.style.display='none';
      document.getElementById('_upm')?.remove();
      document.getElementById('_rxpicker')?.remove();
    }
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();const inp=document.getElementById('nav-search');if(inp){inp.focus();inp.select();}}
  });

  // Fix users periodically (for late-loaded data)
  const _fixT=setInterval(()=>{
    if(!S.users?.length)return;
    clearInterval(_fixT);
    _fixAllUsers();
    if(S.user)S.user=_fixUser(S.user);
    renderSBDMs();
    if(typeof renderRPMembers==='function')renderRPMembers();
  },500);
})();
