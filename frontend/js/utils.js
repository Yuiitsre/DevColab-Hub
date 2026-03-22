/* ════════════════════════════════════════════════════════════════
   DEVCOLAB HUB — API & UTILITIES
════════════════════════════════════════════════════════════════ */
'use strict';

const IS_DEV  = location.hostname==='localhost'||location.hostname==='127.0.0.1';
const API_URL = IS_DEV ? 'http://localhost:4000/api' : 'https://devcolab-backend.onrender.com/api';
const WS_URL  = IS_DEV ? 'http://localhost:4000'     : 'https://devcolab-backend.onrender.com';

// ── HTTP helpers ──────────────────────────────────────────────
async function apiCall(method, path, body) {
  const token = window._dcToken || localStorage.getItem('dc_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_URL + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'HTTP ' + res.status);
  return data.data ?? data;
}
const GET   = p    => apiCall('GET',    p);
const POST  = (p,b)=> apiCall('POST',   p, b);
const PATCH = (p,b)=> apiCall('PATCH',  p, b);
const DEL   = p    => apiCall('DELETE', p);

// ── String utils ─────────────────────────────────────────────
function esc(s) {
  if (typeof s!=='string') return String(s??'');
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safe(s, max=500) { return typeof s==='string'?s.trim().slice(0,max):''; }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function initials(name) {
  if (!name) return '?';
  return (name+'').replace(/[^A-Za-z0-9 ]/g,'').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';
}

// ── Time utils ───────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const diff=Date.now()-new Date(ts).getTime(), s=Math.floor(diff/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
  if (s<60) return 'just now'; if (m<60) return m+'m ago'; if (h<24) return h+'h ago';
  if (d<7) return d+'d ago'; return new Date(ts).toLocaleDateString();
}
function fmtTime(ts) { return new Date(ts||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function fmtDate(ts) { return new Date(ts||Date.now()).toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function fmtDateTime(ts) { return new Date(ts||Date.now()).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
function deadline(dl) {
  if (!dl) return {label:'No deadline',cls:'',color:'var(--t4)'};
  const diff=new Date(dl)-Date.now(), h=diff/3600000;
  if (h<0)  return {label:'Overdue!',cls:'dl-over',color:'var(--red)'};
  if (h<24) return {label:Math.round(h)+'h left',cls:'dl-soon',color:'var(--yellow)'};
  if (h<72) return {label:Math.round(h/24)+'d left',cls:'dl-soon',color:'var(--yellow)'};
  return {label:fmtDate(dl),cls:'',color:'var(--t4)'};
}

// ── Message formatting ────────────────────────────────────────
function fmtText(t) {
  if (!t) return '';
  let s=esc(t);
  s=s.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>`<div class="code-block"><div class="code-hdr"><span class="code-lang">${(lang||'code').toUpperCase()}</span><span class="code-copy-btn" onclick="cpCode(this)">Copy</span></div><pre class="code-body">${code}</pre></div>`);
  s=s.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  s=s.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/_(.*?)_/g,'<em>$1</em>');
  s=s.replace(/~~(.*?)~~/g,'<del>$1</del>');
  s=s.replace(/@(\w[\w.]*)/g,'<span style="color:var(--blue);font-weight:600">@$1</span>');
  s=s.replace(/(https?:\/\/[^\s<>"]+)/g,'<a href="$1" target="_blank">$1</a>');
  s=s.replace(/\n/g,'<br>');
  return s;
}
function cpCode(btn) { navigator.clipboard.writeText(btn.closest('.code-block').querySelector('.code-body').textContent||'').then(()=>toast('s','Copied','')); }

// ── DOM helpers ──────────────────────────────────────────────
function autoGrow(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }
function prioColor(p) { return {urgent:'var(--red)',medium:'var(--yellow)',normal:'var(--green)'}[p]||'var(--t4)'; }
function debounce(fn, ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

// ── Toast ─────────────────────────────────────────────────────
function toast(type, title, msg='', dur=4000) {
  const icons={s:'✓',e:'✕',i:'ℹ',a:'✦'};
  const el=document.createElement('div');
  el.className='toast toast-'+type;
  el.innerHTML=`<span class="toast-icon">${icons[type]||'·'}</span>
    <div class="toast-content">
      <div class="toast-title">${esc(title)}</div>
      ${msg?`<div class="toast-msg">${esc(msg)}</div>`:''}
    </div>
    <div class="toast-close" onclick="this.closest('.toast').remove()">×</div>`;
  const container=document.getElementById('toasts');
  if (container) container.appendChild(el);
  setTimeout(()=>{
    el.style.cssText+='opacity:0;transform:translateX(12px);transition:all .3s';
    setTimeout(()=>el.remove(),320);
  }, dur);
}

// ── Context menu ─────────────────────────────────────────────
function buildCtx(e, items) {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('ctx-menu')?.remove();
  const ctx=document.createElement('div');
  ctx.id='ctx-menu'; ctx.className='ctx';
  ctx.style.animation='scaleIn .12s cubic-bezier(.16,1,.3,1)';
  items.forEach((it,i)=>{
    if (it.sep){ctx.insertAdjacentHTML('beforeend','<div class="ctx-sep"></div>');return;}
    if (!it.fn){ctx.insertAdjacentHTML('beforeend',`<div class="ctx-section-label">${esc(it.label||'')}</div>`);return;}
    const d=document.createElement('div');
    d.className='ctx-item'+(it.danger?' danger':'');
    d.innerHTML=`<span class="ctx-icon">${it.icon||''}</span><span>${esc(it.label)}</span>${it.shortcut?`<span class="ctx-shortcut">${it.shortcut}</span>`:''}`;
    d.addEventListener('click',()=>{ctx.remove();it.fn();});
    ctx.appendChild(d);
  });
  document.body.appendChild(ctx);
  const x=Math.min(e.clientX, innerWidth-220), y=e.clientY;
  ctx.style.left=x+'px'; ctx.style.top=y+'px';
  requestAnimationFrame(()=>{
    const r=ctx.getBoundingClientRect();
    if(r.bottom>innerHeight) ctx.style.top=(y-r.height)+'px';
    if(r.right>innerWidth) ctx.style.left=(x-r.width)+'px';
  });
  setTimeout(()=>document.addEventListener('click',()=>ctx.remove(),{once:true}),50);
}

// ── Expose globally ──────────────────────────────────────────
Object.assign(window,{
  API_URL,WS_URL,GET,POST,PATCH,DEL,
  esc,safe,slugify,initials,timeAgo,fmtTime,fmtDate,fmtDateTime,deadline,
  fmtText,cpCode,autoGrow,prioColor,debounce,toast,buildCtx
});
