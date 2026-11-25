'use strict';
// Swiss stage: pure pairing logic (500 random 16-club groups). The engine integration is tested in ux-swiss-engine.test.js.
const assert = require('assert');
const S = require('../src/engine/ux-swiss');

let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);

for (let trial = 0; trial < 500; trial++) {
  const ids = Array.from({ length: 16 }, (_, i) => i + 1);
  const sw = S.newSwiss(ids);
  let rounds = 0;
  while (!S.isDone(sw)) {
    const pairs = S.nextPairs(sw);
    const used = new Set(pairs.flat());
    const live = ids.filter((i) => sw.rec[i].w < S.WINS && sw.rec[i].l < S.WINS);
    assert.strictEqual(used.size, pairs.length * 2, 'a club is paired twice');
    assert.strictEqual(used.size, live.length, 'a live club is left unpaired');
    for (const [a, b] of pairs) {
      assert.ok(!sw.played.includes(key(a, b)), 'rematch');
      assert.strictEqual(sw.rec[a].w + '-' + sw.rec[a].l, sw.rec[b].w + '-' + sw.rec[b].l, 'paired across records');
      const w = rnd() < 0.5 ? a : b;
      S.record(sw, w, w === a ? b : a);
    }
    S.endRound(sw);
    assert.ok(++rounds <= S.ROUNDS, 'more than 5 rounds');
  }
  assert.strictEqual(S.qualifiedOf(sw).length, 8, 'exactly 8 clubs reach 3 wins');
  assert.strictEqual(S.standingOf(sw).slice(0, 8).every((id) => sw.rec[id].w === S.WINS), true);
}

// round 1 is seed i v seed i + 8; groups are snake-drawn and balanced
const sw0 = S.newSwiss(Array.from({ length: 16 }, (_, i) => i + 1));
assert.deepStrictEqual(S.nextPairs(sw0)[0], [1, 9]);
const [ga, gb] = S.drawGroups(Array.from({ length: 32 }, (_, i) => i + 1));
assert.strictEqual(ga.length, 16); assert.strictEqual(gb.length, 16);
assert.ok(Math.abs(ga.reduce((a, b) => a + b, 0) - gb.reduce((a, b) => a + b, 0)) <= 16, 'groups are balanced');
console.log('ux-swiss (logic) ok');
