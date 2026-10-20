import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as policy from '../lib/supabase/request-policy.ts';
function setup(role, status='active') {
 const calls=[];
 const supabase={from(table){ calls.push(table); return table==='team_members'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,status},error:null})})})}:{select:()=>({order:()=>({limit:async()=>({data:[],error:null})})})}; },auth:{getSession:async()=>({data:{session:{access_token:'cookie-session'}}})}};
 const mocks={zod:{z},'@/lib/supabase/request-auth':{requestAuth:async()=>({supabase,userId:'verified'})},'@/lib/supabase/request-policy':policy,'@/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://test.invalid',publishableKey:'public-test'})}};
 const mod={exports:{}}; const code=ts.transpileModule(fs.readFileSync('app/api/admin/invitations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>mocks[n],Response,URL,fetch:async(url,opts)=>{calls.push(opts.headers.Authorization);return Response.json({ok:true});}});
 return {...mod.exports,calls};
}
test('invitation administration rejects ordinary members and disabled admins',async()=>{
 for(const [role,status] of [['user','active'],['coach','active'],['admin','disabled']]) {const x=setup(role,status);assert.equal((await x.GET(new Request('https://app.test'))).status,403);assert.deepEqual(x.calls,['team_members']);}
});
test('active native admin is verified and forwards the same bearer to invitation service',async()=>{
 const x=setup('admin');const req=new Request('https://app.test',{method:'POST',headers:{authorization:'Bearer h.p.s','content-type':'application/json'},body:JSON.stringify({email:'test@example.com',displayName:'Test',role:'user',sponsorUserId:null,coachUserId:null,teamName:'Test'})});
 assert.equal((await x.POST(req)).status,200);assert.ok(x.calls.includes('Bearer h.p.s'));
});
test('cross-origin invitation writes remain denied',async()=>{const x=setup('admin');assert.equal((await x.POST(new Request('https://app.test',{method:'POST',headers:{origin:'https://other.test'}}))).status,403);assert.equal(x.calls.length,0);});
