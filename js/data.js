/* Sample data from the assignment (section 4) plus reference data the prototype needs.
   Nothing here decides an outcome: eligibility, fees and statuses are computed by engine.js. */
(function (root) {
  'use strict';

  // Attendance is given as "% from semester start up to" these dates.
  const ATT_DATES = ['2025-10-31', '2025-11-20', '2025-11-30'];

  const PROGRAMS = ['B.Tech CSE', 'BBA', 'B.Sc Physics', 'B.Com'];

  const COURSES = {
    CS301: { name: 'Operating Systems' },
    CS302: { name: 'Computer Networks' },
    CS303: { name: 'Database Systems' },
    CS304: { name: 'Theory of Computation' },
    MA301: { name: 'Probability & Statistics' },
    CS204: { name: 'Data Structures' },
    MA201: { name: 'Discrete Mathematics' },
    CS210: { name: 'Digital Logic' },
    BB201: { name: 'Marketing Management' },
    BB202: { name: 'Financial Management' },
    BB203: { name: 'Organisational Behaviour' },
    BB204: { name: 'Business Law' },
    BB205: { name: 'Business Statistics' },
    EN201: { name: 'Business Communication' },
    BB105: { name: 'Principles of Accounting' },
    BB108: { name: 'Business Economics' },
    PH301: { name: 'Physics III' },
    PH302: { name: 'Statistical Mechanics' },
    PH303: { name: 'Electrodynamics' },
    MA305: { name: 'Mathematical Physics' },
    PH401: { name: 'Nuclear Physics' },
    PH402: { name: 'Solid State Physics' },
    PH403: { name: 'Atomic & Molecular Physics' },
    PH404: { name: 'Computational Physics' },
    CO301: { name: 'Corporate Accounting' },
    CO302: { name: 'Income Tax' },
    CO303: { name: 'Auditing' },
    CO304: { name: 'Cost Accounting' },
    CO305: { name: 'Business Finance' },
  };

  const BTECH5 = ['CS301', 'CS302', 'CS303', 'CS304', 'MA301'];
  const BBA3 = ['BB201', 'BB202', 'BB203', 'BB204', 'BB205', 'EN201'];
  const BCOM5 = ['CO301', 'CO302', 'CO303', 'CO304', 'CO305'];

  // results: past-semester outcomes as the Results module would hold them (grade F = backlog).
  // Semesters for MA201/CS210/BB105/BB108 are not given in the pack; assumed.
  const STUDENTS = [
    { id: 'S01', name: 'Aarav Mehta', program: 'B.Tech CSE', sem: 5, courses: BTECH5, results: [], att: [82, 84, 85], dues: 0, facts: '—' },
    { id: 'S02', name: 'Diya Nair', program: 'B.Tech CSE', sem: 5, courses: BTECH5, results: [{ code: 'CS204', sem: 3, grade: 'F' }], att: [71, 77, 79], dues: 0, facts: 'Backlog: CS204 (Sem 3)' },
    { id: 'S03', name: 'Rohan Gupta', program: 'B.Tech CSE', sem: 5, courses: BTECH5, results: [], att: [78, 72, 68], dues: 0, facts: 'Paid exam fee on 3 Nov' },
    { id: 'S04', name: 'Ishita Rao', program: 'BBA', sem: 3, courses: BBA3, results: [], att: [68, 69, 70], dues: 0, facts: '—' },
    { id: 'S05', name: 'Kabir Singh', program: 'B.Sc Physics', sem: 5, courses: ['PH301', 'PH302', 'PH303', 'MA305'], results: [], att: [68, 70, 71], dues: 0, facts: '—' },
    { id: 'S06', name: 'Meera Iyer', program: 'B.Tech CSE', sem: 5, courses: BTECH5, results: [{ code: 'MA201', sem: 3, grade: 'F' }, { code: 'CS210', sem: 4, grade: 'F' }], att: [88, 87, 86], dues: 18000, facts: 'Backlog: MA201, CS210 · Tuition dues ₹18,000' },
    { id: 'S07', name: 'Arjun Das', program: 'BBA', sem: 3, courses: BBA3, results: [{ code: 'BB105', sem: 1, grade: 'F' }, { code: 'BB108', sem: 2, grade: 'F' }], att: [90, 91, 90], dues: 0, facts: 'Backlog: BB105, BB108 · Wants to write only BB105 this time · Paid on 12 Nov' },
    { id: 'S08', name: 'Sana Khan', program: 'B.Com', sem: 5, courses: BCOM5, results: [], att: [76, 76, 76], dues: 0, facts: 'Paid at 11:58 PM on 20 Nov; bank confirmation 12:03 AM on 21 Nov' },
    { id: 'S09', name: 'Vikram Joshi', program: 'B.Tech CSE', sem: 5, courses: BTECH5, results: [], att: [74.6, 74.6, 75.2], dues: 0, facts: 'On 6 Dec a faculty correction changes his 31 Oct figure to 75.1%' },
    { id: 'S10', name: 'Priya Menon', program: 'B.Sc Physics', sem: 7, courses: ['PH401', 'PH402', 'PH403', 'PH404'], results: [{ code: 'PH301', sem: 5, grade: 'C' }], att: [80, 81, 82], dues: 0, facts: 'Passed PH301 (Sem 5) with grade C; wants to improve' },
    { id: 'S11', name: 'Nikhil Verma', program: 'B.Tech CSE', sem: 5, courses: BTECH5, results: [], att: [85, 85, 86], dues: 0, facts: 'Debarred for one semester by the disciplinary committee on 25 Nov' },
    { id: 'S12', name: 'Ananya Pillai', program: 'B.Com', sem: 5, courses: BCOM5, results: [], att: [79, 80, 80], dues: 0, facts: 'Started the exam process on 11 Nov but had not paid when the deadline was cut' },
  ];

  // Student-side facts from the sample data. They play automatically as the clock passes them
  // (can be switched off), so the evaluator does not have to re-enact them by hand.
  const SAMPLE_ACTIONS = [
    { key: 'S03-pay', at: '2025-11-03T11:00', sid: 'S03', act: 'submitAndPay', delay: 0, label: 'S03 submits the form and pays the exam fee (sample data: "Paid exam fee on 3 Nov")' },
    { key: 'S12-start', at: '2025-11-11T09:00', sid: 'S12', act: 'submit', label: 'S12 starts the exam form but does not pay (sample data: "Started on 11 Nov")' },
    { key: 'S07-pay', at: '2025-11-12T11:00', sid: 'S07', act: 'submitAndPay', delay: 0, selection: { BB105: true, BB108: false }, label: 'S07 keeps BB105, opts out of BB108, and pays (sample data: "Paid on 12 Nov")' },
    { key: 'S08-pay', at: '2025-11-20T23:58', sid: 'S08', act: 'submitAndPay', delay: 5, label: 'S08 pays at 11:58 PM; bank confirms at 12:03 AM on 21 Nov (sample data)' },
  ];

  // Evidence-pack timeline (section 2.5). "change" entries can be prepared as admin changes;
  // the admin still reviews the impact preview and confirms.
  const TIMELINE = [
    { date: '2025-10-31', label: 'Attendance cut-off', kind: 'info', note: 'Set as the cut-off date during setup.' },
    { date: '2025-11-01', label: 'Exam form opens (last date 15 Nov)', kind: 'info', note: 'Happens automatically from the form-open date set in setup.' },
    { date: '2025-11-11', label: 'Exam dates moved earlier; form deadline cut 15 Nov → 12 Nov', kind: 'change', change: { type: 'deadline', fields: { value: '2025-11-12' }, ref: 'Circular dated 11 Nov', reason: 'Exam dates moved earlier' } },
    { date: '2025-11-13', label: 'Backlog fee revised ₹300 → ₹400 per paper', kind: 'change', change: { type: 'fees', fields: { perPaper: 400 }, ref: 'Finance committee decision, 13 Nov', reason: 'Backlog fee revised by finance committee' } },
    { date: '2025-11-14', label: 'Deadline extended to 20 Nov with ₹500 late fee', kind: 'change', change: { type: 'lateWindow', fields: { end: '2025-11-20', fee: 500 }, ref: 'Circular dated 14 Nov', reason: 'Extension after student protests' } },
    { date: '2025-11-18', label: 'State condonation notified (65–75%, B.Tech & BBA, ₹1,000)', kind: 'change', change: { type: 'condonation', fields: { programs: ['B.Tech CSE', 'BBA'], min: 65, max: 75, fee: 1000 }, ref: 'State notification, 18 Nov', reason: 'State condonation notification' } },
    { date: '2025-11-20', label: 'S08 pays at 11:58 PM (sample data, plays automatically)', kind: 'info', note: 'Student action from the sample data.' },
    { date: '2025-11-22', label: 'Dean requests cut-off move 31 Oct → 20 Nov', kind: 'change', change: { type: 'cutoff', fields: { value: '2025-11-20' }, ref: 'Dean, School of Engineering — request 22 Nov', reason: 'Students improved attendance after 31 Oct' } },
    { date: '2025-11-25', label: 'S11 debarred by disciplinary committee (sample data)', kind: 'change', change: { type: 'hold', fields: { sid: 'S11', note: 'Debarred for one semester' }, ref: 'Disciplinary committee order, 25 Nov', reason: 'Disciplinary committee decision' } },
    { date: '2025-11-30', label: 'Last day of classes', kind: 'info', note: 'No action needed: attendance after the cut-off does not count.' },
    { date: '2025-12-05', label: 'Hall tickets published', kind: 'lock', note: 'Lock & publish the final list (Final list tab).' },
    { date: '2025-12-06', label: 'S09 attendance correction: 31 Oct figure → 75.1%', kind: 'change', change: { type: 'correction', fields: { sid: 'S09', point: '2025-10-31', newValue: 75.1, deanApproved: true }, ref: 'Faculty correction, approved by Dean', reason: 'Faculty corrected October attendance records' } },
    { date: '2025-12-12', label: 'Exams begin', kind: 'info', note: 'Changes are frozen once exams start.' },
  ];

  // Values from the evidence pack, offered as a one-click fill in the setup wizard.
  const LAST_SEMESTER = {
    cycle: { name: 'December 2025 end-semester exams', examStart: '2025-12-12' },
    dates: { formOpen: '2025-11-01', deadline: '2025-11-15', lateEnd: '', cutoff: '2025-10-31', lockDate: '2025-12-05' },
    fees: { semester: 1200, perPaper: 300, late: 500, condonation: 1000 },
    improvement: { allowed: true, max: 2 },
  };

  root.DigiiData = { ATT_DATES, PROGRAMS, COURSES, STUDENTS, SAMPLE_ACTIONS, TIMELINE, LAST_SEMESTER };
  if (typeof module !== 'undefined') module.exports = root.DigiiData;
})(typeof globalThis !== 'undefined' ? globalThis : this);
