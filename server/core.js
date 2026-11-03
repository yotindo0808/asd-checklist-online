import { BANKS } from './banks.js';
/* ASD V4 temporary receiver — Netlify Functions + Postgres adapter.
 * NO diagnostic scores, thresholds or pending scoring candidates are used.
 * Invitations and submissions are automatically purged after retention deadline.
 */
const VERSIONS = Object.freeze({preschool:50, lower_elementary:47, upper_elementary_plus:47});
const CHOICES = new Set(['always','often','sometimes','never']);
const ROLES = new Set(['父親','母親','教師','其他家屬','其他']);
const te = new TextEncoder();
const NOW = () => Math.floor(Date.now() / 1000);
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const bad = (message, status=400) => { const e=new Error(message); e.status=status; throw e; };
const rand = (n=32) => { const b=crypto.getRandomValues(new Uint8Array(n));return [...b].map(x=>x.toString(16).padStart(2,'0')).join(''); };
const hex = ab => [...new Uint8Array(ab)].map(b=>b.toString(16).padStart(2,'0')).join('');
async function hash(secret,value) {return hex(await crypto.subtle.digest('SHA-256',te.encode(secret+'|'+value)));}
function equal(a,b){const A=te.encode(a),B=te.encode(b);let diff=A.length^B.length;for(let i=0;i<Math.max(A.length,B.length);i++)diff|=(A[i]??0)^(B[i]??0);return diff===0;}
function getOrigin(req,env){return (env.FRONTEND_ORIGIN||new URL(req.url).origin).trim().replace(/\/$/,'');}
function cors(request,env){ const origin=request.headers.get('Origin'); const allowed=getOrigin(request,env); return (origin && allowed && origin===allowed) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Invite-Token, X-Respondent-Token','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Max-Age':'300'} : {}; }
function inspectOrigin(request,env){const origin=request.headers.get('Origin'); if(origin && origin!==getOrigin(request,env))bad('不允許此網站存取',403);}
async function body(req){let t=await req.text();if(t.length>35000)bad('資料超出容量限制',413);try{return JSON.parse(t)}catch{bad('資料格式無法辨識')}}
function requireCfg(env){if(!env.DB || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length<14 || !env.SESSION_PEPPER || env.SESSION_PEPPER.length<32) bad('伺服器尚未完成安全設定',503);}
async function admin(req,env){const raw=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(raw))bad('請先登入心評人員管理端',401);const h=await hash(env.SESSION_PEPPER,raw);const s=await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash=?').bind(h).first();if(!s || s.expires_at<=NOW())bad('管理登入已過期，請重新登入',401);return h;}
async function respondent(req,env){const raw=req.headers.get('X-Respondent-Token')||'';if(!/^[a-f0-9]{64}$/.test(raw))bad('請由專屬連結完成驗證',401);const h=await hash(env.SESSION_PEPPER,raw);const row=await env.DB.prepare('SELECT * FROM invitations WHERE respondent_hash=? AND respondent_expires_at>?').bind(h,NOW()).first();if(!row || row.revoked_at || row.submitted_at || row.expires_at<=NOW() || row.delete_after<=NOW())bad('填答權限已失效',403);return row;}
function validInvite(row){if(!row || row.revoked_at || row.submitted_at || row.expires_at<=NOW() || row.delete_after<=NOW())bad('此填答連結已過期、撤銷或完成提交',410);}
function cleanString(value,max=80,required=false){if(typeof value!=='string')bad('文字欄位格式錯誤');const s=value.trim();if((required&&!s)||s.length>max)bad('文字欄位內容或長度不符');return s;}
function validateDraft(data,version,complete){if(!data||typeof data!=='object'||Array.isArray(data))bad('填答資料格式錯誤');const a=data.answers;
 if(!a||typeof a!=='object'||Array.isArray(a))bad('缺少答案資料');const count=VERSIONS[version];if(Object.keys(a).length>count)bad('答案題數超出量表');
 for(const [key,val] of Object.entries(a)){const n=Number(key);if(!/^[1-9]\d*$/.test(key)||!Number.isInteger(n)||n<1||n>count||!CHOICES.has(val))bad('題號或選項錯誤');}
 if(complete && Object.keys(a).length!==count)bad('尚有題目未作答，不能提交');
 const oral = data.oral_level === '' || data.oral_level == null ? null : Number(data.oral_level);
 if(oral!=null && ![1,2,3,4,5].includes(oral))bad('口語能力代碼不符');
 const role = cleanString(data.relation||'',20,false);if(role && !ROLES.has(role))bad('填答者關係選項無效');
 if(complete && (!oral || !role))bad('請填寫口語能力及填答者關係');
 const basic = data.basic || {};if(typeof basic!=='object'||Array.isArray(basic)||basic==null)bad('基本資料格式錯誤');
 const fields={student_alias:60,school:80,grade:30,respondent_name:60,caregiver_0_3:40,regression:20,regression_notes:240,assessment_date:10};
 const clean={};for(const [k,v] of Object.entries(basic)){if(!(k in fields))bad('不支援的基本資料欄位');clean[k]=cleanString(v,fields[k]);}
 if(clean.assessment_date && !/^\d{4}-\d{2}-\d{2}$/.test(clean.assessment_date))bad('日期格式錯誤');
 return {oral_level:oral,relation:role,basic:clean,answers:a};
}
function viewMeta(row){const n=NOW();return {id:row.id,label:row.label,version:row.version,recipient:row.recipient,created_at:row.created_at,expires_at:row.expires_at,delete_after:row.delete_after,submitted_at:row.submitted_at,downloaded_at:row.downloaded_at,revoked_at:row.revoked_at,status:row.submitted_at?'submitted':row.revoked_at?'revoked':row.expires_at<=n?'expired':'pending'};}
async function cleanup(env){const n=NOW();await env.DB.batch([
 env.DB.prepare('DELETE FROM invitations WHERE delete_after<=?').bind(n),
 env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(n),
 env.DB.prepare('DELETE FROM login_attempts WHERE window_start<?').bind(n-86400)
]);}
async function handler(req,env){requireCfg(env);inspectOrigin(req,env);const u=new URL(req.url),path=u.pathname.replace(/\/$/,'');const method=req.method;const n=NOW();
 if(path==='/api/health'&&method==='GET')return json({ok:true,app:'ASD V4 Netlify',scoring:'disabled',question_bank:BANKS.preschool?.status||'missing'});
 if(path.startsWith('/api/questions/')&&method==='GET'){
   const version=path.slice('/api/questions/'.length);
   if(!Object.hasOwn(BANKS,version))bad('未知量表版本',404);
   if(req.headers.get('Authorization')){await admin(req,env);}
   else {const row=await respondent(req,env);if(row.version!==version)bad('不能存取其他版本題庫',403);}
   return json(BANKS[version]);
 }

 if(path==='/api/admin/login'&&method==='POST'){
   const ip=(req.headers.get('X-Nf-Client-Connection-Ip')||'unknown').slice(0,100);const key=await hash(env.SESSION_PEPPER,'ip:'+ip);
   const r=await env.DB.prepare('SELECT * FROM login_attempts WHERE key_hash=?').bind(key).first();if(r&&r.locked_until>n)bad('登入嘗試過多，請稍後再試',429);
   const p=await body(req);if(typeof p.password!=='string'||p.password.length>512)bad('密碼格式錯誤');
   const ok=equal(await hash(env.SESSION_PEPPER,p.password),await hash(env.SESSION_PEPPER,env.ADMIN_PASSWORD));
   if(!ok){let count=(r&&r.window_start>n-900)?r.attempts+1:1;const lock=count>=8?n+900:0;
     await env.DB.prepare('INSERT INTO login_attempts(key_hash,window_start,attempts,locked_until) VALUES(?,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET window_start=excluded.window_start, attempts=excluded.attempts, locked_until=excluded.locked_until').bind(key,(r&&r.window_start>n-900)?r.window_start:n,count,lock).run();bad('密碼錯誤',401);}
   await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash=?').bind(key).run();
   const token=rand();await env.DB.prepare('INSERT INTO admin_sessions(token_hash,created_at,expires_at) VALUES(?,?,?)').bind(await hash(env.SESSION_PEPPER,token),n,n+7200).run();
   return json({token,expires_at:n+7200});
 }
 if(path==='/api/admin/logout'&&method==='POST'){const h=await admin(req,env);await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(h).run();return json({ok:true});}
 if(path==='/api/admin/session'&&method==='GET'){await admin(req,env);return json({role:'admin',scoring:'disabled'});}
 if(path==='/api/admin/invitations'&&method==='GET'){
   await admin(req,env);const rows=await env.DB.prepare('SELECT id,label,version,recipient,created_at,expires_at,delete_after,submitted_at,downloaded_at,revoked_at FROM invitations WHERE delete_after>? ORDER BY created_at DESC LIMIT 200').bind(n).all();return json({invitations:rows.results.map(viewMeta)});
 }
 if(path==='/api/admin/invitations'&&method==='POST'){
   await admin(req,env);const p=await body(req);const version=p.version, recipient=p.recipient; if(!Object.hasOwn(VERSIONS,version)||!['家長','教師','其他'].includes(recipient))bad('量表或對象選擇錯誤');
   const label=cleanString(p.label||'',60,true), hours=Number(p.hours);if(!Number.isInteger(hours)||hours<1||hours>168)bad('有效時間僅能設定1至168小時');
   const codeEnabled=p.code_enabled!==false;
   const token=rand(), code=codeEnabled ? [...crypto.getRandomValues(new Uint8Array(8))].map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join(''):null;
   const id=crypto.randomUUID(),expire=n+hours*3600;
   // Drafts after expiry, or responses after submission, will be retained at most seven extra days.
   const del=expire+7*86400;
   await env.DB.prepare('INSERT INTO invitations(id,invite_hash,label,version,recipient,code_hash,created_at,expires_at,delete_after) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,await hash(env.SESSION_PEPPER,token),label,version,recipient,code?await hash(env.SESSION_PEPPER,code):null,n,expire,del).run();
   return json({id,token,code,expires_at:expire,delete_after:del},201);
 }
 const hit=path.match(/^\/api\/admin\/invitations\/([a-f0-9-]{36})(?:\/(revoke|downloaded))?$/);
 if(hit){await admin(req,env);const id=hit[1],act=hit[2];const r=await env.DB.prepare('SELECT * FROM invitations WHERE id=? AND delete_after>?').bind(id,n).first();if(!r)bad('紀錄不存在或已清除',404);
   if(!act&&method==='GET')return json({invitation:viewMeta(r),submission:r.submitted_at?JSON.parse(r.answer_json):null,scoring:{status:'not_approved',total:null,domains:null,threshold:null}});
   if(act==='revoke'&&method==='POST') {if(r.submitted_at)bad('已提交紀錄不需撤銷；可下載後刪除');await env.DB.prepare('UPDATE invitations SET revoked_at=?,respondent_hash=NULL,respondent_expires_at=NULL,draft_json=NULL WHERE id=? AND submitted_at IS NULL').bind(n,id).run();return json({ok:true});}
   if(act==='downloaded'&&method==='POST'){if(!r.submitted_at)bad('尚無完成紀錄');await env.DB.prepare('UPDATE invitations SET downloaded_at=? WHERE id=?').bind(n,id).run();return json({ok:true});}
   if(!act&&method==='DELETE'){await env.DB.prepare('DELETE FROM invitations WHERE id=?').bind(id).run();return json({deleted:true});}
 }
 if(path==='/api/respondent/invitation'&&method==='GET'){
   const token=req.headers.get('X-Invite-Token')||'';if(!/^[a-f0-9]{64}$/.test(token))bad('無效的填答連結',404);
   const r=await env.DB.prepare('SELECT * FROM invitations WHERE invite_hash=?').bind(await hash(env.SESSION_PEPPER,token)).first();validInvite(r);
   return json({version:r.version,recipient:r.recipient,expires_at:r.expires_at,requires_code:!!r.code_hash});
 }
 if(path==='/api/respondent/unlock'&&method==='POST'){
   const p=await body(req);if(!/^[a-f0-9]{64}$/.test(p.token||''))bad('邀請識別碼錯誤',404);
   const r=await env.DB.prepare('SELECT * FROM invitations WHERE invite_hash=?').bind(await hash(env.SESSION_PEPPER,p.token)).first();validInvite(r);
   if(r.code_locked_until>n)bad('驗證錯誤次數過多，請稍後再試',429);
   if(r.code_hash){const candidate=typeof p.code==='string'?p.code.toUpperCase().trim():''; const correct=equal(await hash(env.SESSION_PEPPER,candidate),r.code_hash);
     if(!correct){const fail=r.code_failures+1;await env.DB.prepare('UPDATE invitations SET code_failures=?,code_locked_until=? WHERE id=?').bind(fail,fail>=6?n+900:0,r.id).run();bad('驗證碼錯誤',401);}
   }
   const token=rand(), exp=Math.min(n+6*3600,r.expires_at);
   const res=await env.DB.prepare('UPDATE invitations SET respondent_hash=?,respondent_expires_at=?,code_failures=0,code_locked_until=0 WHERE id=? AND revoked_at IS NULL AND submitted_at IS NULL AND expires_at>?').bind(await hash(env.SESSION_PEPPER,token),exp,r.id,n).run();if(!res.meta.changes)bad('填答連結已失效',410);
   return json({token,expires_at:exp});
 }
 if(path==='/api/respondent/state'&&method==='GET'){
   const r=await respondent(req,env);return json({label:r.label,version:r.version,recipient:r.recipient,expires_at:r.expires_at,draft:r.draft_json?JSON.parse(r.draft_json):{oral_level:null,relation:'',basic:{},answers:{}}});
 }
 if(path==='/api/respondent/draft'&&method==='PUT'){
   const r=await respondent(req,env);const data=validateDraft(await body(req),r.version,false);
   const x=await env.DB.prepare('UPDATE invitations SET draft_json=? WHERE id=? AND respondent_hash=? AND submitted_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(JSON.stringify(data),r.id,r.respondent_hash,n).run();if(!x.meta.changes)bad('草稿保存時權限已失效',409);return json({saved:true});
 }
 if(path==='/api/respondent/submit'&&method==='POST'){
   const r=await respondent(req,env);const data=validateDraft(await body(req),r.version,true);
   const x=await env.DB.prepare('UPDATE invitations SET answer_json=?,draft_json=NULL,submitted_at=?,delete_after=?,respondent_hash=NULL,respondent_expires_at=NULL WHERE id=? AND respondent_hash=? AND submitted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND delete_after>?').bind(JSON.stringify(data),n,Math.min(r.delete_after,n+7*86400),r.id,r.respondent_hash,n,n).run();
   if(!x.meta.changes)bad('問卷已送出或已失效，不能重複提交',409);
   return json({submitted:true,submitted_at:n});
 }
 bad('找不到此操作',404);
}
export default {
 async fetch(req,env){const ch=cors(req,env); if(req.method==='OPTIONS'){
  if(!Object.keys(ch).length)return json({error:'不允許此來源'},403);
  return new Response(null,{status:204,headers:ch});
 }
 try{const res=await handler(req,env);const headers=new Headers(res.headers);for(const[k,v]of Object.entries(ch))headers.set(k,v);headers.set('Referrer-Policy','no-referrer');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return new Response(res.body,{status:res.status,headers});}
 catch(e){return json({error:e.status?e.message:'伺服器處理失敗'},e.status||500,{...ch,'Referrer-Policy':'no-referrer'});}
 },
 async scheduled(event,env,ctx){ctx.waitUntil(cleanup(env));}
};
export const _test={validateDraft,cleanup,viewMeta,handler,hash};