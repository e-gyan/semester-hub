/* ============================================================
   state.js — Application state, persistence, grade math.
   Depends on: helpers.js (toast)
   Depends on: security.js (scheduleCloudPush) — only used at runtime
   ============================================================ */

const STORAGE_KEY = 'semester_hub_v1';
const SYNC_KEY = 'semester_hub_sync_v1';   // legacy plaintext store — migrated on startup
const JSONBIN_BASE = 'https://api.jsonbin.io/v3';
const COURSE_COLORS = ['#6d5dfc','#ff7a59','#29c293','#f5a524','#3aa0ff','#d04ad6','#0fb5b5','#ef4565','#7b61ff'];

const DEFAULT_STATE = {
  semester: { name: '', startDate: '', totalWeeks: 13, currentWeek: 3, userName: '' },
  courses: [],
  weekly: {},        // { 1: { tasks:[{id,text,done}], notes:'' } }
  focus: [],         // [{id,text,done,date}]
  professional: { applications: [], contacts: [], skills: [], projects: [] },
  personal: { habits: [], budget: { income: 0, categories: [] }, goals: [], wellness: [] },
  timeLogs: [],      // [{id, date, week, courseId, category, hours, note}]
  theme: 'light',
  hasOpened: false,
};

let state = load();
let currentView = 'dashboard';
let proTab = 'apps';
let persTab = 'habits';
let courseTab = 'assignments';
let openCourseId = null;
let openWeek = null;
let timeChart = null;
let weeklyTimeChart = null;
let sortNotesDesc = true;

/* --- Persistence ------------------------------------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function save() {
  state._meta = state._meta || {};
  state._meta.savedAt = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage may be full.', 'danger'); }
  scheduleCloudPush();
}

function uid() { return Math.random().toString(36).slice(2, 10); }

/* --- Current week (auto-derived from today + startDate) ---- */
function currentWeek() {
  const total = state.semester.totalWeeks || 13;
  if (!state.semester.startDate) {
    // No start date set yet — fall back to the stored hint, default 1
    return Math.max(1, Math.min(total, state.semester.currentWeek || 1));
  }
  const start = new Date(state.semester.startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - start) / 86400000);
  const w = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(total, w));
}

/* --- Grade & GPA helpers ----------------------------------- */
function allAssignments() {
  const out = [];
  state.courses.forEach(c => (c.assignments || []).forEach(a => out.push({ ...a, courseId: c.id })));
  return out;
}

function coursePct(c) {
  const a = c.assignments || [];
  if (a.length === 0) return 0;
  const done = a.filter(x => x.done).length;
  return Math.round(done / a.length * 100);
}

function computeGPA() {
  const items = [];
  state.courses.forEach(c => {
    const g = computeCourseGrade(c);
    if (g.letter && c.credits) items.push({ gp: letterToGP(g.letter), credits: Number(c.credits) });
  });
  if (items.length === 0) return { value: null, items: [] };
  const total = items.reduce((s,i) => s + i.gp * i.credits, 0);
  const cr = items.reduce((s,i) => s + i.credits, 0);
  return { value: cr ? total/cr : null, items };
}

function computeCourseGrade(c) {
  const a = (c.assignments || []).filter(x => x.weight != null && x.score != null && x.score !== '');
  if (a.length === 0) return { earned: null, letter: null, possible: 0 };
  let earned = 0, weightSum = 0;
  a.forEach(x => {
    const w = Number(x.weight); const s = Number(x.score); const m = Number(x.max || 100);
    if (!isNaN(w) && !isNaN(s) && !isNaN(m) && m > 0) { earned += (s/m) * w; weightSum += w; }
  });
  if (weightSum === 0) return { earned: null, letter: null, possible: 0 };
  const pctOutOf100 = (earned / weightSum) * 100;
  return { earned, percent: pctOutOf100, weightSum, letter: pctToLetter(pctOutOf100) };
}

function pctToLetter(p) {
  if (p >= 93) return 'A';   if (p >= 90) return 'A-';
  if (p >= 87) return 'B+';  if (p >= 83) return 'B';  if (p >= 80) return 'B-';
  if (p >= 77) return 'C+';  if (p >= 73) return 'C';  if (p >= 70) return 'C-';
  if (p >= 67) return 'D+';  if (p >= 63) return 'D';  if (p >= 60) return 'D-';
  return 'F';
}

function letterToGP(l) {
  return { 'A':4.0,'A-':3.7,'B+':3.3,'B':3.0,'B-':2.7,'C+':2.3,'C':2.0,'C-':1.7,'D+':1.3,'D':1.0,'D-':0.7,'F':0.0 }[l] ?? 0;
}
