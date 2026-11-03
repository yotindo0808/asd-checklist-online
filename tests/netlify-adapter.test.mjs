import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdapter} from '../server/postgres-adapter.js';
test('parameterized postgres adapter: first/all/run', async()=>{
 const calls=[];const fake={query:async(sql,values)=>{calls.push({sql,values});return {rows:[{id:'TEST'}],rowCount:1}}};
 const db=createAdapter(fake);
 assert.deepEqual(await db.prepare('SELECT * FROM t WHERE id=? AND version=?').bind('A','B').first(),{id:'TEST'});
 assert.deepEqual(await db.prepare('SELECT * FROM t').bind().all(),{results:[{id:'TEST'}]});
 assert.equal((await db.prepare('UPDATE t SET status=?').bind('submitted').run()).meta.changes,1);
 assert.equal(calls[0].sql,'SELECT * FROM t WHERE id=$1 AND version=$2');
 assert.deepEqual(calls[0].values,['A','B']);
});