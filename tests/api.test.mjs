import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/core.js';

const ORIGIN='https://example.github.io';
function mockDb(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('./local-sqlite-init.sql',import.meta.url),'utf8'));
 return {db,adapter:{
   prepare(sql){return {bind(...args){const stmt=db.prepare(sql);return {async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const meta=stmt.run(...args);return {meta:{changes:Number(meta.changes)}}}}}}},
   async batch(stmts){return await Promise.all(stmts.map(s=>s.run()))}
 }};
}
function request(method,path,{data,admin,respondent,invite,origin=ORIGIN}={}){const headers={Origin:origin};if(data)headers['Content-Type']='application/json';if(admin)headers.Authorization='Bearer '+admin;if(respondent)headers['X-Respondent-Token']=respondent;if(invite)headers['X-Invite-Token']=invite;return new Request('https://example.workers.dev'+path,{method,headers,body:data?JSON.stringify(data):undefined})}
async function api(env,method,path,opt){const res=await worker.fetch(request(method,path,opt),env);return {status:res.status,data:await res.json(),headers:res.headers}}
function env(){let {db,adapter}=mockDb();return {db,env:{DB:adapter,ADMIN_PASSWORD:'Test-Strong-Password-12345!',SESSION_PEPPER:'0123456789abcdef0123456789abcdef0123456789abcdef',FRONTEND_ORIGIN:ORIGIN}}}
const ITEMS={preschool:50,lower_elementary:47,upper_elementary_plus:47};

for(const [version,count]of Object.entries(ITEMS)){
test(`End-to-end: ${version}, ${count} questions, expiry, deletion and permissions`,async()=>{
 const x=env();const E=x.env;
 let r=await api(E,'POST','/api/admin/login',{data:{password:'wrong'}});assert.equal(r.status,401);
 r=await api(E,'POST','/api/admin/login',{data:{password:E.ADMIN_PASSWORD}});assert.equal(r.status,200);const admin=r.data.token;
 // The question bank is never available without a valid role token.
 let q=await api(E,'GET','/api/questions/'+version);
 assert.equal(q.status,401);
 q=await api(E,'GET','/api/questions/'+version,{admin});
 assert.equal(q.status,200);assert.equal(q.data.items.length,count);
 const other='f'.repeat(64);
 assert.equal((await api(E,'GET','/api/admin/invitations',{admin:other})).status,401);
 assert.equal((await api(E,'POST','/api/admin/invitations',{admin,data:{label:'MOCK-001',version,recipient:'家長',hours:72,code_enabled:true},origin:'https://evil.example'})).status,403);
 r=await api(E,'POST','/api/admin/invitations',{admin,data:{label:'MOCK-001',version,recipient:'家長',hours:72,code_enabled:true}});assert.equal(r.status,201);const {id,token,code}=r.data;
 assert.equal(code.length,8);assert.equal(token.length,64);
 const record=x.db.prepare('SELECT * FROM invitations WHERE id=?').get(id);assert.ok(!JSON.stringify(record).includes(token));assert.ok(!JSON.stringify(record).includes(code));
 r=await api(E,'GET','/api/respondent/invitation',{invite:token});assert.equal(r.status,200);assert.equal(r.data.requires_code,true);assert.equal(Object.hasOwn(r.data,'label'),false);
 r=await api(E,'POST','/api/respondent/unlock',{data:{token,code:'BADCODE'}});assert.equal(r.status,401);
 r=await api(E,'POST','/api/respondent/unlock',{data:{token,code}});assert.equal(r.status,200);const respondent=r.data.token;
 let qRespondent=await api(E,'GET','/api/questions/'+version,{respondent});
 assert.equal(qRespondent.status,200);assert.equal(qRespondent.data.items.length,count);
 const otherVersion=version==='preschool'?'lower_elementary':'preschool';
 assert.equal((await api(E,'GET','/api/questions/'+otherVersion,{respondent})).status,403);
 const base={oral_level:3,relation:'父親',basic:{student_alias:'MOCK-001',respondent_name:'測試員',school:''},answers:{}};
 r=await api(E,'PUT','/api/respondent/draft',{respondent,data:base});assert.equal(r.status,200);
 r=await api(E,'POST','/api/respondent/submit',{respondent,data:base});assert.equal(r.status,400);
 let bad={...base,answers:{'1':'always','999':'never'}};
 assert.equal((await api(E,'PUT','/api/respondent/draft',{respondent,data:bad})).status,400);
 const answers=Object.fromEntries(Array.from({length:count},(_,i)=>[String(i+1),i%2?'often':'always']));
 r=await api(E,'POST','/api/respondent/submit',{respondent,data:{...base,answers}});assert.equal(r.status,200);
 assert.equal((await api(E,'POST','/api/respondent/submit',{respondent,data:{...base,answers}})).status,403);
 assert.equal((await api(E,'POST','/api/respondent/unlock',{data:{token,code}})).status,410);
 assert.equal((await api(E,'GET','/api/questions/'+version,{respondent})).status,403);
 assert.equal((await api(E,'GET','/api/admin/invitations/'+id,{admin:other})).status,401);
 r=await api(E,'GET','/api/admin/invitations/'+id,{admin});assert.equal(r.status,200);
 assert.equal(Object.keys(r.data.submission.answers).length,count);assert.equal(r.data.scoring.total,null);
 r=await api(E,'POST','/api/admin/invitations/'+id+'/downloaded',{admin});assert.equal(r.status,200);
 r=await api(E,'DELETE','/api/admin/invitations/'+id,{admin});assert.equal(r.status,200);
 assert.equal((await api(E,'GET','/api/admin/invitations/'+id,{admin})).status,404);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM invitations').get().n,0);
 });
}

test('expired, revoked and scheduled cleanup',async()=>{
 const x=env(),E=x.env;
 let r=await api(E,'POST','/api/admin/login',{data:{password:E.ADMIN_PASSWORD}}),a=r.data.token;
 r=await api(E,'POST','/api/admin/invitations',{admin:a,data:{label:'MOCK-002',version:'preschool',recipient:'教師',hours:24,code_enabled:false}});
 let {id,token}=r.data;
 assert.equal((await api(E,'GET','/api/respondent/invitation',{invite:token})).status,200);
 assert.equal((await api(E,'POST','/api/admin/invitations/'+id+'/revoke',{admin:a})).status,200);
 assert.equal((await api(E,'GET','/api/respondent/invitation',{invite:token})).status,410);
 r=await api(E,'POST','/api/admin/invitations',{admin:a,data:{label:'MOCK-003',version:'preschool',recipient:'教師',hours:24,code_enabled:false}});
 x.db.prepare('UPDATE invitations SET expires_at=? WHERE id=?').run(1,r.data.id);
 assert.equal((await api(E,'POST','/api/respondent/unlock',{data:{token:r.data.token}})).status,410);
 x.db.prepare('UPDATE invitations SET delete_after=1');
 x.db.exec('UPDATE invitations SET delete_after=1');
 let work;await worker.scheduled({},E,{waitUntil(p){work=p}});await work;
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM invitations').get().n,0);
});

test('login lock after excessive password failures',async()=>{
 const x=env(),E=x.env;
 for(let j=0;j<8;j++)assert.equal((await api(E,'POST','/api/admin/login',{data:{password:'bad'+j}})).status,401);
 assert.equal((await api(E,'POST','/api/admin/login',{data:{password:E.ADMIN_PASSWORD}})).status,429);
});