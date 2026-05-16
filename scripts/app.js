/* ============================================================
   app.js — Event wiring + init.
   Loaded last, after the DOM is fully parsed.
   ============================================================ */

/* --- Navigation ------------------------------------------- */
$$('.nav-item').forEach(n => n.addEventListener('click', () => setView(n.dataset.view)));

/* --- Theme toggle ----------------------------------------- */
$('#theme-switch').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(); save();
  if (currentView === 'analytics') renderCharts();
});

/* --- Week stepper ----------------------------------------- */
$('#week-up').addEventListener('click', () => {
  state.semester.currentWeek = Math.min(state.semester.totalWeeks, state.semester.currentWeek + 1);
  save(); render();
});
$('#week-down').addEventListener('click', () => {
  state.semester.currentWeek = Math.max(1, state.semester.currentWeek - 1);
  save(); render();
});

/* --- Professional / Personal pill tabs ------------------- */
$$('#pro-tabs .pill-tab').forEach(t => t.addEventListener('click', () => {
  proTab = t.dataset.pro;
  $$('#pro-tabs .pill-tab').forEach(x => x.classList.toggle('active', x.dataset.pro === proTab));
  renderProfessional();
}));
$$('#pers-tabs .pill-tab').forEach(t => t.addEventListener('click', () => {
  persTab = t.dataset.pers;
  $$('#pers-tabs .pill-tab').forEach(x => x.classList.toggle('active', x.dataset.pers === persTab));
  renderPersonal();
}));

/* --- Settings — semester details ------------------------- */
$('#set-save').addEventListener('click', () => {
  state.semester.name = $('#set-name').value.trim();
  state.semester.startDate = $('#set-start').value;
  state.semester.totalWeeks = Math.max(1, Math.min(20, Number($('#set-weeks').value) || 13));
  state.semester.userName = $('#set-user').value.trim();
  if (state.semester.currentWeek > state.semester.totalWeeks) state.semester.currentWeek = state.semester.totalWeeks;
  save(); toast('Saved.', 'success'); render();
});

/* --- Settings — data export / import / reset ------------ */
$('#export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `semester-hub-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('Exported.', 'success');
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!confirm('This will replace your current data. Continue?')) return;
      state = { ...structuredClone(DEFAULT_STATE), ...data };
      save(); applyTheme(); render(); toast('Imported.', 'success');
    } catch (err) { toast('Could not read file.', 'danger'); }
  };
  r.readAsText(f);
});
$('#reset-data').addEventListener('click', () => {
  if (!confirm('Erase ALL data and start over? Export first if you want a backup.')) return;
  if (!confirm('Really sure? This cannot be undone.')) return;
  state = structuredClone(DEFAULT_STATE);
  save(); applyTheme(); render(); toast('Reset.', 'success');
});

/* --- Cloud sync UI wiring -------------------------------- */
$('#open-setup').addEventListener('click', showSetupOverlay);
$('#setup-submit').addEventListener('click', doSetup);
$('#setup-cancel').addEventListener('click', hideSetupOverlay);
$('#setup-overlay').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSetup(); });

$('#lock-submit').addEventListener('click', doUnlock);
$('#lock-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });
$('#lock-skip').addEventListener('click', () => {
  hideLockOverlay();
  setSyncStatus('idle');
  toast('Continuing in local-only mode. Cloud sync is paused.', 'info');
});
$('#lock-reset').addEventListener('click', () => {
  if (!confirm('Reset local cloud-sync data on THIS device?\n\nYour JSONBin bin and its data stay safe on jsonbin.io — you can reconnect later with your Master Key. Local data here will remain intact.')) return;
  resetSecurity();
  hideLockOverlay();
  toast('Local sync data cleared. You can set up again from Settings.', 'success');
});

$('#sync-now').addEventListener('click', manualSyncNow);
$('#sync-pull').addEventListener('click', pullFromCloud);
$('#sync-disconnect').addEventListener('click', doDisconnect);
$('#change-creds').addEventListener('click', doChangeCredentials);
$('#change-pin').addEventListener('click', doChangePin);

$('#sync-pill').addEventListener('click', () => {
  if (isCloudConfigured() && !isUnlocked()) {
    showLockOverlay();
  } else {
    setView('settings');
  }
});

/* --- Modal backdrop & keyboard shortcuts ----------------- */
$('#modal-backdrop').addEventListener('click', (e) => {
  if (e.target === $('#modal-backdrop')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'a' && !inFormInput(e)) { e.preventDefault(); openModal('assignment'); }
  if (e.key === 'c' && !inFormInput(e)) { e.preventDefault(); openModal('course'); }
});
function inFormInput(e) {
  const t = e.target.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable;
}

/* --- Quick capture --------------------------------------- */
$('#quick-add').addEventListener('click', addQuick);
$('#quick-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addQuick(); });
function addQuick() {
  const v = $('#quick-input').value.trim();
  if (!v) return;
  const target = $('#quick-target').value;
  if (target === 'focus') {
    state.focus.push({ id: uid(), text: v, done: false, date: todayStr() });
  } else if (target === 'weekly') {
    const w = state.semester.currentWeek;
    state.weekly[w] = state.weekly[w] || { tasks: [], notes: '' };
    state.weekly[w].tasks.push({ id: uid(), text: v, done: false });
  } else if (target === 'goal-personal') {
    state.personal.goals.push({ id: uid(), text: v, kind: 'personal', progress: 0, done: false });
  } else if (target === 'goal-professional') {
    state.personal.goals.push({ id: uid(), text: v, kind: 'professional', progress: 0, done: false });
  }
  save();
  $('#quick-input').value = '';
  render();
  toast('Saved.', 'success');
}

/* --- App init -------------------------------------------- */
async function init() {
  applyTheme();
  render();
  setSyncStatus('idle');

  const migrating = migrateLegacySync();

  if (isCloudConfigured() && !migrating) {
    showLockOverlay();
    setSyncStatus('idle');
  }

  state.hasOpened = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  renderSyncInfo();
}
init();
