import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
function render(role, tab, editing = false) {
  const w = { viewer: { userId: 'me', role }, users: [], successMap: null, lessons: [{ id: 'lesson', title: 'Хичээл', content: 'Бодит агуулга', isPublished: true }], progress: [], academyPractices: [], supportMembers: [], drafts: [] };
  const values = [w, tab, editing, false, false, true, '', '']; let i = 0;
  const mocks = {
    'react': { useState: () => [values[i++], () => {}], useCallback: x => x, useEffect: () => {}, useRef: x => ({ current: x }) },
    'react/jsx-runtime': jsx,
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', RefreshControl: 'RefreshControl' },
    '../lib/api': { plainMongolianText: x => x }, '../lib/action-view': {},
    './ui': Object.fromEntries(['Body','Busy','Button','Card','Field','Fold','LinkButton','Title'].map(x => [x,x]).concat([['c',{}]])),
    './admin-panel': { AdminPanel: 'AdminPanel', roleLabel: x => x }, './onboarding': { Onboarding: 'Onboarding' },
    '../../../../app/team-os-data': { officialSources: [] },
  };
  const output = ts.transpileModule(fs.readFileSync('apps/mobile/src/components/workspace.tsx','utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }; vm.runInNewContext(output, { module: mod, exports: mod.exports, require: name => { assert.ok(name in mocks,name); return mocks[name]; } });
  const tree = mod.exports.Workspace({ userId: 'me' }); const nodes = [];
  function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
  walk(tree); return nodes;
}
test('admin without a personal plan sees administration, not forced onboarding', () => {
 const nodes=render('admin','admin'); assert.ok(nodes.some(n=>n.type==='AdminPanel')); assert.ok(!nodes.some(n=>n.type==='Onboarding'));
});
test('all member roles can read lessons without completing the five questions', () => {
 for(const role of ['user','builder','coach','director','admin']) {
  const nodes=render(role,'academy'); assert.ok(!nodes.some(n=>n.type==='Onboarding')); assert.ok(nodes.some(n=>n.props?.children==='Бодит агуулга'));
 }
});
test('ordinary members cannot render admin controls even with a stale admin tab', () => {
 assert.ok(!render('user','admin').some(n=>n.type==='AdminPanel'));
});
test('onboarding is explicit, cancellable and missing-plan pages do not dereference null', () => {
 for(const tab of ['today','path','team','more']) assert.doesNotThrow(()=>render('admin',tab));
 const form=render('user','path',true).find(n=>n.type==='Onboarding'); assert.equal(typeof form.props.onCancel,'function');
});
