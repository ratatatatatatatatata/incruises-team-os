const assert = require('node:assert/strict');
const queryString = require('query-string');
// Expo Router 57 uses namespace parse/stringify, not the v9 default-only API.
assert.equal(queryString.parse('q=%D0%9C%D0%BE%D0%BD%D0%B3%D0%BE%D0%BB').q, 'Монгол');
assert.equal(queryString.stringify({ q: 'Монгол', n: '1' }, { sort: false }), 'q=%D0%9C%D0%BE%D0%BD%D0%B3%D0%BE%D0%BB&n=1');
assert.doesNotThrow(() => queryString.parse('q=%E0%A4%A'));
assert.doesNotThrow(() => queryString.parse('q=' + '%'.repeat(4096)));
console.log('PASS Expo Router query parse/stringify + malformed input compatibility');
