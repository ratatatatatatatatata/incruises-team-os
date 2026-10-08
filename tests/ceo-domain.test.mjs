import assert from 'node:assert/strict';
import test from 'node:test';
import {demoSnapshot, snapshotSchema, gatewayInput, eligiblePolicies, validateRanking, ruleReport, evaluateExperiment} from '../lib/ceo/domain.ts';
import {isCeoAdmin, sameOrigin} from '../lib/ceo/access.ts';
const s=structuredClone(demoSnapshot);
const later={...s,asOf:'2026-10-22T08:00:00Z',windowStart:s.asOf,metrics:{...s.metrics,completedMembers14d:12}};
test('CEO access denies non-admin, disabled and anonymous users',()=>{
 assert.equal(isCeoAdmin(null),false);
 for(const role of ['user','builder','coach','director']) assert.equal(isCeoAdmin({role,access:'active'}),false);
 assert.equal(isCeoAdmin({role:'admin',access:'disabled'}),false);
 assert.equal(isCeoAdmin({role:'admin',access:'active'}),true);
});
test('mutation origin fails closed for missing, malformed and cross-origin headers',()=>{
 for(const origin of [undefined,'null','https://evil.test','http://app.test']) assert.equal(sameOrigin(new Request('https://app.test/api/ceo',{headers:origin?{origin}:{}})),false);
 assert.equal(sameOrigin(new Request('https://app.test/api/ceo',{headers:{origin:'https://app.test'}})),true);
});
test('invalid metrics cannot become confirmed facts',()=>{
 assert.equal(snapshotSchema.safeParse(s).success,true);
 assert.equal(snapshotSchema.safeParse({...s,metrics:{...s.metrics,mappedMembers:25}}).success,false);
 assert.equal(snapshotSchema.safeParse({...s,privateNote:'secret'}).success,false);
});
test('gateway payload excludes identifiers, cohort hash and private notes',()=>{
 const text=JSON.stringify(gatewayInput({...s,privateNote:'private secret'},[{policyId:'finish_action',verdict:'accepted',delta:12,experimentId:'secret-id',note:'private secret'}]));
 assert.doesNotMatch(text,/private secret|secret-id|00000000000000000000000000000000|cohort/);
});
test('AI rankings reject unknown, missing, duplicate and ineligible policies',()=>{
 assert.equal(validateRanking(eligiblePolicies(s),s),true);
 for(const ids of [[],['finish_action','finish_action'],['deploy_production']]) assert.equal(validateRanking(ids,s),false);
 const zero={...s,metrics:Object.fromEntries(Object.keys(s.metrics).map(k=>[k,0]))};
 assert.deepEqual(eligiblePolicies(zero),[]);
});
test('human-reviewed history changes subsequent ranking',()=>{
 const history=[{policyId:'assign_mentor',verdict:'accepted',delta:10,experimentId:'e1'}];
 assert.equal(ruleReport(s,history).orderedPolicyIds[0],'assign_mentor');
 assert.equal(ruleReport(s,history).learningCount,1);
 assert.equal(ruleReport(s,[{...history[0],policyId:'finish_action',verdict:'rejected'}]).orderedPolicyIds.at(-1),'finish_action');
});
test('learning rejects early, changed-cohort and small samples',()=>{
 assert.equal(evaluateExperiment(s,s,'finish_action').eligible,false);
 assert.equal(evaluateExperiment(s,{...later,cohort:'11111111111111111111111111111111'},'finish_action').eligible,false);
 assert.equal(evaluateExperiment({...s,metrics:{...s.metrics,activeMembers:9}},{...later,metrics:{...later.metrics,activeMembers:9}},'finish_action').eligible,false);
});
test('outcome percentage points use members, not action counts; mentor direction is reversed',()=>{
 assert.equal(evaluateExperiment(s,later,'finish_action').delta,12.5);
 assert.equal(evaluateExperiment(s,{...later,metrics:{...later.metrics,unassignedMembers:1}},'assign_mentor').delta,8.3);
 assert.equal(evaluateExperiment(s,{...later,metrics:{...later.metrics,completedMembers14d:6}},'finish_action').delta,-12.5);
});
