/* Exam Registration & Eligibility: rules engine.
   Pure functions: every function takes (state, ..., now) and returns a result or a NEW state.
   No DOM, no clock, no storage. In a real deployment this is the service layer behind the API
   (see README for the endpoint mapping). */
(function (root) {
  'use strict';
  const D = () => root.DigiiData;

  // ---------------------------------------------------------------- helpers
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function toMs(ts) {
    const [d, t] = (ts.length > 10 ? ts : ts + 'T00:00').split('T');
    const [y, m, da] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, da, h, mi);
  }
  function fromMs(ms) {
    const x = new Date(ms), p = (n) => String(n).padStart(2, '0');
    return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}T${p(x.getUTCHours())}:${p(x.getUTCMinutes())}`;
  }
  const addDays = (d, n) => fromMs(toMs(d.slice(0, 10)) + n * 864e5).slice(0, 10);
  const addMinutes = (ts, n) => fromMs(toMs(ts) + n * 6e4);
  const eod = (d) => d.slice(0, 10) + 'T23:59';
  const sod = (d) => d.slice(0, 10) + 'T00:00';
  function fmtDate(d) {
    if (!d) return '-';
    const [, m, da] = d.slice(0, 10).split('-').map(Number);
    return `${da} ${MON[m - 1]}`;
  }
  function fmtTs(ts) {
    if (!ts) return '-';
    const [h, mi] = ts.slice(11, 16).split(':').map(Number);
    return `${fmtDate(ts)}, ${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const round1 = (v) => Math.round(v * 10) / 10;
  const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
  const student = (sid) => D().STUDENTS.find((s) => s.id === sid);

  // ---------------------------------------------------------------- state
  function emptyState() {
    return {
      now: '2025-10-25T10:00',
      seq: 1,
      cycle: null, // { createdAt, versions: [{ v, at, settings, title }] }
      forms: {}, // sid -> { startedAt, selection: {code: bool}, updatedAt }
      payments: [], // { id, sid, initiatedAt, confirmedAt, lines:[{unit,label,amount}], total, windowEnd, mode }
      condonation: {}, // sid -> { appliedAt, status: pending|approved|rejected, decidedAt }
      holds: {}, // sid -> { at, note }
      corrections: [], // { id, sid, point, oldValue, newValue, at }
      windows: {}, // sid -> { until, reason, grantedAt }  (catch-up window after a change)
      lock: null, // { at, version, rows, ticketVersions }
      amendments: [],
      notices: {}, // sid -> [{ at, title, lines }]
      audit: [],
      auto: { enabled: true, done: {} },
    };
  }
  const nextId = (state, prefix) => `${prefix}-${String(state.seq++).padStart(3, '0')}`;
  const current = (state) => state.cycle.versions[state.cycle.versions.length - 1].settings;
  function settingsAt(state, ts) {
    let s = state.cycle.versions[0].settings;
    for (const v of state.cycle.versions) if (v.at <= ts) s = v.settings;
    return s;
  }
  function notify(state, sid, at, title, lines) {
    (state.notices[sid] = state.notices[sid] || []).push({ at, title, lines });
  }
  function audit(state, entry) {
    state.audit.push({ id: nextId(state, 'EVT'), ...entry });
  }

  // ---------------------------------------------------------------- settings defaults & validation
  function defaultSettings(examStart) {
    const ex = examStart || '';
    const d = (n) => (ex ? addDays(ex, n) : '');
    return {
      cycle: { name: 'End-semester exams', examStart: ex, programs: D().PROGRAMS.slice() },
      dates: { formOpen: d(-42), deadline: d(-28), lateEnd: '', cutoff: d(-22), lockDate: d(-21) },
      fees: { semester: '', perPaper: '', late: '', condonation: '' },
      attendance: { threshold: 75, basis: 'overall', rounding: 'none' },
      checks: { dues: 'warn' },
      exceptions: { condonation: [], improvement: { allowed: false, max: 2 }, backlogOptOut: true },
      rules: { paymentBasis: 'initiated', protectInProgress: true, catchUpDays: 3, refund: 'refund' },
    };
  }
  function validateSettings(S) {
    const errs = [];
    const c = S.cycle, d = S.dates, f = S.fees;
    if (!c.name) errs.push('Cycle name is required.');
    if (!c.examStart) errs.push('Exam start date is required.');
    if (!c.programs.length) errs.push('Select at least one program.');
    ['formOpen', 'deadline', 'cutoff', 'lockDate'].forEach((k) => { if (!d[k]) errs.push(`Date "${k}" is required.`); });
    if (d.formOpen && d.deadline && d.deadline < d.formOpen) errs.push('Form deadline must be on or after the form-open date.');
    if (d.deadline && d.lockDate && d.lockDate <= d.deadline) errs.push('Lock date must be after the form deadline.');
    if (d.lateEnd && (d.lateEnd <= d.deadline || d.lateEnd >= d.lockDate)) errs.push('Late window must end after the deadline and before the lock date.');
    if (d.cutoff && d.lockDate && d.cutoff >= d.lockDate) errs.push('Attendance cut-off must be before the lock date.');
    if (d.lockDate && c.examStart && d.lockDate >= c.examStart) errs.push('Lock date must be before the exam start date.');
    if (!(Number(f.semester) > 0)) errs.push('Semester exam fee is required.');
    if (!(Number(f.perPaper) > 0)) errs.push('Backlog / improvement fee per paper is required.');
    if (d.lateEnd && !(Number(f.late) > 0)) errs.push('Late fee is required when a late window is set.');
    if (S.exceptions.condonation.length && !(Number(f.condonation) > 0)) errs.push('Condonation fee is required when a condonation rule exists.');
    S.exceptions.condonation.forEach((r, i) => {
      if (!r.programs.length) errs.push(`Condonation rule ${i + 1}: choose programs.`);
      if (!(r.min < r.max)) errs.push(`Condonation rule ${i + 1}: minimum must be below maximum.`);
    });
    const t = Number(S.attendance.threshold);
    if (!(t > 0 && t <= 100)) errs.push('Attendance threshold must be between 1 and 100.');
    return errs;
  }
  function normaliseSettings(S) {
    const n = clone(S);
    ['semester', 'perPaper', 'late', 'condonation'].forEach((k) => (n.fees[k] = Number(n.fees[k]) || 0));
    n.attendance.threshold = Number(n.attendance.threshold);
    n.rules.catchUpDays = Number(n.rules.catchUpDays) || 0;
    n.exceptions.improvement.max = Number(n.exceptions.improvement.max) || 0;
    n.exceptions.condonation = n.exceptions.condonation.map((r) => ({ ...r, min: Number(r.min), max: Number(r.max) }));
    return n;
  }
  function createCycle(state, draft, at) {
    const errs = validateSettings(draft);
    if (errs.length) return { error: errs.join(' ') };
    const next = clone(state);
    const settings = normaliseSettings(draft);
    next.cycle = { createdAt: at, versions: [{ v: 1, at, settings, title: 'Initial setup' }] };
    audit(next, { at, kind: 'setup', actor: 'CoE', title: `Exam cycle created: ${settings.cycle.name}`, reason: 'Initial setup', version: 1, settings });
    return { state: next };
  }

  // ---------------------------------------------------------------- attendance
  function attPoints(state, s) {
    const pts = D().ATT_DATES.map((d, i) => ({ d, v: s.att[i] }));
    for (const c of state.corrections) {
      if (c.sid !== s.id) continue;
      const i = pts.findIndex((p) => p.d === c.point);
      const delta = c.newValue - pts[i].v;
      for (let j = i; j < pts.length; j++) pts[j].v += delta; // corrected sessions are inside every later window too
    }
    return pts;
  }
  function attAt(state, s, date) {
    const pts = attPoints(state, s), t = toMs(date);
    if (t <= toMs(pts[0].d)) return pts[0].v;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (t <= toMs(b.d)) return a.v + ((b.v - a.v) * (t - toMs(a.d))) / (toMs(b.d) - toMs(a.d));
    }
    return pts[pts.length - 1].v;
  }
  function attendanceCheck(state, s, now, S) {
    const thr = S.attendance.threshold, cutoff = S.dates.cutoff;
    const final = now > eod(cutoff);
    const asOf = final ? cutoff : now.slice(0, 10);
    const value = round1(attAt(state, s, asOf));
    const cmp = S.attendance.rounding === 'whole' ? Math.round(value) : value;
    const out = { value, cmp, threshold: thr, cutoff, asOf, final, corrected: state.corrections.some((c) => c.sid === s.id) };
    if (!final) { out.cat = cmp >= thr ? 'ok' : 'risk'; return out; }
    if (cmp >= thr) { out.cat = 'pass'; return out; }
    const rules = (S.exceptions.condonation || []).filter((r) => r.programs.includes(s.program));
    const rule = rules.find((r) => value >= r.min && value < r.max);
    if (!rule) {
      out.cat = 'fail';
      out.noRoute = rules.length ? `${value}% is below the ${rules[0].min}% condonation minimum` : `no condonation scheme covers ${s.program}`;
      return out;
    }
    out.rule = rule;
    const app = state.condonation[s.id];
    if (app && app.status === 'approved') out.cat = 'condoned';
    else if (app && app.status === 'pending') out.cat = 'cond_pending';
    else if (app && app.status === 'rejected') { out.cat = 'fail'; out.noRoute = 'your condonation request was rejected'; }
    else out.cat = 'condonable';
    return out;
  }

  // ---------------------------------------------------------------- registration window
  function regWindow(state, s, now, S) {
    const form = state.forms[s.id];
    let deadline = S.dates.deadline, protectedDeadline = null;
    if (S.rules.protectInProgress && form && form.startedAt) {
      const shown = settingsAt(state, form.startedAt).dates.deadline;
      if (shown > deadline) { deadline = shown; protectedDeadline = shown; }
    }
    const lateEnd = S.dates.lateEnd && S.dates.lateEnd > deadline ? S.dates.lateEnd : null;
    const cu = state.windows[s.id] || null;
    const examStart = sod(S.cycle.examStart);
    let mode = 'closed', end = null;
    if (now < sod(S.dates.formOpen)) mode = 'not_open';
    else if (!state.lock && now <= eod(deadline)) { mode = 'open'; end = eod(deadline); }
    else if (cu && now <= eod(cu.until) && now < examStart) { mode = 'catchup'; end = eod(cu.until); }
    else if (!state.lock && lateEnd && now <= eod(lateEnd)) { mode = 'late'; end = eod(lateEnd); }
    return { mode, end, deadline, protectedDeadline, globalDeadline: S.dates.deadline, lateEnd, catchUp: cu, formOpen: S.dates.formOpen };
  }
  const CAN_ACT = ['open', 'catchup', 'late'];

  // ---------------------------------------------------------------- per-student evaluation
  const PAPER_STATUS = {
    cleared: { label: 'Cleared', tone: 'ok' },
    registered_provisional: { label: 'Registered, provisional until cut-off', tone: 'info' },
    processing: { label: 'Payment processing', tone: 'info' },
    payment_due: { label: 'Payment due', tone: 'warn' },
    condonation_available: { label: 'Condonation available', tone: 'warn' },
    awaiting_condonation: { label: 'Awaiting condonation approval', tone: 'warn' },
    blocked_att: { label: 'Blocked: attendance', tone: 'bad' },
    blocked_hold: { label: 'Blocked: disciplinary hold', tone: 'bad' },
    blocked_dues: { label: 'Blocked: tuition dues', tone: 'bad' },
    not_registered: { label: 'Not registered: form closed', tone: 'bad' },
    not_open: { label: 'Form not open yet', tone: 'muted' },
    opted_out: { label: 'Opted out: carried forward', tone: 'muted' },
    not_selected: { label: 'Not selected', tone: 'muted' },
  };

  function evaluateStudent(state, s, now) {
    const S = current(state);
    const e = { id: s.id, s, inCycle: S.cycle.programs.includes(s.program) };
    if (!e.inCycle) {
      return Object.assign(e, { papers: [], due: 0, refund: 0, paidTotal: 0, dueLines: [], refundLines: [], payments: [], why: [`${s.program} is not part of this exam cycle.`], headline: { tone: 'muted', text: 'Not part of this exam cycle', next: '' }, regCatRaw: 'blocked', needsRegularAction: false, win: { mode: 'closed' }, att: null });
    }
    const C = D().COURSES;
    const form = state.forms[s.id] || null;
    const sel = (form && form.selection) || {};
    const papers = [];
    s.courses.forEach((code) => papers.push({ code, type: 'regular', selected: true }));
    s.results.filter((r) => r.grade === 'F').forEach((r) => papers.push({ code: r.code, type: 'backlog', fromSem: r.sem, selected: S.exceptions.backlogOptOut ? sel[r.code] !== false : true }));
    if (S.exceptions.improvement.allowed) {
      s.results.filter((r) => r.grade !== 'F').forEach((r) => papers.push({ code: r.code, type: 'improvement', fromSem: r.sem, grade: r.grade, selected: sel[r.code] === true }));
    }
    papers.forEach((p) => (p.name = (C[p.code] || {}).name || p.code));

    const att = attendanceCheck(state, s, now, S);
    const win = regWindow(state, s, now, S);
    const canAct = CAN_ACT.includes(win.mode);
    const hold = state.holds[s.id] || null;
    const duesBlock = S.checks.dues === 'block' && s.dues > 0;
    let attCat = att.cat;
    if (attCat === 'condonable' && !canAct && win.mode !== 'not_open') attCat = 'fail_expired';

    const regularAllowed = !hold && !duesBlock && !['fail', 'fail_expired'].includes(attCat);
    const otherAllowed = !hold && !duesBlock;
    const regular = papers.filter((p) => p.type === 'regular');

    // what the student must have paid for, at today's rates
    const req = {};
    if (regularAllowed && regular.length) req.SEM = { label: 'Semester exam fee', amount: S.fees.semester };
    papers.filter((p) => p.type !== 'regular' && p.selected && otherAllowed).forEach((p) => {
      req['P:' + p.code] = { label: `${p.type === 'backlog' ? 'Backlog' : 'Improvement'} paper ${p.code}`, amount: S.fees.perPaper };
    });
    if (['cond_pending', 'condoned'].includes(attCat)) req.COND = { label: 'Condonation fee', amount: S.fees.condonation };

    // what has been paid (fee fixed at the rate on the day of payment)
    const paid = {}, paidLabel = {}, processingUnits = new Set(), payments = [], invalidLines = [];
    for (const p of state.payments.filter((x) => x.sid === s.id)) {
      const valid = S.rules.paymentBasis === 'initiated' ? true : p.confirmedAt <= p.windowEnd;
      const pending = now < p.confirmedAt;
      payments.push({ ...p, valid, pending });
      if (!valid) { p.lines.forEach((l) => invalidLines.push({ ...l, reason: 'Bank confirmation arrived after the window closed' })); continue; }
      p.lines.forEach((l) => {
        paid[l.unit] = (paid[l.unit] || 0) + l.amount;
        paidLabel[l.unit] = l.label;
        if (pending) processingUnits.add(l.unit);
      });
    }
    const coreUnits = Object.keys(req);
    const unpaidCore = coreUnits.filter((u) => !paid[u]);
    if (paid.LATE) req.LATE = { label: 'Late fee', amount: paid.LATE };
    else if (unpaidCore.length && win.mode === 'late') req.LATE = { label: 'Late fee', amount: S.fees.late };
    if (!coreUnits.length) delete req.LATE;

    const dueLines = Object.entries(req).filter(([u]) => !paid[u]).map(([unit, v]) => ({ unit, ...v }));
    const refundReason = (u) => {
      if (hold) return 'Disciplinary hold: not writing this cycle';
      if (duesBlock) return 'Blocked for tuition dues';
      if (u === 'SEM') return 'Not eligible for regular papers';
      if (u === 'COND') return att.cat === 'pass' ? 'Condonation no longer needed: attendance now meets the rule' : 'Condonation not granted';
      if (u === 'LATE') return 'No papers left to write';
      return 'Paper dropped';
    };
    const refundLines = Object.keys(paid).filter((u) => !req[u]).map((u) => ({ unit: u, label: paidLabel[u], amount: paid[u], reason: refundReason(u) })).concat(invalidLines);

    // paper statuses
    papers.forEach((p) => {
      const unit = p.type === 'regular' ? 'SEM' : 'P:' + p.code;
      let st;
      if (p.type !== 'regular' && !p.selected) st = p.type === 'backlog' ? 'opted_out' : 'not_selected';
      else if (hold) st = 'blocked_hold';
      else if (duesBlock) st = 'blocked_dues';
      else if (p.type === 'regular' && ['fail', 'fail_expired'].includes(attCat)) st = 'blocked_att';
      else if (p.type === 'regular' && attCat === 'condonable') st = 'condonation_available';
      else if (!paid[unit] || (p.type === 'regular' && req.COND && !paid.COND)) st = win.mode === 'not_open' ? 'not_open' : canAct ? 'payment_due' : 'not_registered';
      else if (processingUnits.has(unit)) st = 'processing';
      else if (p.type === 'regular' && attCat === 'cond_pending') st = 'awaiting_condonation';
      else if (p.type === 'regular' && !att.final) st = 'registered_provisional';
      else st = 'cleared';
      p.status = st;
      p.fee = p.type === 'regular' ? null : paid[unit] || req[unit]?.amount || S.fees.perPaper;
    });

    Object.assign(e, {
      S, att, attCat, win, canAct, hold, duesBlock, papers, payments, paid,
      dueLines, due: sum(dueLines, (l) => l.amount),
      refundLines, refund: sum(refundLines, (l) => l.amount),
      paidTotal: sum(payments.filter((p) => p.valid), (p) => p.total),
    });
    e.regCatRaw = hold || duesBlock ? 'blocked' : ['pass', 'ok', 'risk'].includes(att.cat) ? 'eligible' : ['condonable', 'cond_pending', 'condoned'].includes(att.cat) ? 'condonation' : 'blocked';
    e.needsRegularAction = e.regCatRaw !== 'blocked' && regular.length > 0 && (att.cat === 'condonable' || !paid.SEM || (req.COND && !paid.COND));
    e.headline = headline(e, state);
    e.why = whyLines(e, state);
    return e;
  }

  function headline(e, state) {
    const { S, win, att, papers } = e;
    const has = (st) => papers.some((p) => p.status === st);
    const count = (st) => papers.filter((p) => p.status === st).length;
    const cleared = count('cleared'), prov = count('registered_provisional');
    const refundNote = e.refund ? ` A refund of ${inr(e.refund)} has been raised.` : '';
    if (e.hold) return { tone: 'bad', text: 'Blocked: disciplinary hold', next: 'Contact the CoE office.' + refundNote };
    if (e.duesBlock) return { tone: 'bad', text: 'Blocked: tuition dues outstanding', next: `Clear ${inr(e.s.dues)} tuition dues with Accounts.` + refundNote };
    if (win.mode === 'not_open' && !e.paidTotal) return { tone: 'muted', text: `Exam form opens on ${fmtDate(win.formOpen)}`, next: 'Check back when the form opens. Your attendance so far is shown below.' };
    if (has('condonation_available')) return { tone: 'warn', text: `Action needed: apply for condonation by ${fmtTs(win.end)}`, next: `Apply for condonation, then pay the condonation fee (${inr(S.fees.condonation)})${e.paid.SEM ? '' : ' and the semester exam fee'}. The CoE then approves.` + refundNote };
    if (e.due > 0 && e.canAct) return { tone: 'warn', text: `Action needed: pay ${inr(e.due)} by ${fmtTs(win.end)}`, next: 'Review your papers below, then pay.' + refundNote };
    if (has('awaiting_condonation')) return { tone: 'info', text: 'Waiting for CoE approval of your condonation', next: 'Nothing to do. You will be notified when the CoE decides.' + refundNote };
    if (has('processing')) return { tone: 'info', text: 'Payment processing, waiting for bank confirmation', next: 'Your payment counts from the time you started it.' };
    if (cleared + prov > 0) {
      const blockedNote = has('blocked_att') ? ' (regular papers blocked for attendance)' : '';
      if (prov) return { tone: 'info', text: `Registered for ${cleared + prov} paper(s), provisional until the attendance cut-off (${fmtDate(att.cutoff)})`, next: att.cat === 'risk' ? `Your attendance is below ${att.threshold}%. Attend classes before ${fmtDate(att.cutoff)} to stay eligible.` : 'Keep your attendance above the requirement until the cut-off.' };
      const lockedFor = state.lock && state.lock.rows.some((r) => r.sid === e.id);
      return { tone: blockedNote ? 'warn' : 'ok', text: (lockedFor ? `Hall ticket ready: ${cleared} paper(s)` : `Registered and cleared for ${cleared} paper(s)`) + blockedNote, next: (lockedFor ? 'Download your hall ticket below.' : state.lock ? 'Your hall ticket will update shortly.' : `Hall tickets are published on ${fmtDate(S.dates.lockDate)}.`) + refundNote };
    }
    if (has('blocked_att')) return { tone: 'bad', text: 'Not eligible to write regular papers this cycle', next: 'See the reason below.' + refundNote };
    if (has('not_registered')) return { tone: 'bad', text: 'Not registered: the exam form closed', next: 'Contact the exam cell.' + refundNote };
    return { tone: 'muted', text: 'Nothing to register', next: refundNote };
  }

  function whyLines(e, state) {
    const { S, att, win, s } = e;
    const lines = [];
    const thr = `${att.threshold}%${S.attendance.rounding === 'whole' ? ' (rounded to whole %)' : ''}`;
    if (!att.final) lines.push(`Attendance so far: ${att.value}%. Cut-off ${fmtDate(att.cutoff)}; rule ${thr}. ${att.cat === 'risk' ? 'You are currently below the rule.' : 'On track.'}`);
    else lines.push(`Attendance at the cut-off (${fmtDate(att.cutoff)}): ${att.value}%${att.corrected ? ' (includes an approved correction)' : ''}. Rule: ${thr}.`);
    if (att.rule && ['condonable', 'cond_pending', 'condoned'].includes(att.cat)) lines.push(`Condonation applies to ${s.program} for ${att.rule.min}–${att.rule.max}% (fee ${inr(S.fees.condonation)}). Status: ${att.cat === 'condoned' ? 'approved' : att.cat === 'cond_pending' ? 'applied, awaiting approval' : 'available: not applied yet'}.`);
    if (e.attCat === 'fail_expired') lines.push('Condonation was available but was not applied for before your window closed.');
    if (att.final && e.attCat === 'fail') lines.push(`Not eligible for regular papers: ${att.noRoute}.`);
    if (['fail', 'fail_expired'].includes(e.attCat) && e.papers.some((p) => p.type !== 'regular')) lines.push("Backlog and improvement papers are not affected by this semester's attendance.");
    if (s.dues > 0) lines.push(S.checks.dues === 'block' ? `Tuition dues of ${inr(s.dues)} block exam registration (university policy).` : `Tuition dues of ${inr(s.dues)} are outstanding. University policy: this is a warning only and does not block your exam.`);
    if (e.hold) lines.push(`Disciplinary hold from ${fmtDate(e.hold.at)}: ${e.hold.note}.`);
    if (win.mode === 'open') lines.push(`Exam form open until ${fmtTs(win.end)}.` + (win.protectedDeadline ? ` You started before the deadline was changed, so you keep ${fmtDate(win.protectedDeadline)}.` : ''));
    if (win.mode === 'late') lines.push(`The fee-free deadline (${fmtDate(win.deadline)}) has passed. Late window until ${fmtTs(win.end)}, late fee ${inr(S.fees.late)}.`);
    if (win.mode === 'catchup') lines.push(`A rule change affected you, so you have until ${fmtTs(win.end)} to act, with no late fee.`);
    if (win.mode === 'closed' && e.papers.some((p) => ['payment_due', 'not_registered'].includes(p.status))) lines.push('The exam form is closed.');
    e.payments.filter((p) => p.confirmedAt > p.windowEnd && p.valid).forEach((p) => lines.push(`Your payment started at ${fmtTs(p.initiatedAt)} and the bank confirmed at ${fmtTs(p.confirmedAt)}. It counts as on time because the payment start time is used.`));
    e.refundLines.forEach((l) => lines.push(`Refund due ${inr(l.amount)} (${l.label}): ${l.reason}.`));
    return lines;
  }

  function evaluateAll(state, now) {
    const out = {};
    D().STUDENTS.forEach((s) => (out[s.id] = evaluateStudent(state, s, now)));
    return out;
  }
  // A window change only matters to a student who still has something to do (pay or apply).
  const needsAction = (e) => e.inCycle && (e.due > 0 || e.attCat === 'condonable' || e.papers.some((p) => p.status === 'payment_due'));
  const signature = (e, withWindow) => JSON.stringify({ p: e.papers.map((p) => p.code + p.status), due: e.due, refund: e.refund, att: e.attCat, win: withWindow ? [e.win.mode, e.win.end] : null });

  // ---------------------------------------------------------------- final list
  function rowsFromEval(evals, state) {
    const rows = [];
    Object.values(evals).forEach((e) => e.papers.filter((p) => p.status === 'cleared').forEach((p) => rows.push({ sid: e.id, name: e.s.name, program: e.s.program, sem: e.s.sem, code: p.code, paper: p.name, type: p.type })));
    return rows;
  }
  const liveRows = (state, now) => rowsFromEval(evaluateAll(state, now), state);
  function diffRows(oldRows, newRows) {
    const k = (r) => r.sid + ':' + r.code;
    const o = new Set(oldRows.map(k)), n = new Set(newRows.map(k));
    return { added: newRows.filter((r) => !o.has(k(r))), removed: oldRows.filter((r) => !n.has(k(r))) };
  }
  // After lock: any state change that alters the list becomes a versioned amendment.
  function reconcile(state, at, cause) {
    if (!state.lock) return null;
    const live = liveRows(state, at);
    const diff = diffRows(state.lock.rows, live);
    if (!diff.added.length && !diff.removed.length) return null;
    state.lock.version += 1;
    state.lock.rows = live;
    const sids = [...new Set([...diff.added, ...diff.removed].map((r) => r.sid))];
    sids.forEach((sid) => {
      state.lock.ticketVersions[sid] = (state.lock.ticketVersions[sid] || 1) + 1;
      const add = diff.added.filter((r) => r.sid === sid).map((r) => r.code);
      const rem = diff.removed.filter((r) => r.sid === sid).map((r) => r.code);
      notify(state, sid, at, `Hall ticket updated (v${state.lock.ticketVersions[sid]})`, [add.length ? `Added: ${add.join(', ')}` : null, rem.length ? `Removed: ${rem.join(', ')}` : null, `Reason: ${cause}`].filter(Boolean));
    });
    const am = { id: nextId(state, 'AMD'), at, version: state.lock.version, cause, added: diff.added, removed: diff.removed };
    state.amendments.push(am);
    audit(state, { at, kind: 'amendment', actor: 'System', title: `Final list amended to v${am.version}: +${diff.added.length} / −${diff.removed.length} paper entries`, reason: cause, amendment: am });
    return am;
  }

  // ---------------------------------------------------------------- phase
  function phase(state, now) {
    if (!state.cycle) return { key: 'setup', label: 'Not set up: create the exam cycle', tone: 'muted' };
    const S = current(state);
    if (now >= sod(S.cycle.examStart)) return { key: 'exams', label: 'Exams in progress: changes frozen', tone: 'muted' };
    if (state.lock) return { key: 'published', label: `Final list locked & published (v${state.lock.version}): changes only as amendments`, tone: 'ok' };
    if (now < sod(S.dates.formOpen)) return { key: 'scheduled', label: `Scheduled: exam form opens ${fmtDate(S.dates.formOpen)}`, tone: 'muted' };
    if (now <= eod(S.dates.deadline)) return { key: 'open', label: `Exam form open: deadline ${fmtDate(S.dates.deadline)}`, tone: 'info' };
    if (S.dates.lateEnd && now <= eod(S.dates.lateEnd)) return { key: 'late', label: `Late window until ${fmtDate(S.dates.lateEnd)} (late fee ${inr(S.fees.late)})`, tone: 'warn' };
    return { key: 'review', label: `Form closed: review and lock (scheduled ${fmtDate(S.dates.lockDate)})`, tone: 'warn' };
  }

  // ---------------------------------------------------------------- admin changes
  const CHANGE_TYPES = {
    deadline: { label: 'Change form deadline', owner: 'CoE' },
    fees: { label: 'Revise fees', owner: 'Accounts' },
    lateWindow: { label: 'Open / extend late window', owner: 'CoE + Accounts' },
    condonation: { label: 'Add condonation rule', owner: 'CoE' },
    cutoff: { label: 'Move attendance cut-off', owner: 'CoE (on Dean request)' },
    threshold: { label: 'Change attendance threshold', owner: 'CoE' },
    dues: { label: 'Tuition dues policy', owner: 'CoE + Accounts' },
    improvement: { label: 'Improvement attempts', owner: 'CoE' },
    lockDate: { label: 'Change lock & publish date', owner: 'CoE' },
    correction: { label: 'Attendance correction', owner: 'Faculty, approved by Dean' },
    hold: { label: 'Place disciplinary hold', owner: 'CoE (disciplinary committee order)' },
    releaseHold: { label: 'Release disciplinary hold', owner: 'CoE' },
  };
  const SETTINGS_CHANGES = ['deadline', 'fees', 'lateWindow', 'condonation', 'cutoff', 'threshold', 'dues', 'improvement', 'lockDate'];

  function changeDefaults(state, type) {
    const S = current(state);
    switch (type) {
      case 'deadline': return { value: S.dates.deadline };
      case 'fees': return { ...S.fees };
      case 'lateWindow': return { end: S.dates.lateEnd || '', fee: S.fees.late || '' };
      case 'condonation': return { programs: [], min: 65, max: S.attendance.threshold, fee: S.fees.condonation || '' };
      case 'cutoff': return { value: S.dates.cutoff };
      case 'threshold': return { value: S.attendance.threshold };
      case 'dues': return { value: S.checks.dues };
      case 'improvement': return { allowed: S.exceptions.improvement.allowed, max: S.exceptions.improvement.max };
      case 'lockDate': return { value: S.dates.lockDate };
      case 'correction': return { sid: 'S09', point: D().ATT_DATES[0], newValue: '', deanApproved: false };
      case 'hold': return { sid: 'S11', note: '' };
      case 'releaseHold': return { sid: Object.keys(state.holds)[0] || 'S11' };
      default: return {};
    }
  }

  function validateChange(state, c, now) {
    if (!state.cycle) return 'Set up the exam cycle first.';
    const S = current(state), f = c.fields || {};
    const ph = phase(state, now).key;
    if (ph === 'exams') return 'Exams have started. Changes are frozen for this cycle.';
    if (SETTINGS_CHANGES.includes(c.type) && state.lock) return 'The final list is locked. Settings can no longer change; only attendance corrections and holds can, and they become amendments.';
    switch (c.type) {
      case 'deadline':
        if (!f.value) return 'Enter the new deadline.';
        if (f.value === S.dates.deadline) return 'The deadline is already this date.';
        if (f.value < S.dates.formOpen) return 'Deadline cannot be before the form opens.';
        if (f.value >= S.dates.lockDate) return 'Deadline must be before the lock date.';
        if (S.dates.lateEnd && f.value >= S.dates.lateEnd) return 'Deadline must be before the end of the late window.';
        return null;
      case 'fees':
        if (['semester', 'perPaper'].some((k) => !(Number(f[k]) > 0))) return 'Semester and per-paper fees must be positive.';
        if (['semester', 'perPaper', 'late', 'condonation'].every((k) => Number(f[k] || 0) === Number(S.fees[k] || 0))) return 'No fee has changed.';
        return null;
      case 'lateWindow':
        if (!f.end) return 'Enter the late window end date.';
        if (f.end <= S.dates.deadline) return 'Late window must end after the fee-free deadline.';
        if (f.end >= S.dates.lockDate) return 'Late window must end before the lock date.';
        if (!(Number(f.fee) > 0)) return 'Enter the late fee.';
        return null;
      case 'condonation':
        if (!f.programs || !f.programs.length) return 'Choose at least one program.';
        if (!(Number(f.min) < Number(f.max))) return 'Minimum must be below maximum.';
        if (!(Number(f.fee) > 0)) return 'Enter the condonation fee.';
        return null;
      case 'cutoff':
        if (!f.value) return 'Enter the new cut-off date.';
        if (f.value === S.dates.cutoff) return 'The cut-off is already this date.';
        if (f.value >= S.dates.lockDate) return 'Cut-off must be before the lock date.';
        return null;
      case 'threshold':
        if (!(Number(f.value) > 0 && Number(f.value) <= 100)) return 'Threshold must be between 1 and 100.';
        return null;
      case 'improvement':
        if (now > eod(S.dates.deadline)) return 'Improvement rules can only change before the form deadline.';
        return null;
      case 'lockDate':
        if (!f.value || f.value <= S.dates.cutoff || f.value >= S.cycle.examStart) return 'Lock date must be after the cut-off and before exams start.';
        if (f.value < now.slice(0, 10)) return 'Lock date cannot be in the past.';
        return null;
      case 'correction': {
        if (!f.sid) return 'Choose a student.';
        const v = Number(f.newValue);
        if (!(v >= 0 && v <= 100) || f.newValue === '') return 'Enter the corrected percentage.';
        if (now > eod(S.dates.cutoff) && !f.deanApproved) return 'The cut-off has passed: a correction needs Dean approval.';
        return null;
      }
      case 'hold':
        if (!f.sid) return 'Choose a student.';
        if (state.holds[f.sid]) return 'This student already has a hold.';
        return null;
      case 'releaseHold':
        if (!state.holds[f.sid]) return 'This student has no hold.';
        return null;
      default: return 'Unknown change.';
    }
  }

  // Applies a change to a copy of the state. Returns a human title.
  function applyRaw(state, c, now) {
    const f = c.fields, S = clone(current(state));
    let title;
    const pushVersion = () => state.cycle.versions.push({ v: state.cycle.versions.length + 1, at: now, settings: S, title });
    switch (c.type) {
      case 'deadline': title = `Form deadline changed: ${fmtDate(S.dates.deadline)} → ${fmtDate(f.value)}`; S.dates.deadline = f.value; pushVersion(); break;
      case 'fees': {
        const names = { semester: 'Semester fee', perPaper: 'Backlog/improvement fee per paper', late: 'Late fee', condonation: 'Condonation fee' };
        const parts = Object.keys(names).filter((k) => Number(f[k] || 0) !== Number(S.fees[k] || 0)).map((k) => `${names[k]} ${inr(S.fees[k])} → ${inr(f[k])}`);
        title = `Fees revised: ${parts.join('; ')} (new payments only)`;
        Object.keys(names).forEach((k) => (S.fees[k] = Number(f[k]) || 0));
        pushVersion(); break;
      }
      case 'lateWindow': title = `Late window until ${fmtDate(f.end)} with ${inr(f.fee)} late fee`; S.dates.lateEnd = f.end; S.fees.late = Number(f.fee); pushVersion(); break;
      case 'condonation':
        title = `Condonation rule added: ${f.programs.join(', ')} · ${f.min}–${f.max}% · fee ${inr(f.fee)}`;
        S.exceptions.condonation.push({ programs: f.programs.slice(), min: Number(f.min), max: Number(f.max) });
        S.fees.condonation = Number(f.fee); pushVersion(); break;
      case 'cutoff': title = `Attendance cut-off moved: ${fmtDate(S.dates.cutoff)} → ${fmtDate(f.value)}`; S.dates.cutoff = f.value; pushVersion(); break;
      case 'threshold': title = `Attendance threshold: ${S.attendance.threshold}% → ${f.value}%`; S.attendance.threshold = Number(f.value); pushVersion(); break;
      case 'dues': title = `Tuition dues policy: ${S.checks.dues} → ${f.value}`; S.checks.dues = f.value; pushVersion(); break;
      case 'improvement': title = `Improvement attempts: ${f.allowed ? `allowed (max ${f.max})` : 'not allowed'}`; S.exceptions.improvement = { allowed: !!f.allowed, max: Number(f.max) || 0 }; pushVersion(); break;
      case 'lockDate': title = `Lock & publish date: ${fmtDate(S.dates.lockDate)} → ${fmtDate(f.value)}`; S.dates.lockDate = f.value; pushVersion(); break;
      case 'correction': {
        const s = student(f.sid);
        const i = D().ATT_DATES.indexOf(f.point);
        const old = round1(attPoints(state, s)[i].v);
        title = `Attendance correction for ${s.id} ${s.name}: figure to ${fmtDate(f.point)} ${old}% → ${Number(f.newValue)}%`;
        state.corrections.push({ id: nextId(state, 'COR'), sid: f.sid, point: f.point, oldValue: old, newValue: Number(f.newValue), at: now });
        break;
      }
      case 'hold': { const s = student(f.sid); title = `Disciplinary hold placed on ${s.id} ${s.name}`; state.holds[f.sid] = { at: now, note: f.note || 'Disciplinary committee order' }; break; }
      case 'releaseHold': { const s = student(f.sid); title = `Disciplinary hold released for ${s.id} ${s.name}`; delete state.holds[f.sid]; break; }
    }
    return title;
  }

  function windowText(win) {
    if (!win || !win.mode) return '-';
    return { open: `Open till ${fmtTs(win.end)}`, catchup: `Catch-up till ${fmtTs(win.end)}`, late: `Late window till ${fmtTs(win.end)}`, closed: 'Closed', not_open: `Opens ${fmtDate(win.formOpen)}` }[win.mode];
  }
  function attText(e) { return e.att ? `${e.att.value}%${e.att.final ? '' : ' (so far)'}` : '-'; }

  function changeNotes(b, a, granted, c) {
    const lines = [];
    if (!a.inCycle) return lines;
    if (b.att && a.att && (b.att.value !== a.att.value || b.att.asOf !== a.att.asOf)) lines.push(`Attendance used: ${b.att.value}% (to ${fmtDate(b.att.asOf)}) → ${a.att.value}% (to ${fmtDate(a.att.asOf)})`);
    // paper changes, grouped
    const groups = {};
    a.papers.forEach((p) => {
      const bp = b.papers.find((x) => x.code === p.code);
      const from = bp ? PAPER_STATUS[bp.status].label : 'Not offered';
      if (bp && bp.status === p.status) return;
      const key = `${p.type}|${from}|${PAPER_STATUS[p.status].label}`;
      (groups[key] = groups[key] || []).push(p.code);
    });
    Object.entries(groups).forEach(([k, codes]) => { const [type, from, to] = k.split('|'); lines.push(`${type === 'regular' ? 'Regular papers' : codes.join(', ')}: ${from} → ${to}`); });
    if (b.due !== a.due) lines.push(`Amount due: ${inr(b.due)} → ${inr(a.due)}`);
    if (a.refund > b.refund) lines.push(`Refund raised: ${inr(a.refund - b.refund)}. Reason: ${a.refundLines.map((l) => l.reason).filter((v, i, arr) => arr.indexOf(v) === i).join('; ')}`);
    if (a.refund < b.refund) lines.push(`Refund cancelled: ${inr(b.refund - a.refund)} (fee needed again)`);
    if (windowText(b.win) !== windowText(a.win)) lines.push(`Window: ${windowText(b.win)} → ${windowText(a.win)}`);
    if (c && c.type === 'deadline' && a.win.protectedDeadline) lines.push(`Keeps the ${fmtDate(a.win.protectedDeadline)} deadline: started the form before this change.`);
    if (granted) lines.push(`Catch-up window granted until ${fmtTs(eod(granted))}, no late fee.`);
    return lines;
  }

  function previewChange(state, c, now) {
    const error = validateChange(state, c, now);
    if (error) return { error };
    const before = evaluateAll(state, now);
    const next = clone(state);
    const title = applyRaw(next, c, now);
    const S = current(next);
    // Students whose eligibility category the change flips, and who now need to act after their
    // window has closed, get a short catch-up window with no late fee.
    const mid = evaluateAll(next, now);
    const granted = {};
    Object.values(mid).forEach((a) => {
      const b = before[a.id];
      if (!a.inCycle || b.regCatRaw === a.regCatRaw || !a.needsRegularAction || a.win.mode === 'open') return;
      if (now >= sod(S.cycle.examStart) || S.rules.catchUpDays <= 0) return;
      const until = addDays(now, S.rules.catchUpDays);
      next.windows[a.id] = { until, reason: title, grantedAt: now };
      granted[a.id] = until;
    });
    const after = evaluateAll(next, now);
    const rows = D().STUDENTS.map((s) => {
      const b = before[s.id], a = after[s.id];
      return {
        sid: s.id, name: s.name, program: s.program,
        changed: signature(b, needsAction(b) || needsAction(a)) !== signature(a, needsAction(b) || needsAction(a)) || !!granted[s.id],
        before: { att: attText(b), status: b.headline.text, tone: b.headline.tone, due: b.due, refund: b.refund, window: windowText(b.win) },
        after: { att: attText(a), status: a.headline.text, tone: a.headline.tone, due: a.due, refund: a.refund, window: windowText(a.win) },
        notes: changeNotes(b, a, granted[s.id], c),
      };
    });
    const listDiff = state.lock ? diffRows(state.lock.rows, rowsFromEval(after, next)) : null;
    const summary = {
      affected: rows.filter((r) => r.changed).length,
      dueBefore: sum(Object.values(before), (e) => e.due), dueAfter: sum(Object.values(after), (e) => e.due),
      refundBefore: sum(Object.values(before), (e) => e.refund), refundAfter: sum(Object.values(after), (e) => e.refund),
      granted: Object.keys(granted),
      listAdded: listDiff ? listDiff.added.length : 0, listRemoved: listDiff ? listDiff.removed.length : 0,
      settingsVersion: SETTINGS_CHANGES.includes(c.type) ? next.cycle.versions.length : null,
    };
    return { change: clone(c), title, rows, summary, listDiff, next, at: now };
  }

  function commitChange(state, preview, meta) {
    if (!meta.reason) return { error: 'Enter a reason before confirming.' };
    const next = clone(preview.next);
    const at = preview.at;
    const owner = CHANGE_TYPES[preview.change.type].owner;
    preview.rows.filter((r) => r.changed).forEach((r) => notify(next, r.sid, at, preview.title, r.notes.length ? r.notes : ['Your status was rechecked.']));
    audit(next, {
      at, kind: 'change', actor: owner, title: preview.title, reason: meta.reason, ref: meta.ref || '', changeType: preview.change.type,
      version: preview.summary.settingsVersion, summary: preview.summary, rows: preview.rows, listDiff: preview.listDiff,
    });
    reconcile(next, at, preview.title);
    return { state: next };
  }

  // ---------------------------------------------------------------- student actions
  function submitForm(state, sid, selection, at, source) {
    if (!state.cycle) return { error: 'The exam cycle is not set up yet.' };
    const s = student(sid);
    const e = evaluateStudent(state, s, at);
    if (!e.inCycle) return { error: 'You are not part of this exam cycle.' };
    if (!e.canAct) return { error: 'The exam form is not open for you right now.' };
    const S = current(state);
    const sel = { ...((state.forms[sid] || {}).selection || {}), ...(selection || {}) };
    const imp = e.papers.filter((p) => p.type === 'improvement' && sel[p.code]).length;
    if (imp > S.exceptions.improvement.max) return { error: `You can choose at most ${S.exceptions.improvement.max} improvement paper(s).` };
    const next = clone(state);
    const first = !next.forms[sid];
    next.forms[sid] = { startedAt: (next.forms[sid] || {}).startedAt || at, selection: sel, updatedAt: at };
    const after = evaluateStudent(next, s, at);
    const choice = after.papers.filter((p) => p.type !== 'regular').map((p) => `${p.code} ${p.selected ? 'kept' : 'not taken'}`).join(', ');
    audit(next, { at, kind: source || 'student', actor: `${sid} (student)`, title: `${sid} ${first ? 'started the exam form' : 'updated paper choices'}${choice ? ': ' + choice : ''}` });
    notify(next, sid, at, first ? 'Exam form started' : 'Paper choices saved', [choice || 'Regular papers confirmed.', after.due ? `Amount to pay: ${inr(after.due)} by ${fmtTs(after.win.end)}` : 'Nothing to pay right now.']);
    reconcile(next, at, `${sid} updated paper choices`);
    return { state: next };
  }

  function pay(state, sid, at, delayMin, source) {
    if (!state.cycle) return { error: 'The exam cycle is not set up yet.' };
    const s = student(sid);
    const e = evaluateStudent(state, s, at);
    if (!e.canAct) return { error: 'The payment window is closed for you.' };
    if (e.due <= 0) return { error: 'Nothing to pay.' };
    const next = clone(state);
    if (!next.forms[sid]) next.forms[sid] = { startedAt: at, selection: {}, updatedAt: at };
    const p = { id: nextId(next, 'PAY'), sid, initiatedAt: at, confirmedAt: addMinutes(at, Number(delayMin) || 0), lines: e.dueLines.map((l) => ({ unit: l.unit, label: l.label, amount: l.amount })), total: e.due, windowEnd: e.win.end, mode: e.win.mode };
    next.payments.push(p);
    const late = p.confirmedAt > p.windowEnd;
    audit(next, { at, kind: source || 'student', actor: `${sid} (student)`, title: `${sid} paid ${inr(p.total)} (${p.lines.map((l) => l.label).join(' + ')})`, reason: `Payment ${p.id}: started ${fmtTs(p.initiatedAt)}, bank confirmation ${fmtTs(p.confirmedAt)}${late ? ': after the window closed; counted on time by payment start time' : ''}` });
    notify(next, sid, at, `Payment ${inr(p.total)} received`, [p.lines.map((l) => `${l.label}: ${inr(l.amount)}`).join(' · '), `Started ${fmtTs(p.initiatedAt)} · bank confirmation ${fmtTs(p.confirmedAt)}`, late ? 'Counted on time: the payment start time is used, not the bank confirmation time.' : 'Fee fixed at today\'s rate.']);
    reconcile(next, at, `${sid} payment ${p.id}`);
    return { state: next };
  }

  function applyCondonation(state, sid, at) {
    const s = student(sid);
    const e = evaluateStudent(state, s, at);
    if (e.attCat !== 'condonable') return { error: 'Condonation is not available to you right now.' };
    const next = clone(state);
    next.condonation[sid] = { appliedAt: at, status: 'pending' };
    if (!next.forms[sid]) next.forms[sid] = { startedAt: at, selection: {}, updatedAt: at };
    const after = evaluateStudent(next, s, at);
    audit(next, { at, kind: 'student', actor: `${sid} (student)`, title: `${sid} applied for condonation (attendance ${e.att.value}%)` });
    notify(next, sid, at, 'Condonation request submitted', [`Pay ${inr(after.due)} by ${fmtTs(after.win.end)}. The CoE approves once the fee is paid.`]);
    return { state: next };
  }

  function decideCondonation(state, sid, approve, at) {
    const s = student(sid);
    const e = evaluateStudent(state, s, at);
    if (e.attCat !== 'cond_pending') return { error: 'No pending condonation request.' };
    if (approve && !e.paid.COND) return { error: 'The condonation fee has not been paid yet.' };
    const next = clone(state);
    next.condonation[sid] = { ...next.condonation[sid], status: approve ? 'approved' : 'rejected', decidedAt: at };
    const after = evaluateStudent(next, s, at);
    audit(next, { at, kind: 'approval', actor: 'CoE', title: `Condonation ${approve ? 'approved' : 'rejected'} for ${sid} ${s.name} (attendance ${e.att.value}%)` });
    notify(next, sid, at, `Condonation ${approve ? 'approved' : 'rejected'}`, [after.headline.text, after.refund ? `Refund due: ${inr(after.refund)}` : null].filter(Boolean));
    reconcile(next, at, `Condonation ${approve ? 'approved' : 'rejected'} for ${sid}`);
    return { state: next };
  }

  // ---------------------------------------------------------------- lock & outputs
  function lockCheck(state, now) {
    if (!state.cycle) return 'Set up the exam cycle first.';
    if (state.lock) return 'The final list is already locked.';
    const S = current(state);
    if (now <= eod(S.dates.cutoff)) return `The attendance cut-off (${fmtDate(S.dates.cutoff)}) has not passed yet, so eligibility is still provisional.`;
    if (now >= sod(S.cycle.examStart)) return 'Exams have started.';
    return null;
  }
  function lock(state, at) {
    const err = lockCheck(state, at);
    if (err) return { error: err };
    const next = clone(state);
    const rows = liveRows(next, at);
    next.lock = { at, version: 1, rows, ticketVersions: {} };
    const evals = evaluateAll(next, at);
    Object.values(evals).forEach((e) => {
      if (!e.inCycle) return;
      const mine = rows.filter((r) => r.sid === e.id);
      notify(next, e.id, at, mine.length ? 'Hall ticket published' : 'Final exam list published', [mine.length ? `Papers: ${mine.map((r) => r.code).join(', ')}` : `You are not on the final list: ${e.headline.text}.`]);
    });
    audit(next, { at, kind: 'lock', actor: 'CoE', title: `Final list locked & published (v1): ${new Set(rows.map((r) => r.sid)).size} students, ${rows.length} paper entries`, reason: 'Hand-off to hall tickets, seating and question-paper printing' });
    return { state: next };
  }
  function outputs(state, now) {
    const evals = evaluateAll(state, now);
    const rows = state.lock ? state.lock.rows : rowsFromEval(evals, state);
    const papers = {};
    rows.forEach((r) => {
      const p = (papers[r.code] = papers[r.code] || { code: r.code, name: r.paper, regular: 0, backlog: 0, improvement: 0, total: 0 });
      p[r.type] += 1; p.total += 1;
    });
    // what the old process would have printed: course registration counts
    D().STUDENTS.forEach((s) => {
      if (!evals[s.id].inCycle) return;
      s.courses.forEach((c) => {
        const p = (papers[c] = papers[c] || { code: c, name: D().COURSES[c].name, regular: 0, backlog: 0, improvement: 0, total: 0 });
        p.oldCount = (p.oldCount || 0) + 1;
      });
    });
    Object.values(papers).forEach((p) => (p.oldCount = p.oldCount || 0));
    const exceptions = Object.values(evals).filter((e) => e.inCycle && e.papers.some((p) => !['cleared', 'opted_out', 'not_selected'].includes(p.status))).map((e) => ({
      sid: e.id, name: e.s.name, program: e.s.program, status: e.headline.text,
      papers: e.papers.filter((p) => !['cleared', 'opted_out', 'not_selected'].includes(p.status)).map((p) => `${p.code}: ${PAPER_STATUS[p.status].label}`).join('; '),
    }));
    const money = Object.values(evals).filter((e) => e.inCycle).map((e) => ({ sid: e.id, name: e.s.name, paid: e.paidTotal, due: e.canAct ? e.due : 0, refund: e.refund, refundReason: e.refundLines.map((l) => `${l.label}: ${l.reason}`).join('; ') }));
    return { rows, papers: Object.values(papers).sort((a, b) => a.code.localeCompare(b.code)), exceptions, money, evals };
  }

  function tick(state, at) {
    if (!state.lock) return state;
    const next = clone(state);
    reconcile(next, at, 'Time passed (e.g. a bank confirmation arrived)');
    return next;
  }

  const api = {
    // helpers
    fmtDate, fmtTs, inr, addDays, addMinutes, eod, sod, clone, round1, toMs,
    // reference
    PAPER_STATUS, CHANGE_TYPES, SETTINGS_CHANGES,
    // queries
    emptyState, current, settingsAt, defaultSettings, validateSettings, evaluateStudent, evaluateAll, phase, attPoints, outputs, lockCheck, changeDefaults, validateChange, windowText,
    // commands (return { state } or { error })
    createCycle, previewChange, commitChange, submitForm, pay, applyCondonation, decideCondonation, lock, tick,
  };
  root.ExamEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
