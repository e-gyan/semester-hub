/* ============================================================
   modals.js — Modal shell + dispatcher + all entity modals.
   Depends on: helpers.js (el, $, $$, toast, richEditor, sanitizeRichHTML),
               state.js (state, COURSE_COLORS, uid, todayStr).
   Calls render*() functions defined in views.js — fine at runtime.
   ============================================================ */

function openModal(kind, ctx = {}) {
  const m = $('#modal');
  m.innerHTML = '';
  if (kind === 'course')          buildCourseModal(m, ctx);
  else if (kind === 'assignment') buildAssignmentModal(m, ctx);
  else if (kind === 'reading')    buildReadingModal(m, ctx);
  else if (kind === 'focus')      buildFocusModal(m);
  else if (kind === 'app')        buildAppModal(m);
  else if (kind === 'contact')    buildContactModal(m);
  else if (kind === 'skill')      buildSkillModal(m);
  else if (kind === 'project')    buildProjectModal(m);
  else if (kind === 'habit')      buildHabitModal(m);
  else if (kind === 'budget-cat') buildBudgetModal(m);
  else if (kind === 'goal')       buildGoalModal(m);
  else if (kind === 'wellness')   buildWellnessModal(m);
  else if (kind === 'time-log')   buildTimeLogModal(m);
  $('#modal-backdrop').classList.add('open');
}

function closeModal() { $('#modal-backdrop').classList.remove('open'); }

function modalShell(m, title, sub, body, onSave) {
  m.appendChild(el('div', { class: 'modal-head' }, el('h3', {}, title), sub ? el('p', {}, sub) : null));
  m.appendChild(body);
  const foot = el('div', { class: 'modal-foot' },
    el('button', { class: 'btn', onclick: closeModal }, 'Cancel'),
    el('button', { class: 'btn btn-primary', onclick: onSave }, 'Save')
  );
  m.appendChild(foot);
}

function field(label, inputEl) {
  return el('div', { class: 'field' }, el('label', {}, label), inputEl);
}

/* --- Course modal ----------------------------------------- */
function buildCourseModal(m, ctx) {
  const editing = ctx.editId ? state.courses.find(c => c.id === ctx.editId) : null;
  let chosenColor = editing ? editing.color : COURSE_COLORS[state.courses.length % COURSE_COLORS.length];
  const swatches = el('div', { class: 'color-picker' });
  COURSE_COLORS.forEach(col => {
    const s = el('div', {
      class: 'color-swatch' + (col === chosenColor ? ' selected' : ''),
      style: 'background:' + col,
      'data-color': col,
      onclick: () => {
        chosenColor = col;
        $$('.color-swatch', swatches).forEach(x => x.classList.toggle('selected', x.getAttribute('data-color') === col));
      }
    });
    swatches.appendChild(s);
  });
  const nameI = el('input', { placeholder: 'Course name (e.g. Data Analytics for Business)', value: editing?.name || '' });
  const codeI = el('input', { placeholder: 'Code (e.g. ITB-501)', value: editing?.code || '' });
  const instI = el('input', { placeholder: 'Instructor', value: editing?.instructor || '' });
  const credI = el('input', { type: 'number', placeholder: '3', value: editing?.credits || '' });
  const body = el('div', { class: 'modal-body' },
    field('Course name', nameI),
    el('div', { class: 'field-row' }, field('Code', codeI), field('Credits', credI)),
    field('Instructor', instI),
    field('Color', swatches)
  );
  modalShell(m, editing ? 'Edit course' : 'New course', 'You can change any of this later.', body, () => {
    if (!nameI.value.trim()) { toast('Give it a name.', 'danger'); return; }
    if (editing) {
      Object.assign(editing, { name: nameI.value.trim(), code: codeI.value.trim(), instructor: instI.value.trim(), credits: Number(credI.value) || 0, color: chosenColor });
    } else {
      state.courses.push({ id: uid(), name: nameI.value.trim(), code: codeI.value.trim(), instructor: instI.value.trim(), credits: Number(credI.value) || 0, color: chosenColor, assignments: [], readings: [], notes: '' });
    }
    save(); closeModal(); render();
    toast(editing ? 'Course updated.' : 'Course added.', 'success');
  });
  setTimeout(() => nameI.focus(), 50);
}

/* --- Assignment modal ------------------------------------- */
function buildAssignmentModal(m, ctx) {
  const editing = ctx.editId ? state.courses.find(c => c.id === ctx.courseId)?.assignments?.find(a => a.id === ctx.editId) : null;
  const courseSel = el('select');
  if (state.courses.length === 0) {
    courseSel.appendChild(el('option', { value: '' }, 'Add a course first'));
    courseSel.disabled = true;
  } else {
    state.courses.forEach(c => courseSel.appendChild(el('option', { value: c.id, ...(c.id === ctx.courseId ? { selected: 'selected' } : {}) }, c.name || c.code)));
  }
  if (editing) courseSel.disabled = true;
  const nameI = el('input', { placeholder: 'Assignment title', value: editing?.name || '' });
  const descI = el('textarea', { placeholder: 'Describe the assignment — prompt, scope, what success looks like…', rows: 3 });
  descI.value = editing?.description || '';
  const typeI = el('select');
  ['Individual','Group work','Project','Other'].forEach(t => typeI.appendChild(el('option', { value: t, ...(t === (editing?.type || 'Individual') ? { selected: 'selected' } : {}) }, t)));
  const dueI = el('input', { type: 'date', value: editing?.due || '' });
  const wI = el('input', { type: 'number', placeholder: 'Weight % (optional)', value: editing?.weight ?? '' });
  const maxI = el('input', { type: 'number', placeholder: 'Max points', value: editing?.max ?? 100 });
  const body = el('div', { class: 'modal-body' },
    field('Course', courseSel),
    field('Title', nameI),
    field('Description', descI),
    el('div', { class: 'field-row' }, field('Type', typeI), field('Max points', maxI)),
    el('div', { class: 'field-row' }, field('Due date', dueI), field('Weight (%)', wI))
  );
  modalShell(m, editing ? 'Edit assignment' : 'New assignment', editing ? 'Update the details.' : 'Drop it in. You can fill the score later.', body, () => {
    if (state.courses.length === 0) { closeModal(); return; }
    if (!nameI.value.trim()) { toast('Title required.', 'danger'); return; }
    if (editing) {
      Object.assign(editing, {
        name: nameI.value.trim(),
        description: descI.value.trim(),
        type: typeI.value,
        due: dueI.value,
        weight: wI.value ? Number(wI.value) : null,
        max: Number(maxI.value) || 100,
      });
      save(); closeModal(); render();
      toast('Assignment updated.', 'success');
    } else {
      const c = state.courses.find(c => c.id === courseSel.value);
      c.assignments = c.assignments || [];
      c.assignments.push({
        id: uid(),
        name: nameI.value.trim(),
        description: descI.value.trim(),
        type: typeI.value,
        due: dueI.value,
        weight: wI.value ? Number(wI.value) : null,
        max: Number(maxI.value) || 100,
        score: null,
        done: false
      });
      save(); closeModal(); render();
      toast('Assignment added.', 'success');
    }
  });
  setTimeout(() => nameI.focus(), 50);
}

/* --- Reading modal ---------------------------------------- */
function buildReadingModal(m, ctx) {
  const editing = ctx.editId ? state.courses.find(c => c.id === ctx.courseId)?.readings?.find(r => r.id === ctx.editId) : null;
  const courseSel = el('select');
  state.courses.forEach(c => courseSel.appendChild(el('option', { value: c.id, ...(c.id === ctx.courseId ? { selected: 'selected' } : {}) }, c.name || c.code)));
  if (editing) courseSel.disabled = true;
  const tI = el('input', { placeholder: 'Title', value: editing?.title || '' });
  const typeI = el('select');
  ['Article','Book','Further search & understanding','Other'].forEach(t =>
    typeI.appendChild(el('option', { value: t, ...(t === (editing?.type || 'Article') ? { selected: 'selected' } : {}) }, t))
  );
  const uI = el('input', { placeholder: 'URL (optional)', value: editing?.url || '' });
  const dI = el('input', { type: 'date', value: editing?.date || '' });
  const wSelect = el('select');
  const refillWeeks = () => {
    const cur = wSelect.value;
    wSelect.innerHTML = '';
    wSelect.appendChild(el('option', { value: '' }, '— Auto from date —'));
    for (let i = 1; i <= state.semester.totalWeeks; i++) {
      wSelect.appendChild(el('option', { value: String(i) }, 'Week ' + i + (weekDateRange(i) ? ' • ' + weekDateRange(i) : '')));
    }
    wSelect.value = cur;
  };
  refillWeeks();
  if (editing?.week) wSelect.value = String(editing.week);
  let weekManuallySet = !!editing?.week;
  wSelect.addEventListener('change', () => { weekManuallySet = !!wSelect.value; });
  dI.addEventListener('change', () => {
    if (!weekManuallySet) {
      const w = weekOfDate(dI.value);
      if (w) wSelect.value = String(w);
    }
  });
  let richHTML = editing?.note || '';
  const noteEd = richEditor(richHTML, (h) => { richHTML = h; }, 'Your thoughts, key takeaways, quotes…');

  const body = el('div', { class: 'modal-body' },
    field('Course', courseSel),
    field('Title', tI),
    el('div', { class: 'field-row' }, field('Type', typeI), field('Date', dI)),
    field('Week', wSelect),
    field('Link', uI),
    field('Notes (rich text)', noteEd)
  );
  modalShell(m, editing ? 'Edit reading' : 'Add reading / resource', null, body, () => {
    if (!tI.value.trim()) { toast('Title required.', 'danger'); return; }
    const c = state.courses.find(c => c.id === courseSel.value);
    let week = wSelect.value ? Number(wSelect.value) : null;
    if (!week && dI.value) week = weekOfDate(dI.value);
    const data = {
      title: tI.value.trim(),
      type: typeI.value,
      url: uI.value.trim(),
      date: dI.value,
      week,
      note: sanitizeRichHTML(richHTML)
    };
    if (editing) {
      Object.assign(editing, data);
      toast('Reading updated.', 'success');
    } else {
      c.readings = c.readings || [];
      c.readings.push({ id: uid(), ...data, done: false });
      toast('Reading added.', 'success');
    }
    save(); closeModal(); renderCourseDetail();
  });
  setTimeout(() => tI.focus(), 50);
}

/* --- Quick / single-field modals -------------------------- */
function buildFocusModal(m) {
  const i = el('input', { placeholder: "What's the move?" });
  const body = el('div', { class: 'modal-body' }, field("Today's focus", i));
  modalShell(m, "Add to today's focus", null, body, () => {
    if (!i.value.trim()) return;
    state.focus.push({ id: uid(), text: i.value.trim(), done: false, date: todayStr() });
    save(); closeModal(); render();
  });
  setTimeout(() => i.focus(), 50);
}

function buildAppModal(m) {
  const rI = el('input', { placeholder: 'Role / position' });
  const cI = el('input', { placeholder: 'Company' });
  const sI = el('select');
  ['Interested','Applied','Interview','Offer','Rejected','Withdrew'].forEach(s => sI.appendChild(el('option', { value: s, ...(s==='Applied'?{selected:'selected'}:{}) }, s)));
  const dI = el('input', { type: 'date', value: todayStr() });
  const nI = el('input', { placeholder: 'Next step' });
  const body = el('div', { class: 'modal-body' },
    field('Role', rI), field('Company', cI),
    el('div', { class: 'field-row' }, field('Status', sI), field('Date', dI)),
    field('Next step', nI)
  );
  modalShell(m, 'New application', null, body, () => {
    if (!rI.value.trim()) return;
    state.professional.applications.push({ id: uid(), role: rI.value, company: cI.value, status: sI.value, date: dI.value, next: nI.value });
    save(); closeModal(); renderProfessional();
  });
  setTimeout(() => rI.focus(), 50);
}

function buildContactModal(m) {
  const nI = el('input', { placeholder: 'Name' });
  const rI = el('input', { placeholder: 'Role / Company' });
  const cI = el('input', { placeholder: 'How you met / context' });
  const lI = el('input', { type: 'date' });
  const fI = el('input', { type: 'date' });
  const body = el('div', { class: 'modal-body' },
    field('Name', nI), field('Role / Company', rI), field('Context', cI),
    el('div', { class: 'field-row' }, field('Last touch', lI), field('Follow up', fI))
  );
  modalShell(m, 'New contact', null, body, () => {
    if (!nI.value.trim()) return;
    state.professional.contacts.push({ id: uid(), name: nI.value, role: rI.value, context: cI.value, last: lI.value, next: fI.value });
    save(); closeModal(); renderProfessional();
  });
  setTimeout(() => nI.focus(), 50);
}

function buildSkillModal(m) {
  const nI = el('input', { placeholder: 'Skill or cert' });
  const lI = el('input', { type: 'number', value: 0, min: 0, max: 100 });
  const noI = el('input', { placeholder: 'Optional note' });
  const body = el('div', { class: 'modal-body' }, field('Skill', nI), field('Level %', lI), field('Note', noI));
  modalShell(m, 'New skill', null, body, () => {
    if (!nI.value.trim()) return;
    state.professional.skills.push({ id: uid(), name: nI.value, level: Number(lI.value) || 0, note: noI.value });
    save(); closeModal(); renderProfessional();
  });
  setTimeout(() => nI.focus(), 50);
}

function buildProjectModal(m) {
  const nI = el('input', { placeholder: 'Project name' });
  const dI = el('input', { placeholder: 'Short description' });
  const sI = el('select');
  ['Idea','In progress','Shipped','Paused'].forEach(s => sI.appendChild(el('option', {}, s)));
  const uI = el('input', { placeholder: 'Link' });
  const body = el('div', { class: 'modal-body' }, field('Name', nI), field('Description', dI), field('Status', sI), field('Link', uI));
  modalShell(m, 'New project', null, body, () => {
    if (!nI.value.trim()) return;
    state.professional.projects.push({ id: uid(), name: nI.value, desc: dI.value, status: sI.value, url: uI.value });
    save(); closeModal(); renderProfessional();
  });
  setTimeout(() => nI.focus(), 50);
}

function buildHabitModal(m) {
  const nI = el('input', { placeholder: 'Habit name (e.g. 30 min reading)' });
  const body = el('div', { class: 'modal-body' }, field('Habit', nI));
  modalShell(m, 'New habit', null, body, () => {
    if (!nI.value.trim()) return;
    state.personal.habits.push({ id: uid(), name: nI.value, checks: {} });
    save(); closeModal(); renderPersonal();
  });
  setTimeout(() => nI.focus(), 50);
}

function buildBudgetModal(m) {
  const nI = el('input', { placeholder: 'Category name (e.g. Groceries)' });
  const bI = el('input', { type: 'number', placeholder: 'Budget' });
  const body = el('div', { class: 'modal-body' }, field('Category', nI), field('Monthly budget', bI));
  modalShell(m, 'New budget category', null, body, () => {
    if (!nI.value.trim()) return;
    state.personal.budget.categories = state.personal.budget.categories || [];
    state.personal.budget.categories.push({ id: uid(), name: nI.value, budget: Number(bI.value) || 0, spent: 0 });
    save(); closeModal(); renderPersonal();
  });
  setTimeout(() => nI.focus(), 50);
}

function buildGoalModal(m) {
  const tI = el('input', { placeholder: 'Goal' });
  const kI = el('select');
  ['personal','professional','academic'].forEach(k => kI.appendChild(el('option', {}, k)));
  const body = el('div', { class: 'modal-body' }, field('Goal', tI), field('Type', kI));
  modalShell(m, 'New goal', null, body, () => {
    if (!tI.value.trim()) return;
    state.personal.goals.push({ id: uid(), text: tI.value, kind: kI.value, progress: 0, done: false });
    save(); closeModal(); renderPersonal();
  });
  setTimeout(() => tI.focus(), 50);
}

function buildWellnessModal(m) {
  const dI = el('input', { type: 'date', value: todayStr() });
  const mI = el('input', { type: 'number', min: 1, max: 10, placeholder: '1-10' });
  const sI = el('input', { type: 'number', min: 0, max: 24, placeholder: 'hours' });
  const eI = el('select');
  ['Yes','No'].forEach(o => eI.appendChild(el('option', { value: o }, o)));
  const nI = el('input', { placeholder: 'Anything on your mind?' });
  const body = el('div', { class: 'modal-body' },
    el('div', { class: 'field-row' }, field('Date', dI), field('Mood (1-10)', mI)),
    el('div', { class: 'field-row' }, field('Sleep (hrs)', sI), field('Exercise?', eI)),
    field('Note', nI)
  );
  modalShell(m, 'Wellness log', null, body, () => {
    if (!mI.value) return;
    state.personal.wellness.push({ id: uid(), date: dI.value, mood: Number(mI.value), sleep: Number(sI.value)||0, exercise: eI.value === 'Yes', note: nI.value });
    save(); closeModal(); renderPersonal();
  });
}

function buildTimeLogModal(m) {
  const dI = el('input', { type: 'date', value: todayStr() });
  const sourceI = el('select');
  sourceI.appendChild(el('option', { value: '' }, '— Pick category —'));
  state.courses.forEach(c => sourceI.appendChild(el('option', { value: 'course:' + c.id }, 'Course: ' + (c.name || c.code))));
  ['Professional','Personal','Other'].forEach(c => sourceI.appendChild(el('option', { value: 'cat:' + c }, c)));

  // Three-part time entry: hours / minutes / seconds
  const hI = el('input', { type: 'number', min: 0, max: 24, placeholder: '0' });
  const mI = el('input', { type: 'number', min: 0, max: 59, placeholder: '0' });
  const sI = el('input', { type: 'number', min: 0, max: 59, placeholder: '0' });
  const preview = el('div', { style: 'font-size: 12px; color: var(--muted); margin-top: 6px; min-height: 16px; font-weight: 500;' });

  function totalHours() {
    const h = Number(hI.value) || 0;
    const m = Number(mI.value) || 0;
    const s = Number(sI.value) || 0;
    return h + m/60 + s/3600;
  }
  function updatePreview() {
    const t = totalHours();
    if (t > 0) {
      const h = Math.floor(t);
      const mins = Math.floor((t - h) * 60);
      const secs = Math.round(((t - h) * 60 - mins) * 60);
      const parts = [];
      if (h) parts.push(h + 'h');
      if (mins) parts.push(mins + 'm');
      if (secs) parts.push(secs + 's');
      preview.textContent = '= ' + parts.join(' ') + '  •  ' + t.toFixed(3) + ' hours stored';
    } else {
      preview.textContent = '';
    }
  }
  [hI, mI, sI].forEach(inp => inp.addEventListener('input', updatePreview));

  const timeRow = el('div', { class: 'time-entry' },
    el('div', {},
      el('label', {}, 'Hours'),
      hI
    ),
    el('div', { class: 'sep' }, ':'),
    el('div', {},
      el('label', {}, 'Minutes'),
      mI
    ),
    el('div', { class: 'sep' }, ':'),
    el('div', {},
      el('label', {}, 'Seconds'),
      sI
    )
  );

  const nI = el('input', { placeholder: 'What were you doing?' });
  const body = el('div', { class: 'modal-body' },
    field('Date', dI),
    el('div', { class: 'field' },
      el('label', {}, 'Time spent'),
      timeRow,
      preview
    ),
    field('Where the time went', sourceI),
    field('Note', nI)
  );
  modalShell(m, 'Log hours', 'Down to the second if you want. Hours decimal is what gets stored.', body, () => {
    const t = totalHours();
    if (t <= 0 || !sourceI.value) { toast('Pick a category and at least some time.', 'danger'); return; }
    const log = { id: uid(), date: dI.value, hours: Number(t.toFixed(4)), note: nI.value };
    if (sourceI.value.startsWith('course:')) log.courseId = sourceI.value.slice(7);
    else log.category = sourceI.value.slice(4);
    state.timeLogs.push(log);
    save(); closeModal(); render();
    toast('Logged ' + (preview.textContent.split('•')[0]?.replace('=', '').trim() || t.toFixed(2) + 'h') + '.', 'success');
  });
  setTimeout(() => hI.focus(), 50);
}
