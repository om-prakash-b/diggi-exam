/* Command layer: simulated clock, sample-data student actions, undo history and persistence.
   advance() is pure so it can run in Node tests; the Store object wraps it for the browser. */
(function (root) {
  'use strict';
  const E = () => root.ExamEngine;
  const D = () => root.DigiiData;

  // Runs sample-data student actions whose time has come, each at its own timestamp.
  function runSampleActions(state, upto) {
    let s = state;
    const pending = D().SAMPLE_ACTIONS.filter((a) => !s.auto.done[a.key] && a.at <= upto).sort((a, b) => a.at.localeCompare(b.at));
    for (const a of pending) {
      const mark = (status, note) => { s = E().clone(s); s.auto.done[a.key] = { status, note }; };
      if (!s.auto.enabled) { mark('skipped', 'Auto-play was switched off'); continue; }
      if (!s.cycle || s.cycle.createdAt > a.at) { mark('skipped', 'No exam cycle existed at that time'); continue; }
      const ev = E().evaluateStudent(s, D().STUDENTS.find((x) => x.id === a.sid), a.at);
      if (a.act !== 'submit' && s.forms[a.sid] && ev.due === 0) { mark('skipped', 'Already done earlier in this session'); continue; }
      if (a.act === 'submit' && s.forms[a.sid]) { mark('skipped', 'Already started earlier in this session'); continue; }
      let r = E().submitForm(s, a.sid, a.selection || {}, a.at, 'sample');
      if (r.error) { mark('blocked', r.error); continue; }
      s = r.state;
      if (a.act === 'submitAndPay') {
        r = E().pay(s, a.sid, a.at, a.delay || 0, 'sample');
        if (r.error) { mark('blocked', r.error); continue; }
        s = r.state;
      }
      mark('done', '');
    }
    return s;
  }

  function advance(state, to) {
    if (to < state.now) return { error: 'Time only moves forward. Use Undo or Restart to go back.' };
    let s = E().clone(state);
    s = runSampleActions(s, to);
    s.now = to;
    s = E().tick(s, to); // e.g. a bank confirmation arriving after lock becomes an amendment
    return { state: s };
  }

  const KEY = 'digii-exam-prototype-v1';
  const Store = {
    state: null,
    history: [],
    load() {
      try { this.state = JSON.parse(localStorage.getItem(KEY)) || E().emptyState(); } catch (e) { this.state = E().emptyState(); }
      if (!this.state.auto) this.state = E().emptyState();
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* storage full or blocked: keep in memory */ } },
    // Applies a command result; keeps the previous state for Undo.
    apply(result) {
      if (!result || result.error) return result;
      this.history.push(this.state);
      if (this.history.length > 60) this.history.shift();
      this.state = result.state;
      this.save();
      return result;
    },
    undo() { if (this.history.length) { this.state = this.history.pop(); this.save(); return true; } return false; },
    reset() { this.history = []; this.state = E().emptyState(); this.save(); },
    setNow(to) { return this.apply(advance(this.state, to)); },
  };

  root.ExamStore = { Store, advance, runSampleActions };
  if (typeof module !== 'undefined') module.exports = root.ExamStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
