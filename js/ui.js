/* UI: renders admin and student views from engine results. All state changes go through Store.apply(). */
(function () {
  'use strict';
  const E = window.ExamEngine, D = window.DigiiData, Store = window.ExamStore.Store;
  const { fmtDate, fmtTs, inr } = E;

  const ui = { role: 'admin', sid: 'S01', tab: 'setup', wizard: null, change: null, flash: null, sel: {}, openAudit: {}, payDelay: 0, modal: null };
  const st = () => Store.state;
  const now = () => st().now;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toneCls = (t) => (t === 'muted' ? 'muted-b' : t);
  const badge = (tone, text) => `<span class="badge ${toneCls(tone)}">${esc(text)}</span>`;
  const studentById = (id) => D.STUDENTS.find((s) => s.id === id);
  const flash = (tone, text) => (ui.flash = { tone, text });
  const run = (result, okMsg) => {
    if (result && result.error) flash('bad', result.error);
    else { Store.apply(result); if (okMsg) flash('ok', okMsg); }
    render();
  };

  // ------------------------------------------------------------ settings metadata (shown in setup & settings view)
  const SETTINGS_ROWS = [
    ['Cycle', 'Programs in this cycle', (S) => S.cycle.programs.join(', '), 'All active programs', 'CoE', 'Add only, until the form closes'],
    ['Cycle', 'Exam start date', (S) => fmtDate(S.cycle.examStart), 'Required', 'CoE', 'No in V1 (would recalculate every date)'],
    ['Dates', 'Exam form opens', (S) => fmtDate(S.dates.formOpen), 'Exam start − 42 days', 'CoE', 'No, once open'],
    ['Dates', 'Fee-free deadline', (S) => fmtDate(S.dates.deadline), 'Exam start − 28 days', 'CoE', 'Yes, with impact preview. If shortened, students already in progress keep the date they were shown'],
    ['Dates', 'Late window end', (S) => (S.dates.lateEnd ? fmtDate(S.dates.lateEnd) : 'None'), 'None', 'CoE + Accounts', 'Yes, with preview. Late fee only for students paying after their own deadline'],
    ['Dates', 'Attendance cut-off', (S) => fmtDate(S.dates.cutoff), 'Lock date − 1 day', 'CoE (Dean can request)', 'Yes until lock, with preview. Students the change affects get a catch-up window'],
    ['Dates', 'Lock & publish final list', (S) => fmtDate(S.dates.lockDate), 'Exam start − 21 days', 'CoE', 'Yes until lock. After lock: amendments only'],
    ['Fees', 'Semester exam fee', (S) => inr(S.fees.semester), 'Required', 'Accounts', 'Yes — applies to new payments only'],
    ['Fees', 'Backlog / improvement fee per paper', (S) => inr(S.fees.perPaper), 'Required', 'Accounts', 'Yes — applies to new payments only'],
    ['Fees', 'Late fee', (S) => (S.fees.late ? inr(S.fees.late) : '—'), 'Required if a late window exists', 'Accounts', 'Yes — new payments only'],
    ['Fees', 'Condonation fee', (S) => (S.fees.condonation ? inr(S.fees.condonation) : '—'), 'Required if condonation exists', 'Accounts', 'Yes — new payments only'],
    ['Attendance', 'Threshold', (S) => S.attendance.threshold + '%', '75%', 'CoE', 'Yes, with preview'],
    ['Attendance', 'Basis', () => 'Overall (all courses)', 'Overall', 'CoE', 'No, once live (per-course is out of V1)'],
    ['Attendance', 'Rounding', (S) => (S.attendance.rounding === 'whole' ? 'Round to whole %' : 'None — compared at 1 decimal'), 'None', 'CoE', 'No, once live'],
    ['Checks', 'Exam fee paid', () => 'Blocks', 'Blocks', 'CoE', 'No'],
    ['Checks', 'Tuition dues', (S) => (S.checks.dues === 'block' ? 'Blocks' : 'Warning only'), 'Warning only', 'CoE + Accounts', 'Yes, with preview'],
    ['Checks', 'Disciplinary hold', () => 'Blocks all papers', 'Blocks', 'CoE', 'No'],
    ['Exceptions', 'Condonation rules', (S) => (S.exceptions.condonation.length ? S.exceptions.condonation.map((r) => `${r.programs.join(' & ')}: ${r.min}–${r.max}%`).join('; ') : 'None'), 'None', 'CoE', 'Can be added mid-cycle, with preview'],
    ['Exceptions', 'Improvement attempts', (S) => (S.exceptions.improvement.allowed ? `Allowed, max ${S.exceptions.improvement.max}` : 'Not allowed'), 'Not allowed', 'CoE', 'Before the deadline only'],
    ['Exceptions', 'Opt out of a backlog paper', (S) => (S.exceptions.backlogOptOut ? 'Allowed' : 'Not allowed'), 'Allowed', 'CoE', 'No, once live'],
    ['Change rules', 'Fee fixed at', () => 'Time of payment', 'Time of payment', 'Accounts', 'No'],
    ['Change rules', 'Payment counted at', (S) => (S.rules.paymentBasis === 'initiated' ? 'Payment start time' : 'Bank confirmation time'), 'Payment start time', 'Accounts', 'No, once live'],
    ['Change rules', 'Protect students already in progress', (S) => (S.rules.protectInProgress ? 'On' : 'Off'), 'On', 'CoE', 'No, once live'],
    ['Change rules', 'Catch-up window after a change', (S) => `${S.rules.catchUpDays} days, no late fee`, '3 days', 'CoE', 'No, once live'],
    ['Change rules', 'If a paid student becomes ineligible', (S) => (S.rules.refund === 'refund' ? 'Full refund' : 'Credit to next cycle'), 'Full refund', 'Accounts', 'No, once live'],
  ];
  const meta = (name) => SETTINGS_ROWS.find((r) => r[1] === name);
  const metaLine = (name) => { const m = meta(name); return m ? `Default: ${m[3]} · Owner: ${m[4]} · Once live: ${m[5]}` : ''; };

  // ------------------------------------------------------------ generic helpers
  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
  function scopeObj(scope) { return scope === 'w' ? ui.wizard.draft : scope === 'c' ? ui.change.fields : ui.change.meta; }
  function input(scope, path, type = 'text', extra = '') {
    const v = getPath(scopeObj(scope), path);
    if (type === 'checkbox') return `<input type="checkbox" data-bind="${scope}:${path}" ${v ? 'checked' : ''} ${extra}>`;
    return `<input type="${type}" data-bind="${scope}:${path}" ${type === 'number' ? 'data-num="1" step="any"' : ''} value="${esc(v ?? '')}" ${extra}>`;
  }
  function select(scope, path, options) {
    const v = getPath(scopeObj(scope), path);
    return `<select data-bind="${scope}:${path}">${options.map(([val, label]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  }
  function arrChecks(scope, path, options) {
    const arr = getPath(scopeObj(scope), path) || [];
    return `<div class="checks">${options.map((o) => `<label><input type="checkbox" data-arr="${scope}:${path}" value="${esc(o)}" ${arr.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
  }
  const field = (label, control, metaText) => `<div class="field"><div><label>${label}</label>${metaText ? `<div class="meta">${esc(metaText)}</div>` : ''}</div><div>${control}</div></div>`;
  const chg = (a, b) => (String(a) === String(b) ? esc(b) : `<span class="chg"><span class="from">${esc(a)}</span><span class="to">${esc(b)}</span></span>`);
  function download(name, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; a.click();
  }

  // ------------------------------------------------------------ top bar & clock
  const JUMPS = ['2025-10-25', '2025-11-01', '2025-11-03', '2025-11-05', '2025-11-11', '2025-11-12', '2025-11-13', '2025-11-14', '2025-11-15', '2025-11-18', '2025-11-20', '2025-11-21', '2025-11-22', '2025-11-25', '2025-11-26', '2025-11-30', '2025-12-05', '2025-12-06', '2025-12-10', '2025-12-12'];
  function renderTop() {
    const s = st();
    document.getElementById('topbar').innerHTML = `
      <div class="brand"><span class="logo">Digii</span> Exam Registration &amp; Eligibility <span class="proto">PROTOTYPE</span></div>
      <div class="roles">
        <span class="small" style="color:#aaa">View:</span>
        <button class="seg ${ui.role === 'admin' ? 'active' : ''}" data-act="role" data-v="admin">University staff (CoE · Accounts · Dean)</button>
        <button class="seg ${ui.role === 'student' ? 'active' : ''}" data-act="role" data-v="student">Student</button>
        ${ui.role === 'student' ? `<span class="small" style="color:#aaa">Viewing as:</span><select data-change="student" title="Pick which student to view as">${D.STUDENTS.map((x) => `<option value="${x.id}" ${x.id === ui.sid ? 'selected' : ''}>${x.id} · ${esc(x.name)} · ${esc(x.program)}</option>`).join('')}</select>` : ''}
      </div>
      <div class="tools">
        <button data-act="undo" ${Store.history.length ? '' : 'disabled'}>Undo</button>
        <button data-act="reset">Restart</button>
        <button data-act="about">How to use · What's simulated</button>
      </div>`;
    const ph = E.phase(s, s.now);
    const today = s.now.slice(0, 10);
    document.getElementById('timebar').innerHTML = `
      <div class="clockrow">
        <div class="clock"><span class="muted">Today (simulated):</span> <span class="now">${fmtTs(s.now)} ${s.now.slice(0, 4)}</span>
          <input type="date" id="clkDate" value="${today}" class="finput" style="min-width:0"> <input type="time" id="clkTime" value="${s.now.slice(11, 16)}" class="finput" style="min-width:0">
          <button class="btn sm" data-act="go">Set time</button> <button class="btn sm" data-act="plusday">+1 day</button></div>
        <span class="spacer"></span>${badge(ph.tone, ph.label)}
      </div>
      <div class="chips"><span class="muted small" style="margin-right:4px">Jump to:</span>${JUMPS.map((d) => `<button class="chip ${d === today ? 'cur' : ''}" data-act="jump" data-v="${d}" ${d < today ? 'disabled' : ''}>${fmtDate(d)}</button>`).join('')}</div>
      ${ui.flash ? `<div class="flash ${ui.flash.tone}">${esc(ui.flash.text)}</div>` : ''}`;
  }

  // ------------------------------------------------------------ ADMIN
  function renderAdmin() {
    const s = st();
    const pendingApprovals = s.cycle ? Object.values(E.evaluateAll(s, s.now)).filter((e) => e.attCat === 'cond_pending').length : 0;
    const tabs = [['setup', 'Setup'], ['dashboard', 'Dashboard'], ['changes', 'Changes'], ['approvals', 'Approvals' + (pendingApprovals ? `<span class="count">${pendingApprovals}</span>` : '')], ['final', 'Final list'], ['audit', 'Audit log' + (s.audit.length ? `<span class="count">${s.audit.length}</span>` : '')]];
    const body = { setup: renderSetup, dashboard: renderDashboard, changes: renderChanges, approvals: renderApprovals, final: renderFinal, audit: renderAudit }[ui.tab]();
    const actingAs = {
      setup: ['Controller of Examinations', 'sets up the exam cycle. Accounts owns the fee settings.'],
      dashboard: ['CoE and Accounts', 'monitor every student: status, money and deadlines.'],
      changes: ui.change ? [E.CHANGE_TYPES[ui.change.type].owner, 'owns this change. The CoE confirms it after seeing the impact.'] : ['CoE, Accounts, Dean or Disciplinary committee', 'depending on the change. Each change shows its owner.'],
      approvals: ['Controller of Examinations', 'approves or rejects condonation requests.'],
      final: ['Controller of Examinations', 'locks and publishes the list. Accounts uses the money section.'],
      audit: ['Anyone on the university side', 'can review what happened, when, why and who did it.'],
    }[ui.tab];
    return `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'active' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="small" style="margin:-8px 0 14px;color:var(--muted)">Acting as: <strong style="color:var(--ink)">${esc(actingAs[0])}</strong> ${esc(actingAs[1])} <span class="muted">(Prototype: one staff view, no login.)</span></div>${body}`;
  }

  // ---- setup wizard
  const STEPS = ['Cycle', 'Dates', 'Fees', 'Eligibility checks', 'Exceptions', 'Change rules', 'Review & create'];
  function renderSetup() {
    const s = st();
    if (s.cycle) return renderSettingsView();
    if (!ui.wizard) ui.wizard = { step: 0, draft: E.defaultSettings(''), autoDates: true };
    const w = ui.wizard, S = w.draft;
    let body = '';
    if (w.step === 0) {
      body = field('Cycle name', input('w', 'cycle.name'), 'e.g. "December 2025 end-semester exams"')
        + field('Exam start date', input('w', 'cycle.examStart', 'date'), 'Required. Other dates default from this one.')
        + field('Programs in this cycle', arrChecks('w', 'cycle.programs', D.PROGRAMS), metaLine('Programs in this cycle'));
    } else if (w.step === 1) {
      body = `<p class="muted small">Defaults are calculated from the exam start date${S.cycle.examStart ? ` (${fmtDate(S.cycle.examStart)})` : ''}. <button class="btn sm" data-act="wz-redates" ${S.cycle.examStart ? '' : 'disabled'}>Recalculate defaults</button></p>`
        + field('Exam form opens', input('w', 'dates.formOpen', 'date'), metaLine('Exam form opens'))
        + field('Fee-free deadline', input('w', 'dates.deadline', 'date'), metaLine('Fee-free deadline'))
        + field('Late window end (optional)', input('w', 'dates.lateEnd', 'date'), metaLine('Late window end'))
        + field('Attendance cut-off', input('w', 'dates.cutoff', 'date'), metaLine('Attendance cut-off') + '. Attendance up to this date decides eligibility; before it, students see a provisional figure.')
        + field('Lock & publish final list', input('w', 'dates.lockDate', 'date'), metaLine('Lock & publish final list') + '. The CoE needs the list ≥ 3 weeks before exams.');
    } else if (w.step === 2) {
      body = field('Semester exam fee (₹)', input('w', 'fees.semester', 'number'), metaLine('Semester exam fee') + '. Flat per semester.')
        + field('Backlog / improvement fee per paper (₹)', input('w', 'fees.perPaper', 'number'), metaLine('Backlog / improvement fee per paper'))
        + field('Late fee (₹)', input('w', 'fees.late', 'number'), metaLine('Late fee') + '. Charged once per student.')
        + field('Condonation fee (₹)', input('w', 'fees.condonation', 'number'), metaLine('Condonation fee'));
    } else if (w.step === 3) {
      body = field('Attendance threshold (%)', input('w', 'attendance.threshold', 'number'), metaLine('Threshold'))
        + field('Attendance basis', '<span>Overall (all courses together)</span>', metaLine('Basis'))
        + field('Rounding', select('w', 'attendance.rounding', [['none', 'None — 74.6% is below 75%'], ['whole', 'Round to whole % — 74.6% counts as 75%']]), metaLine('Rounding'))
        + field('Exam fee paid', '<span>Blocks the exam if unpaid</span>', metaLine('Exam fee paid'))
        + field('Tuition dues', select('w', 'checks.dues', [['warn', 'Warning only'], ['block', 'Block exam registration']]), metaLine('Tuition dues'))
        + field('Disciplinary hold', '<span>Blocks all papers</span>', metaLine('Disciplinary hold'));
    } else if (w.step === 4) {
      const rules = S.exceptions.condonation.map((r, i) => `<div class="card" style="padding:10px;margin-bottom:8px">
          <div class="row"><strong>Rule ${i + 1}</strong><span class="spacer"></span><button class="btn sm" data-act="wz-delrule" data-v="${i}">Remove</button></div>
          ${arrChecks('w', `exceptions.condonation.${i}.programs`, S.cycle.programs)}
          <div class="row" style="margin-top:6px">From ${input('w', `exceptions.condonation.${i}.min`, 'number', 'style="width:80px;min-width:0"')}% up to (not incl.) ${input('w', `exceptions.condonation.${i}.max`, 'number', 'style="width:80px;min-width:0"')}%</div></div>`).join('');
      body = field('Condonation rules', `${rules || '<div class="muted">No condonation in this cycle.</div>'}<button class="btn sm" data-act="wz-addrule">+ Add rule</button>`, metaLine('Condonation rules') + '. Students in range apply, pay the fee, and the CoE approves.')
        + field('Improvement attempts allowed', input('w', 'exceptions.improvement.allowed', 'checkbox') + ' Max papers ' + input('w', 'exceptions.improvement.max', 'number', 'style="width:70px;min-width:0"'), metaLine('Improvement attempts'))
        + field('Students may opt out of a backlog paper', input('w', 'exceptions.backlogOptOut', 'checkbox'), metaLine('Opt out of a backlog paper') + '. Opted-out papers carry forward.');
    } else if (w.step === 5) {
      body = field('Fee fixed at', '<span>Time of payment — later fee changes apply to new payments only</span>', metaLine('Fee fixed at'))
        + field('Payment counted at', select('w', 'rules.paymentBasis', [['initiated', 'Payment start time'], ['confirmed', 'Bank confirmation time']]), metaLine('Payment counted at'))
        + field('Protect students already in progress', input('w', 'rules.protectInProgress', 'checkbox') + ' If a deadline is shortened, students who started the form keep the date they were shown', metaLine('Protect students already in progress'))
        + field('Catch-up window after a change (days)', input('w', 'rules.catchUpDays', 'number'), metaLine('Catch-up window after a change') + '. For students a change newly makes eligible after their window closed.')
        + field('If a paid student becomes ineligible', select('w', 'rules.refund', [['refund', 'Full refund'], ['credit', 'Credit to next cycle']]), metaLine('If a paid student becomes ineligible'));
    } else {
      const errs = E.validateSettings(S);
      body = (errs.length ? `<div class="errors"><strong>Fix before creating:</strong><ul>${errs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<div class="flash ok">All required settings are complete.</div>')
        + `<table style="margin-top:10px"><tr><th>Group</th><th>Setting</th><th>Value</th><th>Owner</th><th>Can it change once live?</th></tr>
          ${SETTINGS_ROWS.map((r) => { let v; try { v = r[2](E.validateSettings(S).length ? S : S); } catch (e) { v = '—'; } return `<tr><td>${r[0]}</td><td>${r[1]}</td><td><strong>${esc(v)}</strong></td><td>${r[4]}</td><td class="small">${r[5]}</td></tr>`; }).join('')}</table>
          <div class="row" style="margin-top:14px"><button class="btn primary" data-act="wz-create" ${errs.length ? 'disabled' : ''}>Create exam cycle (settings v1)</button><span class="muted small">Creating does not open the form early: it opens on the form-open date.</span></div>`;
    }
    return `<div class="card">
      <div class="row"><h2>Set up this semester's exam process</h2><span class="spacer"></span>
        <button class="btn sm" data-act="wz-evidence" title="Fills the wizard with the dates and fees from the evidence pack. You still review every step.">Fill with Digii University's values (evidence pack)</button></div>
      <p class="muted">Nothing is configured yet. Walk through the steps; each setting shows its default, owner and whether it can change once live.</p>
      <div class="steps">${STEPS.map((x, i) => `<button class="step ${i === w.step ? 'active' : ''}" data-act="wz-step" data-v="${i}">${i + 1}. ${x}</button>`).join('')}</div>
      ${body}
      <div class="row" style="margin-top:14px">${w.step > 0 ? '<button class="btn" data-act="wz-prev">← Back</button>' : ''}<span class="spacer"></span>${w.step < STEPS.length - 1 ? '<button class="btn dark" data-act="wz-next">Next →</button>' : ''}</div>
    </div>`;
  }

  function renderSettingsView() {
    const s = st(), S = E.current(s);
    return `<div class="card"><div class="row"><h2>${esc(S.cycle.name)}</h2>${badge('info', 'Settings v' + s.cycle.versions.length)}<span class="spacer"></span><button class="btn sm" data-act="tab" data-v="changes">Make a change →</button></div>
      <p class="muted">Settings are read-only here. Every change goes through <strong>Changes</strong>, where the admin sees the impact before confirming and the change is versioned and logged.</p>
      <table><tr><th>Group</th><th>Setting</th><th>Current value</th><th>Default</th><th>Owner</th><th>Can it change once live?</th></tr>
      ${SETTINGS_ROWS.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><strong>${esc(r[2](S))}</strong></td><td class="small">${esc(r[3])}</td><td class="small">${esc(r[4])}</td><td class="small">${esc(r[5])}</td></tr>`).join('')}</table></div>
      <div class="card"><h3>Settings versions</h3><table><tr><th>Version</th><th>Effective from</th><th>What changed</th></tr>
      ${s.cycle.versions.map((v) => `<tr><td>v${v.v}</td><td class="nowrap">${fmtTs(v.at)}</td><td>${esc(v.title)}</td></tr>`).join('')}</table></div>`;
  }

  // ---- dashboard
  function renderDashboard() {
    const s = st();
    if (!s.cycle) return emptyCycle();
    const evals = Object.values(E.evaluateAll(s, s.now)).filter((e) => e.inCycle);
    const by = (t) => evals.filter((e) => e.headline.tone === t).length;
    const k = (v, l) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    return `<div class="kpis">${k(evals.length, 'Students in cycle')}${k(by('ok'), 'Cleared')}${k(by('warn'), 'Action needed')}${k(by('info'), 'Provisional / processing / awaiting')}${k(by('bad'), 'Blocked or not registered')}${k(inr(evals.reduce((a, e) => a + e.paidTotal, 0)), 'Collected')}${k(inr(evals.reduce((a, e) => a + (e.canAct ? e.due : 0), 0)), 'Outstanding (window open)')}${k(inr(evals.reduce((a, e) => a + e.refund, 0)), 'Refunds due')}</div>
    <div class="card"><h3>All students — computed live from data and rules at ${fmtTs(s.now)}</h3>
      <table><tr><th>Student</th><th>Attendance used</th><th>Status</th><th>Papers cleared</th><th class="right">Paid</th><th class="right">Due</th><th class="right">Refund</th><th>Window</th><th></th></tr>
      ${evals.map((e) => `<tr><td><strong>${e.id}</strong> ${esc(e.s.name)}<div class="small muted">${esc(e.s.program)} · Sem ${e.s.sem}${e.s.dues ? ` · dues ${inr(e.s.dues)}` : ''}${e.hold ? ' · HOLD' : ''}</div></td>
        <td>${e.att.value}%<div class="small muted">${e.att.final ? 'final, to ' + fmtDate(e.att.asOf) : 'provisional'}</div></td>
        <td>${badge(e.headline.tone, e.headline.text)}</td>
        <td>${e.papers.filter((p) => p.status === 'cleared').length} / ${e.papers.filter((p) => p.selected).length}</td>
        <td class="right">${inr(e.paidTotal)}</td><td class="right">${e.due && e.canAct ? inr(e.due) : '—'}</td><td class="right">${e.refund ? inr(e.refund) : '—'}</td>
        <td class="small">${esc(E.windowText(e.win))}${e.win.protectedDeadline ? '<div class="muted">protected deadline</div>' : ''}</td>
        <td><button class="btn sm" data-act="view-student" data-v="${e.id}">Open as student</button></td></tr>`).join('')}</table></div>
    ${renderSamplePanel()}`;
  }
  function renderSamplePanel() {
    const s = st();
    return `<div class="card"><div class="row"><h3>Sample-data student actions</h3><span class="spacer"></span><label class="small"><input type="checkbox" data-change="autoplay" ${s.auto.enabled ? 'checked' : ''}> Play automatically as time passes</label></div>
      <p class="muted small">These facts from the sample data happen on their own date, through the same rules as any student action (they can be blocked or skipped).</p>
      <table>${D.SAMPLE_ACTIONS.map((a) => { const d = s.auto.done[a.key]; return `<tr><td class="nowrap">${fmtTs(a.at)}</td><td>${esc(a.label)}</td><td>${d ? badge(d.status === 'done' ? 'ok' : d.status === 'blocked' ? 'bad' : 'muted', d.status) + (d.note ? ` <span class="small muted">${esc(d.note)}</span>` : '') : badge('muted', 'pending')}</td></tr>`; }).join('')}</table></div>`;
  }
  const emptyCycle = () => `<div class="card"><h2>No exam cycle yet</h2><p>Start in <strong>Setup</strong>.</p><button class="btn primary" data-act="tab" data-v="setup">Go to setup</button></div>`;

  // ---- changes
  function changeFields() {
    const c = ui.change, s = st(), S = E.current(s);
    const studs = D.STUDENTS.map((x) => [x.id, `${x.id} · ${x.name}`]);
    switch (c.type) {
      case 'deadline': return field('New fee-free deadline', input('c', 'value', 'date'), `Current: ${fmtDate(S.dates.deadline)}. ${metaLine('Fee-free deadline')}`);
      case 'fees': return ['semester', 'perPaper', 'late', 'condonation'].map((k) => field({ semester: 'Semester exam fee', perPaper: 'Backlog / improvement fee per paper', late: 'Late fee', condonation: 'Condonation fee' }[k] + ' (₹)', input('c', k, 'number'), `Current: ${inr(S.fees[k])}. Applies to new payments only; amounts already paid stand.`)).join('');
      case 'lateWindow': return field('Late window ends', input('c', 'end', 'date'), `Fee-free deadline stays ${fmtDate(S.dates.deadline)}.`) + field('Late fee (₹)', input('c', 'fee', 'number'), 'Charged once, only to students paying after their own deadline.');
      case 'condonation': return field('Programs covered', arrChecks('c', 'programs', S.cycle.programs)) + field('Attendance range (%)', `${input('c', 'min', 'number', 'style="width:80px;min-width:0"')} up to (not incl.) ${input('c', 'max', 'number', 'style="width:80px;min-width:0"')}`) + field('Condonation fee (₹)', input('c', 'fee', 'number'));
      case 'cutoff': return field('New attendance cut-off', input('c', 'value', 'date'), `Current: ${fmtDate(S.dates.cutoff)}. ${metaLine('Attendance cut-off')}`);
      case 'threshold': return field('New threshold (%)', input('c', 'value', 'number'), `Current: ${S.attendance.threshold}%.`);
      case 'dues': return field('Tuition dues', select('c', 'value', [['warn', 'Warning only'], ['block', 'Block exam registration']]));
      case 'improvement': return field('Improvement allowed', input('c', 'allowed', 'checkbox') + ' Max papers ' + input('c', 'max', 'number', 'style="width:70px;min-width:0"'));
      case 'lockDate': return field('New lock & publish date', input('c', 'value', 'date'), `Current: ${fmtDate(S.dates.lockDate)}.`);
      case 'correction': {
        const stu = studentById(c.fields.sid);
        const pts = stu ? E.attPoints(s, stu) : [];
        return field('Student', select('c', 'sid', studs)) + field('Attendance figure to correct', select('c', 'point', D.ATT_DATES.map((d, i) => [d, `Up to ${fmtDate(d)} — currently ${pts[i] ? E.round1(pts[i].v) : '?'}%`])), 'Corrections apply to that period and every later period that includes it.')
          + field('Corrected figure (%)', input('c', 'newValue', 'number')) + field('Approved by Dean', input('c', 'deanApproved', 'checkbox') + ' Required after the cut-off (simulated sign-off)');
      }
      case 'hold': return field('Student', select('c', 'sid', studs)) + field('Order / note', input('c', 'note'));
      case 'releaseHold': return field('Student', select('c', 'sid', studs));
      default: return '';
    }
  }
  function renderChanges() {
    const s = st();
    if (!s.cycle) return emptyCycle();
    const done = (item) => item.change && s.audit.some((a) => a.kind === 'change' && a.changeType === item.change.type && a.at.slice(0, 10) === item.date);
    const tl = D.TIMELINE.map((it, i) => `<div class="timeline-item"><div class="d">${fmtDate(it.date)}</div><div>${esc(it.label)}
        <div class="small muted">${it.note ? esc(it.note) : ''}</div>
        ${it.kind === 'change' ? (done(it) ? '<span class="done">✓ Applied</span>' : `<button class="btn sm" data-act="prep" data-v="${i}">Prepare this change</button>`) : ''}
        ${it.kind === 'lock' ? `<button class="btn sm" data-act="tab" data-v="final">Go to Final list</button>` : ''}</div></div>`).join('');
    let right;
    if (!ui.change) {
      right = `<div class="card"><h2>Make a change</h2><p class="muted">Every change follows the same path: <strong>edit → see impact on every student → give a reason → confirm</strong>. Confirming creates a new settings version, notifies affected students and writes the audit log.</p>
        <div class="row">${Object.entries(E.CHANGE_TYPES).map(([k, v]) => `<button class="btn sm" data-act="ctype" data-v="${k}">${esc(v.label)}</button>`).join('')}</div></div>`;
    } else {
      const c = ui.change;
      const err = E.validateChange(s, c, s.now);
      const early = c.eventDate && s.now.slice(0, 10) < c.eventDate;
      right = `<div class="card"><div class="row"><h2>${esc(E.CHANGE_TYPES[c.type].label)}</h2>${badge('muted', 'Owner: ' + E.CHANGE_TYPES[c.type].owner)}<span class="spacer"></span><button class="btn sm" data-act="cancel-change">Close</button></div>
        ${early ? `<div class="flash warn">In the evidence pack this happened on ${fmtDate(c.eventDate)}; today is ${fmtDate(s.now)}. <button class="btn sm" data-act="jump" data-v="${c.eventDate}">Jump to ${fmtDate(c.eventDate)}</button></div>` : ''}
        ${changeFields()}
        ${field('Reason (required)', input('m', 'reason', 'text', 'style="width:100%"'))}
        ${field('Circular / reference', input('m', 'ref', 'text', 'style="width:100%"'))}
        <div class="row" style="margin-top:10px"><button class="btn dark" data-act="preview">Preview impact</button>${err ? `<span class="badge bad">${esc(err)}</span>` : ''}</div></div>
        ${c.preview ? renderPreview(c.preview) : ''}`;
    }
    return `<div class="grid-side"><div class="card"><h3>Evidence-pack timeline (2.5)</h3><p class="small muted">"Prepare" fills the form with the event's values. You still preview and confirm.</p>${tl}</div><div>${right}</div></div>`;
  }
  function previewTable(rows, showAll) {
    const list = showAll ? rows.slice().sort((a, b) => b.changed - a.changed) : rows.filter((r) => r.changed);
    return `<table><tr><th>Student</th><th>Attendance used</th><th>Status</th><th class="right">Due</th><th class="right">Refund</th><th>Window</th><th>What changes for them</th></tr>
      ${list.map((r) => `<tr class="${r.changed ? 'hl' : 'dim'}"><td class="nowrap"><strong>${r.sid}</strong> ${esc(r.name)}<div class="small muted">${esc(r.program)}</div></td>
        <td class="nowrap">${chg(r.before.att, r.after.att)}</td><td>${chg(r.before.status, r.after.status)}</td>
        <td class="right nowrap">${chg(inr(r.before.due), inr(r.after.due))}</td><td class="right nowrap">${chg(inr(r.before.refund), inr(r.after.refund))}</td>
        <td class="small">${chg(r.before.window, r.after.window)}</td>
        <td class="small">${r.changed ? `<ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<span class="muted">No change</span>'}</td></tr>`).join('')}</table>`;
  }
  function renderPreview(p) {
    if (p.error) return `<div class="errors">${esc(p.error)}</div>`;
    const sm = p.summary;
    return `<div class="card" style="border:2px solid var(--ink)">
      <h3>Impact preview — what you are about to confirm</h3>
      <p><strong>${esc(p.title)}</strong></p>
      <div class="kpis">
        <div class="kpi"><div class="v">${sm.affected} / 12</div><div class="l">students affected</div></div>
        <div class="kpi"><div class="v">${inr(sm.dueBefore)} → ${inr(sm.dueAfter)}</div><div class="l">total outstanding</div></div>
        <div class="kpi"><div class="v">${inr(sm.refundBefore)} → ${inr(sm.refundAfter)}</div><div class="l">refunds due</div></div>
        <div class="kpi"><div class="v">${sm.granted.length}</div><div class="l">catch-up windows ${sm.granted.length ? '(' + sm.granted.join(', ') + ')' : ''}</div></div>
        ${p.listDiff ? `<div class="kpi"><div class="v">+${sm.listAdded} / −${sm.listRemoved}</div><div class="l">published list entries (amendment)</div></div>` : ''}
        ${sm.settingsVersion ? `<div class="kpi"><div class="v">v${sm.settingsVersion}</div><div class="l">new settings version</div></div>` : ''}
      </div>
      <p class="small muted">Money already paid stays at the rate it was paid at. Published hall tickets are never edited silently: after lock, any list change becomes a numbered amendment.</p>
      ${previewTable(p.rows, true)}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="confirm-change">Confirm change &amp; notify ${sm.affected} student(s)</button><button class="btn" data-act="discard-change">Discard</button></div></div>`;
  }

  // ---- approvals
  function renderApprovals() {
    const s = st();
    if (!s.cycle) return emptyCycle();
    const evals = Object.values(E.evaluateAll(s, s.now));
    const pending = evals.filter((e) => e.attCat === 'cond_pending');
    const decided = Object.entries(s.condonation).filter(([, a]) => a.status !== 'pending');
    return `<div class="card"><h2>Condonation requests</h2><p class="muted">Students in a condonation range apply and pay the fee; the CoE approves. Approval is logged and, after lock, becomes an amendment.</p>
      ${pending.length ? `<table><tr><th>Student</th><th>Attendance</th><th>Rule</th><th>Fee paid?</th><th></th></tr>${pending.map((e) => `<tr><td><strong>${e.id}</strong> ${esc(e.s.name)}<div class="small muted">${esc(e.s.program)}</div></td><td>${e.att.value}% (to ${fmtDate(e.att.asOf)})</td><td>${e.att.rule.min}–${e.att.rule.max}%</td><td>${e.paid.COND ? badge('ok', 'Paid ' + inr(e.paid.COND)) : badge('warn', 'Not paid yet')}</td>
        <td class="nowrap"><button class="btn sm primary" data-act="approve" data-v="${e.id}" ${e.paid.COND ? '' : 'disabled'}>Approve</button> <button class="btn sm" data-act="reject" data-v="${e.id}">Reject</button></td></tr>`).join('')}</table>` : '<p class="muted">No pending requests.</p>'}
      ${decided.length ? `<h3 style="margin-top:14px">Decided</h3><table>${decided.map(([sid, a]) => `<tr><td>${sid} ${esc(studentById(sid).name)}</td><td>${badge(a.status === 'approved' ? 'ok' : 'bad', a.status)}</td><td class="small muted">${fmtTs(a.decidedAt)}</td></tr>`).join('')}</table>` : ''}</div>`;
  }

  // ---- final list
  function renderFinal() {
    const s = st();
    if (!s.cycle) return emptyCycle();
    const S = E.current(s), o = E.outputs(s, s.now);
    const lockErr = E.lockCheck(s, s.now);
    const evals = Object.values(o.evals).filter((e) => e.inCycle);
    const pendingStudents = evals.filter((e) => ['warn', 'info'].includes(e.headline.tone));
    const head = s.lock
      ? `<div class="card"><div class="row"><h2>Final list — locked &amp; published</h2>${badge('ok', 'v' + s.lock.version)}</div><p>Locked ${fmtTs(s.lock.at)} · ${s.amendments.length} amendment(s) since. This is what goes to hall tickets, seating and question-paper printing.</p>
         ${s.amendments.length ? `<table><tr><th>Amendment</th><th>When</th><th>Cause</th><th>Added</th><th>Removed</th></tr>${s.amendments.map((a) => `<tr><td>v${a.version}</td><td class="nowrap">${fmtTs(a.at)}</td><td>${esc(a.cause)}</td><td>${a.added.map((r) => r.sid + ' ' + r.code).join(', ') || '—'}</td><td>${a.removed.map((r) => r.sid + ' ' + r.code).join(', ') || '—'}</td></tr>`).join('')}</table>` : ''}</div>`
      : `<div class="card"><h2>Lock &amp; publish the final list</h2><p>Scheduled for <strong>${fmtDate(S.dates.lockDate)}</strong> (exams ${fmtDate(S.cycle.examStart)}). Below is the <strong>live</strong> list as it stands now.</p>
         ${pendingStudents.length ? `<div class="flash warn">${pendingStudents.length} student(s) still have open items and will not be on the list unless resolved: ${pendingStudents.map((e) => `${e.id} (${esc(e.headline.text)})`).join('; ')}</div>` : ''}
         <div class="row" style="margin-top:8px"><button class="btn primary" data-act="lock" ${lockErr ? 'disabled' : ''}>Lock &amp; publish final list (v1)</button>${lockErr ? `<span class="badge bad">${esc(lockErr)}</span>` : s.now.slice(0, 10) < S.dates.lockDate ? `<span class="badge warn">Earlier than the scheduled ${fmtDate(S.dates.lockDate)}</span>` : ''}</div></div>`;
    const bySid = {};
    o.rows.forEach((r) => (bySid[r.sid] = bySid[r.sid] || []).push(r));
    return head + `
      <div class="card"><div class="row"><h3>1. Hall-ticket list (student × paper)</h3><span class="spacer"></span><button class="btn sm" data-act="csv" data-v="rows">Download CSV</button></div>
        <table><tr><th>Hall ticket no.</th><th>Student</th><th>Program</th><th>Papers</th><th>Ticket version</th></tr>
        ${Object.entries(bySid).map(([sid, rs]) => `<tr><td class="nowrap">DU-D25-${sid}</td><td><strong>${sid}</strong> ${esc(rs[0].name)}</td><td>${esc(rs[0].program)} · Sem ${rs[0].sem}</td><td>${rs.map((r) => `${r.code}${r.type !== 'regular' ? ` <span class="small muted">(${r.type})</span>` : ''}`).join(', ')}</td><td>${s.lock ? 'v' + (s.lock.ticketVersions[sid] || 1) : 'not published'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No students cleared yet.</td></tr>'}</table></div>
      <div class="card"><div class="row"><h3>2. Headcount per paper → seating &amp; question-paper printing</h3><span class="spacer"></span><button class="btn sm" data-act="csv" data-v="papers">Download CSV</button></div>
        <table><tr><th>Paper</th><th class="right">Regular</th><th class="right">Backlog</th><th class="right">Improvement</th><th class="right">Print / seat</th><th class="right">Old method (course registration count)</th><th class="right">Difference</th></tr>
        ${o.papers.map((p) => `<tr><td><strong>${p.code}</strong> ${esc(p.name)}</td><td class="right">${p.regular}</td><td class="right">${p.backlog}</td><td class="right">${p.improvement}</td><td class="right"><strong>${p.total}</strong></td><td class="right">${p.oldCount}</td><td class="right">${p.total - p.oldCount > 0 ? `<span class="badge warn">+${p.total - p.oldCount} short before</span>` : p.total - p.oldCount < 0 ? `<span class="badge muted-b">${p.total - p.oldCount} wasted before</span>` : '—'}</td></tr>`).join('')}</table></div>
      <div class="grid2"><div class="card"><div class="row"><h3>3. Not on the list / open items</h3><span class="spacer"></span><button class="btn sm" data-act="csv" data-v="exceptions">CSV</button></div>
        <table><tr><th>Student</th><th>Status</th><th>Papers not cleared</th></tr>${o.exceptions.map((x) => `<tr><td class="nowrap"><strong>${x.sid}</strong> ${esc(x.name)}</td><td>${esc(x.status)}</td><td class="small">${esc(x.papers)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">None</td></tr>'}</table></div>
      <div class="card"><div class="row"><h3>4. Money → Accounts</h3><span class="spacer"></span><button class="btn sm" data-act="csv" data-v="money">CSV</button></div>
        <table><tr><th>Student</th><th class="right">Paid</th><th class="right">Due (window open)</th><th class="right">Refund due</th><th>Refund reason</th></tr>${o.money.map((m) => `<tr><td>${m.sid}</td><td class="right">${inr(m.paid)}</td><td class="right">${m.due ? inr(m.due) : '—'}</td><td class="right">${m.refund ? inr(m.refund) : '—'}</td><td class="small">${esc(m.refundReason)}</td></tr>`).join('')}</table></div></div>`;
  }

  // ---- audit
  function renderAudit() {
    const s = st();
    if (!s.audit.length) return '<div class="card"><p class="muted">No events yet.</p></div>';
    const kindTone = { setup: 'info', change: 'warn', amendment: 'bad', lock: 'ok', approval: 'info', student: 'muted', sample: 'muted' };
    return `<div class="card"><h2>Audit log</h2><p class="muted">Every setup, change, approval, lock, amendment and student action. For changes, open the entry to see exactly what the admin saw before confirming.</p>
      <table><tr><th>When</th><th>Type</th><th>Who</th><th>What</th></tr>
      ${s.audit.slice().reverse().map((a) => `<tr><td class="nowrap">${fmtTs(a.at)}</td><td>${badge(kindTone[a.kind] || 'muted', a.kind === 'sample' ? 'sample data' : a.kind)}</td><td class="small">${esc(a.actor)}</td>
        <td><strong>${esc(a.title)}</strong>${a.reason ? `<div class="small">Reason: ${esc(a.reason)}${a.ref ? ` · Ref: ${esc(a.ref)}` : ''}</div>` : ''}
        ${a.version ? `<div class="small muted">Settings version v${a.version}</div>` : ''}
        ${a.rows ? `<div class="small">${a.summary.affected} student(s) affected · outstanding ${inr(a.summary.dueBefore)} → ${inr(a.summary.dueAfter)} · refunds ${inr(a.summary.refundBefore)} → ${inr(a.summary.refundAfter)}${a.summary.granted.length ? ' · catch-up: ' + a.summary.granted.join(', ') : ''}</div>
          <button class="btn sm" data-act="toggle-audit" data-v="${a.id}">${ui.openAudit[a.id] ? 'Hide' : 'Show'} what the admin saw before confirming</button>${ui.openAudit[a.id] ? previewTable(a.rows, false) : ''}` : ''}</td></tr>`).join('')}</table></div>`;
  }

  // ------------------------------------------------------------ STUDENT
  function renderStudent() {
    const s = st(), stu = studentById(ui.sid);
    const header = `<div class="row" style="margin-bottom:12px"><h2 style="margin:0">${esc(stu.name)}</h2>${badge('muted', stu.id)}<span class="muted">${esc(stu.program)} · Semester ${stu.sem}</span><span class="spacer"></span><span class="small muted">Sample data: ${esc(stu.facts)}</span></div>`;
    if (!s.cycle) return header + '<div class="banner muted-b"><div class="h">The exam process for this semester has not been set up yet</div><div class="n">The exam cell will publish it here. Nothing to do yet.</div></div>';
    const e = E.evaluateStudent(s, stu, s.now);
    if (!e.inCycle) return header + `<div class="banner muted-b"><div class="h">${esc(e.headline.text)}</div></div>`;
    const S = e.S;
    const draft = (ui.sel[stu.id] = ui.sel[stu.id] || {});
    const selOf = (p) => (p.code in draft ? draft[p.code] : p.selected);
    const dirty = e.papers.some((p) => p.type !== 'regular' && selOf(p) !== p.selected);
    const editable = (p) => e.canAct && p.type !== 'regular' && (p.type === 'improvement' || S.exceptions.backlogOptOut) && !e.hold;
    const papers = `<table><tr><th>Paper</th><th>Type</th><th>Status</th><th class="right">Fee</th></tr>
      ${e.papers.map((p) => `<tr><td>${p.type !== 'regular' ? `<input type="checkbox" data-sel="${p.code}" ${selOf(p) ? 'checked' : ''} ${editable(p) ? '' : 'disabled'}> ` : ''}<strong>${p.code}</strong> ${esc(p.name)}</td>
        <td>${p.type === 'regular' ? 'Regular' : p.type === 'backlog' ? `Backlog (Sem ${p.fromSem})` : `Improvement (grade ${p.grade})`}</td>
        <td>${badge(E.PAPER_STATUS[p.status].tone, E.PAPER_STATUS[p.status].label)}</td><td class="right">${p.type === 'regular' ? '<span class="small muted">in semester fee</span>' : inr(p.fee)}</td></tr>`).join('')}</table>
      ${dirty ? `<div class="row" style="margin-top:8px"><button class="btn dark" data-act="save-sel">Save paper choices</button><span class="small muted">Save before paying.</span></div>` : ''}
      ${e.papers.some((p) => p.type === 'backlog') && S.exceptions.backlogOptOut ? '<p class="small muted">Untick a backlog paper to skip it this time; it carries forward to the next cycle.</p>' : ''}`;
    const payBox = e.canAct && e.due > 0 ? `<div class="card" style="border:2px solid var(--warn)"><h3>Pay now</h3>
        <table>${e.dueLines.map((l) => `<tr><td>${esc(l.label)}</td><td class="right">${inr(l.amount)}</td></tr>`).join('')}<tr><td><strong>Total</strong></td><td class="right"><strong>${inr(e.due)}</strong></td></tr></table>
        <div class="row" style="margin-top:8px"><label class="small">Simulated bank: <select data-change="delay"><option value="0" ${ui.payDelay == 0 ? 'selected' : ''}>confirms instantly</option><option value="5" ${ui.payDelay == 5 ? 'selected' : ''}>confirms 5 minutes later</option><option value="120" ${ui.payDelay == 120 ? 'selected' : ''}>confirms 2 hours later</option></select></label>
        <button class="btn primary" data-act="pay" ${dirty ? 'disabled' : ''}>Pay ${inr(e.due)} (simulated)</button></div>
        <p class="small muted">Rates are fixed at the moment you pay. Payment counts from when you start it, not when the bank confirms.</p></div>` : '';
    const condBox = e.attCat === 'condonable' && e.canAct ? `<div class="card" style="border:2px solid var(--warn)"><h3>Condonation</h3><p>Your attendance (${e.att.value}%) is in the condonation range for ${esc(stu.program)} (${e.att.rule.min}–${e.att.rule.max}%). Apply, pay ${inr(S.fees.condonation)}, and the CoE approves.</p><button class="btn primary" data-act="apply-cond">Apply for condonation</button></div>` : '';
    const notices = (s.notices[stu.id] || []).slice().reverse();
    const pays = e.payments.map((p) => `<tr><td class="nowrap">${p.id}</td><td>${p.lines.map((l) => `${esc(l.label)} ${inr(l.amount)}`).join('<br>')}</td><td class="small nowrap">Started ${fmtTs(p.initiatedAt)}<br>Bank ${fmtTs(p.confirmedAt)}${p.pending ? ' (pending)' : ''}</td><td class="right">${inr(p.total)}</td></tr>`).join('');
    const myRows = s.lock ? s.lock.rows.filter((r) => r.sid === stu.id) : [];
    const ticket = myRows.length ? `<div class="ticket"><div class="th"><div><strong>DIGII UNIVERSITY — HALL TICKET</strong><div class="small">${esc(S.cycle.name)}</div></div><div class="right"><strong>DU-D25-${stu.id}</strong><div class="small">Version ${s.lock.ticketVersions[stu.id] || 1}${(s.lock.ticketVersions[stu.id] || 1) > 1 ? ' (amended — earlier versions superseded)' : ''}</div></div></div>
        <div>${esc(stu.name)} · ${esc(stu.program)} · Semester ${stu.sem}</div>
        <table style="margin-top:8px"><tr><th>Paper</th><th>Name</th><th>Type</th></tr>${myRows.map((r) => `<tr><td>${r.code}</td><td>${esc(r.paper)}</td><td>${r.type}</td></tr>`).join('')}</table>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="print">Print</button></div></div>` : '';
    return header + `
      <div class="banner ${toneCls(e.headline.tone)}"><div class="h">${esc(e.headline.text)}</div><div class="n">${esc(e.headline.next)}</div></div>
      ${ticket ? `<div class="card"><h3>Hall ticket</h3>${ticket}</div>` : ''}
      <div class="grid2">
        <div>
          <div class="card"><h3>Why — your checks</h3><ul class="notes">${e.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
          ${condBox}${payBox}
          <div class="card"><h3>Your papers</h3>${papers}</div>
          <div class="card"><h3>Payments &amp; refunds</h3>${pays ? `<table><tr><th>Ref</th><th>For</th><th>Time</th><th class="right">Amount</th></tr>${pays}</table>` : '<p class="muted">No payments yet.</p>'}
            ${e.refundLines.length ? `<h3 style="margin-top:10px">Refunds raised</h3><table>${e.refundLines.map((l) => `<tr><td>${esc(l.label)}</td><td class="small">${esc(l.reason)}</td><td class="right">${inr(l.amount)}</td></tr>`).join('')}</table><p class="small muted">${S.rules.refund === 'refund' ? 'Refunded to the original payment method (simulated).' : 'Held as credit for the next cycle.'}</p>` : ''}</div>
        </div>
        <div class="card"><h3>What changed for you</h3><p class="small muted">In-app notices (SMS/email simulated). Every rule change that affects you appears here with what it means for you.</p>
          ${notices.length ? notices.map((n) => `<div class="notice"><div class="a">${fmtTs(n.at)}</div><div class="t">${esc(n.title)}</div><ul class="notes small">${n.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('') : '<p class="muted">No notices yet.</p>'}</div>
      </div>`;
  }

  // ------------------------------------------------------------ modal
  function renderModal() {
    const el = document.getElementById('modal');
    if (!ui.modal) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="overlay" data-act="close-modal"><div class="box" data-stop="1">
      <div class="row"><h2>How to use this prototype</h2><span class="spacer"></span><button class="btn sm" data-act="close-modal">Close</button></div>
      <ol>
        <li><strong>Admin → Setup.</strong> Create the exam cycle from scratch (or use "Fill with Digii University's values" and review each step).</li>
        <li><strong>Set today's date</strong> with the date bar or the "Jump to" chips. Time only moves forward; use <em>Undo</em> or <em>Restart</em> to go back.</li>
        <li><strong>Student view</strong>: pick any of the 12 students in the top bar. Each sees where they stand, why, and what to do next.</li>
        <li><strong>Admin → Changes</strong>: the evidence-pack timeline is listed; "Prepare" a change, <em>Preview impact</em> (before/after for every student), give a reason, confirm.</li>
        <li><strong>Admin → Final list</strong>: lock &amp; publish; then see hall-ticket list, headcount per paper (vs the old course-registration count), exceptions and money.</li>
        <li><strong>Admin → Audit log</strong>: every event, including what the admin saw before confirming each change.</li>
      </ol>
      <h3>What is simulated</h3>
      <ul>
        <li><strong>Payments</strong>: a "Pay" button; you choose when the bank confirms (instantly, 5 min or 2 h later).</li>
        <li><strong>Notifications</strong>: in-app "What changed for you" notices only.</li>
        <li><strong>Login &amp; roles</strong>: one admin view with the owner of each setting and change shown; Dean approval of corrections is a checkbox.</li>
        <li><strong>Data from other Digii modules</strong>: attendance, results (backlogs, grades) and tuition dues come from the sample data. Attendance between the three given dates is interpolated.</li>
        <li><strong>Sample-data student actions</strong> (S03 pays 3 Nov, S12 starts 11 Nov, S07 pays 12 Nov, S08 pays 11:58 PM 20 Nov) play automatically on their date; switch off on the Dashboard.</li>
        <li><strong>Clock</strong>: "today" is simulated; deadlines end at 11:59 PM. Data is saved in this browser only.</li>
      </ul>
      <h3>Key rules (all are settings)</h3>
      <ul>
        <li>Eligibility is decided per student × paper. Hall tickets, seating and printing come from the locked final list, not course registration.</li>
        <li>Fee fixed at payment. Payment counted at start time. Shortened deadlines don't hit students already in progress.</li>
        <li>A change that newly affects a student after their window closed gives them a catch-up window (default 3 days) with no late fee.</li>
        <li>Backlog and improvement papers are not blocked by this semester's attendance. Tuition dues warn by default.</li>
        <li>After lock, any change to the list is a numbered amendment; students get a new hall-ticket version.</li>
      </ul></div></div>`;
  }

  // ------------------------------------------------------------ render
  function render() {
    renderTop();
    document.getElementById('app').innerHTML = ui.role === 'admin' ? renderAdmin() : renderStudent();
    renderModal();
  }

  // ------------------------------------------------------------ actions
  function jumpTo(to) {
    if (to === now()) return;
    const r = Store.setNow(to);
    if (r && r.error) flash('bad', r.error); else { flash('ok', `Today is now ${fmtTs(to)}.`); if (ui.change) ui.change.preview = null; }
    render();
  }
  const ACT = {
    role: (t) => { ui.role = t.dataset.v; ui.flash = null; render(); },
    tab: (t) => { ui.role = 'admin'; ui.tab = t.dataset.v; ui.flash = null; render(); },
    undo: () => { Store.undo(); ui.change = null; flash('ok', 'Undone.'); render(); },
    reset: () => { if (confirm('Restart from an empty setup? All actions will be cleared.')) { Store.reset(); ui.wizard = null; ui.change = null; ui.sel = {}; ui.tab = 'setup'; flash('ok', 'Restarted from an empty setup.'); render(); } },
    about: () => { ui.modal = 'about'; render(); },
    'close-modal': (t, ev) => { if (ev.target.closest('[data-stop]') && !t.matches('button')) return; ui.modal = null; render(); },
    go: () => { const d = document.getElementById('clkDate').value, tm = document.getElementById('clkTime').value || '10:00'; if (d) jumpTo(`${d}T${tm}`); },
    plusday: () => jumpTo(`${E.addDays(now(), 1)}T${now().slice(11, 16)}`),
    jump: (t) => jumpTo(`${t.dataset.v}T10:00`),
    'view-student': (t) => { ui.role = 'student'; ui.sid = t.dataset.v; ui.flash = null; render(); },
    // wizard
    'wz-step': (t) => { ui.wizard.step = Number(t.dataset.v); render(); },
    'wz-next': () => { ui.wizard.step++; render(); },
    'wz-prev': () => { ui.wizard.step--; render(); },
    'wz-redates': () => { ui.wizard.draft.dates = E.defaultSettings(ui.wizard.draft.cycle.examStart).dates; render(); },
    'wz-addrule': () => { const S = ui.wizard.draft; S.exceptions.condonation.push({ programs: [], min: 65, max: Number(S.attendance.threshold) || 75 }); render(); },
    'wz-delrule': (t) => { ui.wizard.draft.exceptions.condonation.splice(Number(t.dataset.v), 1); render(); },
    'wz-evidence': () => {
      const L = D.LAST_SEMESTER, S = ui.wizard.draft;
      Object.assign(S.cycle, L.cycle); Object.assign(S.dates, L.dates); Object.assign(S.fees, L.fees); S.exceptions.improvement = { ...L.improvement };
      ui.wizard.autoDates = false;
      flash('ok', 'Filled with the evidence-pack dates and fees (form 1–15 Nov, cut-off 31 Oct, publish 5 Dec, exams 12 Dec; ₹1,200 / ₹300 / ₹500 / ₹1,000; improvement allowed). Review each step, then create.');
      render();
    },
    'wz-create': () => { const r = E.createCycle(st(), ui.wizard.draft, now()); if (!r.error) { ui.tab = 'dashboard'; } run(r, 'Exam cycle created (settings v1). It follows the dates you set.'); },
    // changes
    ctype: (t) => { ui.change = { type: t.dataset.v, fields: E.changeDefaults(st(), t.dataset.v), meta: { reason: '', ref: '' }, preview: null }; ui.flash = null; render(); },
    prep: (t) => {
      const it = D.TIMELINE[Number(t.dataset.v)];
      ui.change = { type: it.change.type, fields: { ...E.changeDefaults(st(), it.change.type), ...E.clone(it.change.fields) }, meta: { reason: it.change.reason, ref: it.change.ref }, preview: null, eventDate: it.date };
      ui.flash = null; render();
    },
    'cancel-change': () => { ui.change = null; render(); },
    preview: () => { ui.change.preview = E.previewChange(st(), { type: ui.change.type, fields: ui.change.fields }, now()); render(); },
    'discard-change': () => { ui.change.preview = null; flash('muted', 'Change discarded — nothing changed.'); render(); },
    'confirm-change': () => {
      const p = ui.change.preview;
      const r = E.commitChange(st(), p, ui.change.meta);
      if (!r.error) ui.change = null;
      run(r, r.error ? '' : `Confirmed: ${p.title}. ${p.summary.affected} student(s) notified; recorded in the audit log.`);
    },
    approve: (t) => run(E.decideCondonation(st(), t.dataset.v, true, now()), `Condonation approved for ${t.dataset.v}.`),
    reject: (t) => run(E.decideCondonation(st(), t.dataset.v, false, now()), `Condonation rejected for ${t.dataset.v}.`),
    lock: () => run(E.lock(st(), now()), 'Final list locked and published (v1). Hall tickets are available to students.'),
    csv: (t) => {
      const o = E.outputs(st(), now()), k = t.dataset.v;
      if (k === 'rows') download('final-list.csv', [['hall_ticket_no', 'student_id', 'name', 'program', 'semester', 'paper', 'paper_name', 'type']].concat(o.rows.map((r) => [`DU-D25-${r.sid}`, r.sid, r.name, r.program, r.sem, r.code, r.paper, r.type])));
      if (k === 'papers') download('headcount-per-paper.csv', [['paper', 'name', 'regular', 'backlog', 'improvement', 'total', 'old_course_registration_count']].concat(o.papers.map((p) => [p.code, p.name, p.regular, p.backlog, p.improvement, p.total, p.oldCount])));
      if (k === 'exceptions') download('not-on-list.csv', [['student_id', 'name', 'program', 'status', 'papers']].concat(o.exceptions.map((x) => [x.sid, x.name, x.program, x.status, x.papers])));
      if (k === 'money') download('money.csv', [['student_id', 'name', 'paid', 'due', 'refund_due', 'refund_reason']].concat(o.money.map((m) => [m.sid, m.name, m.paid, m.due, m.refund, m.refundReason])));
    },
    'toggle-audit': (t) => { ui.openAudit[t.dataset.v] = !ui.openAudit[t.dataset.v]; render(); },
    // student
    'save-sel': () => { const sid = ui.sid; const r = E.submitForm(st(), sid, ui.sel[sid], now()); if (!r.error) ui.sel[sid] = {}; run(r, 'Paper choices saved.'); },
    pay: () => run(E.pay(st(), ui.sid, now(), ui.payDelay), 'Payment recorded (simulated).'),
    'apply-cond': () => run(E.applyCondonation(st(), ui.sid, now()), 'Condonation request submitted. Pay the fee to complete it.'),
    print: () => window.print(),
  };

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
    if (t.disabled) return;
    const fn = ACT[t.dataset.act];
    if (fn) fn(t, ev);
  });
  function bindValue(t) {
    const [scope, path] = t.dataset.bind.split(':');
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.num && v !== '') v = Number(v);
    setPath(scopeObj(scope), path, v);
    if (scope === 'w' && path === 'cycle.examStart' && ui.wizard.autoDates) ui.wizard.draft.dates = E.defaultSettings(v).dates;
    if (scope === 'w' && path.startsWith('dates.')) ui.wizard.autoDates = false;
    if (scope !== 'w' && ui.change) ui.change.preview = null;
  }
  document.addEventListener('input', (ev) => { const t = ev.target; if (t.dataset && t.dataset.bind && t.type !== 'checkbox' && t.tagName !== 'SELECT') bindValue(t); });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.bind) { bindValue(t); render(); return; }
    if (t.dataset.arr) {
      const [scope, path] = t.dataset.arr.split(':');
      const arr = getPath(scopeObj(scope), path);
      const i = arr.indexOf(t.value);
      if (t.checked && i < 0) arr.push(t.value);
      if (!t.checked && i >= 0) arr.splice(i, 1);
      if (scope !== 'w' && ui.change) ui.change.preview = null;
      render(); return;
    }
    if (t.dataset.sel) { (ui.sel[ui.sid] = ui.sel[ui.sid] || {})[t.dataset.sel] = t.checked; render(); return; }
    const c = t.dataset.change;
    if (c === 'student') { ui.sid = t.value; ui.role = 'student'; ui.flash = null; render(); }
    if (c === 'delay') { ui.payDelay = Number(t.value); }
    if (c === 'autoplay') { const s = E.clone(st()); s.auto.enabled = t.checked; Store.apply({ state: s }); render(); }
  });

  Store.load();
  if (st().cycle) ui.tab = 'dashboard';
  render();
})();
