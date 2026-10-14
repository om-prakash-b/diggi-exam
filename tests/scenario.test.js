/* Replays the evaluator script (assignment section 5.2) against the engine and checks key outcomes.
   Run: node prototype/tests/scenario.test.js */
require('../js/data.js');
const E = require('../js/engine.js');
const { advance } = require('../js/store.js');
const D = globalThis.DigiiData;

let state = E.emptyState();
let failures = 0;
const ok = (r) => { if (r.error) throw new Error(r.error); state = r.state; };
const go = (ts) => ok(advance(state, ts));
const ev = (sid) => E.evaluateStudent(state, D.STUDENTS.find((s) => s.id === sid), state.now);
const check = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
const change = (type, fields) => {
  const p = E.previewChange(state, { type, fields }, state.now);
  if (p.error) throw new Error(p.error);
  ok(E.commitChange(state, p, { reason: 'test', ref: '' }));
  return p;
};
const show = (title, ids) => {
  console.log(`\n--- ${title} (${state.now})`);
  ids.forEach((id) => { const e = ev(id); console.log(`${id} ${e.att ? e.att.value + '%' : ''} | ${e.headline.text} | due ${e.due} | refund ${e.refund} | ${E.windowText(e.win)}`); });
};
const WATCH = ['S02', 'S03', 'S04', 'S05', 'S08', 'S09', 'S12'];

// 1. Setup from scratch
const draft = E.defaultSettings('2025-12-12');
Object.assign(draft.cycle, D.LAST_SEMESTER.cycle);
Object.assign(draft.dates, D.LAST_SEMESTER.dates);
Object.assign(draft.fees, D.LAST_SEMESTER.fees);
draft.exceptions.improvement = { ...D.LAST_SEMESTER.improvement };
ok(E.createCycle(state, draft, state.now));

// 2. 5 Nov: S01, S02, S06, S07 go as far as they can (+ S10, S11 register too)
go('2025-11-05T10:00');
check('S03 auto-paid on 3 Nov', state.payments.some((p) => p.sid === 'S03' && p.total === 1200));
ok(E.pay(state, 'S01', state.now, 0));
check('S02 regular blocked at 31 Oct cut-off (71%)', ev('S02').papers.find((p) => p.code === 'CS301').status === 'blocked_att');
ok(E.pay(state, 'S02', state.now, 0));
check('S02 paid only CS204 backlog ₹300', state.payments.find((p) => p.sid === 'S02').total === 300);
ok(E.pay(state, 'S06', state.now, 0));
check('S06 paid ₹1,800 (dues warn only)', state.payments.find((p) => p.sid === 'S06').total === 1800);
ok(E.submitForm(state, 'S07', { BB108: false }, state.now));
ok(E.pay(state, 'S07', state.now, 0));
check('S07 paid ₹1,500 (BB105 only)', state.payments.find((p) => p.sid === 'S07').total === 1500);
ok(E.submitForm(state, 'S10', { PH301: true }, state.now));
ok(E.pay(state, 'S10', state.now, 0));
ok(E.pay(state, 'S11', state.now, 0));
show('5 Nov', WATCH);

// 3. Timeline changes
go('2025-11-11T10:00');
const p11 = change('deadline', { value: '2025-11-12' });
check('S12 keeps 15 Nov (started 09:00, before the cut)', ev('S12').win.end === '2025-11-15T23:59');
check('S08 now has 12 Nov', ev('S08').win.end === '2025-11-12T23:59');
show('11 Nov after deadline cut', WATCH);

go('2025-11-13T10:00');
change('fees', { ...E.current(state).fees, perPaper: 400 });
check('S07 auto-pay on 12 Nov skipped (already paid on 5 Nov)', state.auto.done['S07-pay'].status === 'skipped');
check('S07 paid amount unchanged at ₹1,500', ev('S07').due === 0 && ev('S07').refund === 0);
show('13 Nov after fee revision', WATCH);

go('2025-11-14T10:00');
change('lateWindow', { end: '2025-11-20', fee: 500 });
show('14 Nov after extension', WATCH);

go('2025-11-15T10:00');
ok(E.pay(state, 'S12', state.now, 0));
check('S12 paid ₹1,200 with no late fee (protected to 15 Nov)', state.payments.find((p) => p.sid === 'S12').total === 1200);

go('2025-11-18T10:00');
change('condonation', { programs: ['B.Tech CSE', 'BBA'], min: 65, max: 75, fee: 1000 });
check('S04 (BBA 68%) condonable with catch-up window', ev('S04').attCat === 'condonable' && ev('S04').win.mode === 'catchup');
check('S05 (B.Sc 68%) still blocked — no scheme', ev('S05').attCat === 'fail');
check('S02 condonable', ev('S02').attCat === 'condonable');
check('S09 condonable (74.6%)', ev('S09').attCat === 'condonable');
show('18 Nov after condonation rule', WATCH);
ok(E.applyCondonation(state, 'S04', state.now));
ok(E.pay(state, 'S04', state.now, 0));
check('S04 paid ₹2,200 with no late fee (catch-up)', state.payments.find((p) => p.sid === 'S04').total === 2200);
ok(E.decideCondonation(state, 'S04', true, state.now));
ok(E.applyCondonation(state, 'S02', state.now));
ok(E.pay(state, 'S02', state.now, 0));
ok(E.decideCondonation(state, 'S02', true, state.now));

go('2025-11-21T10:00');
check('S08 auto-paid 23:58 with late fee, counted on time', (() => { const p = state.payments.find((x) => x.sid === 'S08'); return p && p.total === 1700 && p.confirmedAt === '2025-11-21T00:03'; })());
show('21 Nov after S08 payment', WATCH);

go('2025-11-22T10:00');
const p22 = change('cutoff', { value: '2025-11-20' });
console.log('22 Nov preview affected:', p22.rows.filter((r) => r.changed).map((r) => r.sid).join(', '));
check('S02 now passes (77%) and condonation fee ₹1,000 refunded', ev('S02').attCat === 'pass' && ev('S02').refund === 1000);
check('S03 drops to 72% → condonable with catch-up window', ev('S03').attCat === 'condonable' && ev('S03').win.mode === 'catchup');
show('22 Nov after cut-off move', WATCH);

go('2025-11-25T10:00');
change('hold', { sid: 'S11', note: 'Debarred for one semester' });
check('S11 blocked and full refund raised', ev('S11').hold && ev('S11').refund === 1200);
go('2025-11-26T10:00');
check('S03 did not apply in time → blocked, ₹1,200 refunded', ev('S03').attCat === 'fail_expired' && ev('S03').refund === 1200);

go('2025-12-05T10:00');
ok(E.lock(state, state.now));
show('5 Dec locked', WATCH);

go('2025-12-06T10:00');
const p6 = change('correction', { sid: 'S09', point: '2025-10-31', newValue: 75.1, deanApproved: true });
check('S09 passes after correction (75.1%) with catch-up window', ev('S09').attCat === 'pass' && ev('S09').win.mode === 'catchup');
ok(E.pay(state, 'S09', state.now, 0));
check('S09 added to final list as an amendment', state.amendments.length === 1 && state.lock.rows.some((r) => r.sid === 'S09'));
show('6 Dec after S09 correction and payment', WATCH);

const out = E.outputs(state, state.now);
console.log('\nFinal list (v' + state.lock.version + '):');
const by = {};
out.rows.forEach((r) => (by[r.sid] = (by[r.sid] || []).concat(r.code)));
Object.entries(by).forEach(([sid, codes]) => console.log(`  ${sid}: ${codes.join(', ')}`));
console.log('Headcount:', out.papers.map((p) => `${p.code}=${p.total}/old ${p.oldCount}`).join(' '));
console.log('Money:', out.money.map((m) => `${m.sid} paid ${m.paid} due ${m.due} refund ${m.refund}`).join(' | '));
console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
process.exit(failures ? 1 : 0);
