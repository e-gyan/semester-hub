/* ============================================================
   views.js — Render functions for every view.
   Depends on: helpers.js, state.js, security.js (renderSyncInfo),
   modals.js (openModal).
   ============================================================ */

/* --- Navigation & theme ----------------------------------- */
function setView(v) {
  currentView = v;
  $$('section[id^="view-"]').forEach(s => s.classList.add('hidden'));
  const target = $('#view-' + v);
  if (target) target.classList.remove('hidden');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === v));
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

/* --- Render dispatcher ------------------------------------ */
function render() {
  renderTopbar();
  if (currentView === 'dashboard')         renderDashboard();
  else if (currentView === 'courses')      renderCourses();
  else if (currentView === 'course-detail') renderCourseDetail();
  else if (currentView === 'weekly')       renderWeekly();
  else if (currentView === 'week-detail')  renderWeekDetail();
  else if (currentView === 'professional') renderProfessional();
  else if (currentView === 'personal')     renderPersonal();
  else if (currentView === 'analytics')    renderAnalytics();
  else if (currentView === 'settings')     renderSettings();
}

function renderTopbar() {
  const semName = state.semester.name || 'Your semester';
  const userName = state.semester.userName ? `, ${state.semester.userName}` : '';
  $('#hello').textContent = greeting() + userName + '.';
  $('#greeting-sub').textContent = semName + ' • ' + (state.semester.startDate ? `Started ${fmtDate(state.semester.startDate)}` : 'Set a start date in Settings');
  $('#brand-name').textContent = state.semester.name ? state.semester.name.split('—')[0].trim().slice(0,18) : 'Semester Hub';
  $('#brand-sub').textContent = state.semester.userName ? state.semester.userName : 'Your studio';
  $('#week-current').textContent = currentWeek();
  $('#week-total').textContent = state.semester.totalWeeks;
  $('#week-bar').style.width = (currentWeek() / state.semester.totalWeeks * 100) + '%';
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night';
}

/* --- Dashboard -------------------------------------------- */
function renderDashboard() {
  $('#welcome-card').classList.toggle('hidden', state.courses.length > 0 || state.hasOpened);

  $('#stat-courses').textContent = state.courses.length;
  $('#stat-courses-sub').textContent = state.courses.length === 0 ? 'Add your first one' :
    (state.courses.reduce((s,c) => s + (c.credits || 0), 0) + ' credits total');

  const cw = currentWeek();
  const dueThisWeek = allAssignments().filter(a => weekOfDate(a.due) === cw && !a.done);
  $('#stat-due').textContent = dueThisWeek.length;

  const hoursWeek = state.timeLogs
    .filter(l => weekOfDate(l.date) === cw)
    .reduce((s,l) => s + Number(l.hours||0), 0);
  $('#stat-hours').textContent = hoursWeek.toFixed(1);

  const gpa = computeGPA();
  $('#stat-gpa').textContent = gpa.value === null ? '—' : gpa.value.toFixed(2);

  const upcoming = allAssignments()
    .filter(a => !a.done && a.due)
    .sort((a,b) => new Date(a.due) - new Date(b.due))
    .slice(0, 6);
  const ul = $('#upcoming-list');
  ul.innerHTML = '';
  if (upcoming.length === 0) {
    ul.appendChild(el('div', { class: 'empty', html: '<strong>Nothing on the horizon.</strong>Add assignments to your courses and they\'ll surface here. <div class="hint">Press <b>A</b> to quick-add an assignment.</div>' }));
  } else {
    const list = el('div', { class: 'compact-list' });
    upcoming.forEach(a => {
      const c = state.courses.find(c => c.id === a.courseId);
      const st = statusFor(a);
      list.appendChild(el('div', { class: 'compact-item' },
        el('div', { class: 'swatch-mini', style: 'background: ' + (c?.color || 'var(--muted)') }),
        el('div', { class: 'grow' },
          el('div', {}, a.name),
          el('div', { class: 'meta' }, (c?.code || c?.name || 'Course') + ' • ' + fmtDate(a.due))
        ),
        el('span', { class: 'tag ' + st.class }, st.label)
      ));
    });
    ul.appendChild(list);
  }

  const fl = $('#focus-list');
  fl.innerHTML = '';
  const today = state.focus.filter(f => f.date === todayStr());
  if (today.length === 0) {
    fl.appendChild(el('div', { class: 'empty', html: '<strong>What deserves your attention today?</strong>Add 1–3 things you want to actually move forward.' }));
  } else {
    const list = el('div', { class: 'compact-list' });
    today.forEach(f => {
      list.appendChild(el('div', { class: 'compact-item' },
        el('div', { class: 'check-cell ' + (f.done ? 'checked' : ''), html: '✓', onclick: () => { f.done = !f.done; save(); render(); } }),
        el('div', { class: 'grow', style: f.done ? 'text-decoration: line-through; color: var(--muted);' : '' }, f.text),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.focus = state.focus.filter(x => x.id !== f.id); save(); render(); } }, '×')
      ));
    });
    fl.appendChild(list);
  }

  renderHeatmap('#mini-heatmap', true);

  const pl = $('#progress-list');
  pl.innerHTML = '';
  if (state.courses.length === 0) {
    pl.appendChild(el('div', { class: 'empty', html: '<strong>No courses yet.</strong>Add a course to see progress here.' }));
  } else {
    state.courses.forEach(c => {
      const pct = coursePct(c);
      pl.appendChild(el('div', { style: 'margin-bottom: 12px;' },
        el('div', { style: 'display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;' },
          el('span', {}, c.name || c.code || 'Untitled course'),
          el('span', { style: 'color: var(--muted);' }, pct + '%')
        ),
        el('div', { class: 'progress', style: 'height: 6px; background: var(--line); border-radius: 99px; overflow: hidden;' },
          el('div', { style: `width: ${pct}%; height:100%; background: ${c.color}; transition: width .3s;` })
        )
      ));
    });
  }
}

/* --- Heatmap ---------------------------------------------- */
function renderHeatmap(selector, mini = false) {
  const wrap = $(selector);
  wrap.innerHTML = '';
  const weeks = state.semester.totalWeeks;
  const byWeek = {};
  allAssignments().forEach(a => { const w = weekOfDate(a.due); if (w) byWeek[w] = (byWeek[w]||0) + 1; });
  for (let w = 1; w <= weeks; w++) {
    const cnt = byWeek[w] || 0;
    let lvl = '';
    if (cnt >= 4) lvl = 'lvl-4';
    else if (cnt === 3) lvl = 'lvl-3';
    else if (cnt === 2) lvl = 'lvl-2';
    else if (cnt === 1) lvl = 'lvl-1';
    const cell = el('div', {
      class: 'heatmap-cell ' + lvl + (w === currentWeek() ? ' current' : ''),
      title: `Week ${w}: ${cnt} deadline${cnt===1?'':'s'} • ${weekDateRange(w)}`,
      onclick: () => { openWeek = w; setView('week-detail'); }
    }, mini ? String(w) : (cnt > 0 ? String(cnt) : String(w)));
    wrap.appendChild(cell);
  }
}

/* --- Courses ---------------------------------------------- */
function renderCourses() {
  const grid = $('#courses-grid');
  grid.innerHTML = '';
  if (state.courses.length === 0) {
    grid.appendChild(el('div', {
      class: 'empty',
      style: 'grid-column: 1 / -1; padding: 50px 24px;',
      html: '<strong style="font-size:16px;">No courses yet.</strong>Add your first one to get going — name it whatever feels right.<div class="hint">Tip: every course gets its own color and tracker.</div>'
    }));
    const btn = el('button', { class: 'btn btn-primary', style: 'margin-top:14px;', onclick: () => openModal('course') }, '+ Add first course');
    grid.lastChild.appendChild(btn);
    return;
  }
  state.courses.forEach(c => {
    const pct = coursePct(c);
    const grade = computeCourseGrade(c);
    const upcoming = (c.assignments || []).filter(a => !a.done && a.due).length;
    grid.appendChild(el('div', { class: 'course-card', onclick: () => { openCourseId = c.id; setView('course-detail'); } },
      el('div', { class: 'swatch', style: 'background: ' + c.color }),
      el('div', { class: 'code' }, c.code || ''),
      el('div', { class: 'name' }, c.name || 'Untitled course'),
      el('div', { class: 'meta' }, (c.instructor || 'No instructor') + ' • ' + (c.credits || 0) + ' cr'),
      el('div', { style: 'display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 4px;' },
        grade.letter ? el('span', { class: 'tag info' }, grade.letter + ' • ' + grade.percent.toFixed(0) + '%') : el('span', { class: 'tag' }, 'No grades yet'),
        upcoming ? el('span', { class: 'tag warn' }, upcoming + ' open') : null,
        (c.assignments||[]).length ? el('span', { class: 'tag' }, (c.assignments||[]).length + ' total') : null
      ),
      el('div', { class: 'progress' }, el('div', { style: `width: ${pct}%; background: ${c.color};` })),
      el('div', { class: 'stats' },
        el('span', {}, 'Progress ', el('b', {}, pct + '%')),
        el('span', {}, (c.readings||[]).length + ' readings')
      )
    ));
  });
  grid.appendChild(el('div', {
    class: 'course-card',
    style: 'display:grid; place-items:center; cursor:pointer; border-style:dashed; background:transparent; box-shadow:none;',
    onclick: () => openModal('course')
  },
    el('div', { style: 'text-align:center; color: var(--muted);' },
      el('div', { style: 'font-size:30px; line-height:1; margin-bottom:6px;' }, '+'),
      el('div', { style: 'font-size: 13px; font-weight:600;' }, 'Add course')
    )
  ));
}

function renderCourseDetail() {
  const c = state.courses.find(c => c.id === openCourseId);
  if (!c) { setView('courses'); return; }
  const body = $('#course-detail-body');
  body.innerHTML = '';
  const grade = computeCourseGrade(c);
  body.appendChild(el('div', { class: 'course-detail-head' },
    el('div', { class: 'course-color-square', style: 'background: ' + c.color }, (c.code || c.name || '?').slice(0,2).toUpperCase()),
    el('div', { style: 'flex:1;' },
      el('div', { style: 'font-size: 12px; color: var(--muted); font-weight: 600; letter-spacing: .05em;' }, (c.code || '') + (c.credits ? ' • ' + c.credits + ' credits' : '')),
      el('h1', { style: 'margin: 2px 0; font-size: 22px;' }, c.name || 'Untitled course'),
      el('div', { style: 'color: var(--muted); font-size: 13px;' }, c.instructor || 'No instructor')
    ),
    el('div', { style: 'text-align:right;' },
      el('div', { style: 'font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em;' }, 'Current grade'),
      el('div', { style: 'font-size: 24px; font-weight: 700;' }, grade.letter ? grade.letter : '—'),
      el('div', { style: 'font-size: 12px; color: var(--muted);' }, grade.letter ? grade.percent.toFixed(1) + '% earned' : 'Add scores to see')
    ),
    el('div', { style: 'display:flex; gap:6px;' },
      el('button', { class: 'btn', onclick: () => editCourse(c.id) }, 'Edit'),
      el('button', { class: 'btn', style: 'color: var(--danger);', onclick: () => deleteCourse(c.id) }, 'Delete')
    )
  ));

  const tabs = el('div', { class: 'pill-tabs' });
  ['assignments','readings','notes','grade'].forEach(t => {
    const lbl = { assignments:'Assignments', readings:'Readings', notes:'Notes', grade:'Grade detail' }[t];
    tabs.appendChild(el('div', {
      class: 'pill-tab' + (courseTab === t ? ' active' : ''),
      onclick: () => { courseTab = t; renderCourseDetail(); }
    }, lbl));
  });
  body.appendChild(tabs);

  if (courseTab === 'assignments') renderAssignmentsTab(body, c);
  else if (courseTab === 'readings') renderReadingsTab(body, c);
  else if (courseTab === 'notes') renderNotesTab(body, c);
  else if (courseTab === 'grade') renderGradeTab(body, c);
}

function renderAssignmentsTab(body, c) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Assignments', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('assignment', { courseId: c.id }) }, '+ Assignment')
  )));
  if (!c.assignments || c.assignments.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>No assignments yet.</strong>Add the syllabus items here — papers, quizzes, projects. <div class="hint">Include weights and you\'ll get an automatic grade calculation.</div>' }));
  } else {
    const wrap = el('div', { class: 'tbl-wrap' });
    const t = el('table');
    t.appendChild(el('thead', {}, el('tr', {},
      el('th', { style: 'width:30px;' }, ''), el('th', {}, 'Name'), el('th', { style:'width:90px;' }, 'Due'),
      el('th', { style:'width:70px;' }, 'Weight %'), el('th', { style:'width:90px;' }, 'Score / Max'), el('th', { style:'width:80px;' }, 'Status'), el('th', { style:'width:30px;' }, '')
    )));
    const tb = el('tbody');
    c.assignments.slice().sort((a,b) => (new Date(a.due||'9999') - new Date(b.due||'9999'))).forEach(a => {
      const st = statusFor(a);
      const typeClass = a.type === 'Group work' ? 'type-group' : a.type === 'Project' ? 'type-project' : a.type === 'Other' ? 'type-other' : 'type-individual';
      const nameCell = el('div', {},
        el('div', { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' },
          inlineEdit(a.name, v => updateAssignment(c.id, a.id, { name: v })),
          a.type ? el('span', { class: 'tag ' + typeClass, style: 'flex: none;' }, a.type) : null
        ),
        a.description ? el('div', { class: 'asg-desc', title: a.description }, a.description.length > 80 ? a.description.slice(0, 80) + '…' : a.description) : null
      );
      tb.appendChild(el('tr', {},
        el('td', {}, el('div', { class: 'check-cell ' + (a.done ? 'checked' : ''), html: '✓', onclick: () => toggleAssignment(c.id, a.id) })),
        el('td', {}, nameCell),
        el('td', {}, inlineDate(a.due, v => updateAssignment(c.id, a.id, { due: v }))),
        el('td', {}, inlineNumber(a.weight, v => updateAssignment(c.id, a.id, { weight: v }), '0')),
        el('td', {},
          el('div', { style: 'display:flex; gap:4px; align-items:center;' },
            inlineNumber(a.score, v => updateAssignment(c.id, a.id, { score: v }), '–'),
            el('span', { style: 'color: var(--muted);' }, '/'),
            inlineNumber(a.max ?? 100, v => updateAssignment(c.id, a.id, { max: v }), '100')
          )
        ),
        el('td', {}, el('span', { class: 'tag ' + st.class }, st.label)),
        el('td', {},
          el('div', { style: 'display:flex; gap:4px;' },
            el('button', { class: 'btn btn-ghost btn-icon', title: 'Edit details', onclick: () => editAssignment(c.id, a.id) }, '✎'),
            el('button', { class: 'btn btn-ghost btn-icon', onclick: () => deleteAssignment(c.id, a.id) }, '×')
          )
        )
      ));
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    panel.appendChild(wrap);
  }
  body.appendChild(panel);
}

function renderReadingsTab(body, c) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Readings & resources', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('reading', { courseId: c.id }) }, '+ Reading')
  )));
  if (!c.readings || c.readings.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Build your reading list.</strong>Articles, chapters, further-reading — anything you want to come back to.' }));
  } else {
    const list = el('div', { class: 'compact-list' });
    c.readings.slice().sort((a,b) => (a.week||999) - (b.week||999) || (new Date(a.date||'9999') - new Date(b.date||'9999'))).forEach(r => {
      const typeClass = r.type === 'Book' ? 'type-book'
        : r.type === 'Further search & understanding' ? 'type-further'
        : r.type === 'Other' ? 'type-other'
        : 'type-article';
      const week = r.week || (r.date ? weekOfDate(r.date) : null);
      const noteText = (r.note || '').replace(/<[^>]+>/g, ' ').trim();
      list.appendChild(el('div', { class: 'compact-item' },
        el('div', { class: 'check-cell ' + (r.done ? 'checked' : ''), html: '✓', onclick: () => { r.done = !r.done; save(); renderCourseDetail(); } }),
        el('div', { class: 'grow' },
          el('div', { style: 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;' },
            el('span', { style: r.done ? 'text-decoration: line-through; color: var(--muted);' : 'font-weight: 500;' },
              r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title) : r.title
            ),
            r.type ? el('span', { class: 'tag ' + typeClass, style: 'flex:none;' }, r.type === 'Further search & understanding' ? 'Further' : r.type) : null
          ),
          noteText ? el('div', { class: 'meta', style: 'margin-top:3px;' }, noteText.length > 100 ? noteText.slice(0, 100) + '…' : noteText) : null
        ),
        week ? el('span', { class: 'tag', style: 'flex:none;' }, 'Wk ' + week) : null,
        r.date ? el('span', { class: 'tag', style: 'flex:none; color: var(--muted);' }, fmtDate(r.date)) : null,
        el('button', { class: 'btn btn-ghost btn-icon', title: 'Edit', onclick: () => openModal('reading', { courseId: c.id, editId: r.id }) }, '✎'),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { c.readings = c.readings.filter(x => x.id !== r.id); save(); renderCourseDetail(); } }, '×')
      ));
    });
    panel.appendChild(list);
  }
  body.appendChild(panel);
}

function renderNotesTab(body, c) {
  c.notesEntries = c.notesEntries || [];
  if (typeof c.notes === 'string' && c.notes.trim() && c.notesEntries.length === 0) {
    const html = c.notes.split('\n').map(line => '<p>' + line.replace(/</g, '&lt;') + '</p>').join('');
    c.notesEntries.push({
      id: uid(),
      date: todayStr(),
      week: currentWeek(),
      content: html,
      createdAt: Date.now()
    });
    c.notes = '';
    save();
  }

  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Course notes',
    el('span', { class: 'actions' },
      el('span', { style: 'font-size: 11px; color: var(--muted); margin-right: 8px;' },
        c.notesEntries.length + ' entr' + (c.notesEntries.length === 1 ? 'y' : 'ies')),
      el('button', { class: 'btn btn-sm', id: 'sort-notes-toggle' }, sortNotesDesc ? '↓ Newest' : '↑ Oldest'),
      el('button', { class: 'btn btn-sm btn-primary', onclick: () => addNewNote(c) }, '+ New note')
    )
  ));

  if (c.notesEntries.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Start your course journal.</strong>Add a new note for each lecture, idea, or question. Every entry gets a date and a week, and supports rich text. <div class="hint">Click <b>+ New note</b> to begin.</div>' }));
    body.appendChild(panel);
    return;
  }

  const sorted = c.notesEntries.slice().sort((a, b) => {
    const ad = new Date(a.date || a.createdAt || 0);
    const bd = new Date(b.date || b.createdAt || 0);
    return sortNotesDesc ? bd - ad : ad - bd;
  });
  sorted.forEach(n => {
    const card = el('div', { class: 'note-card' });
    const dateInput = el('input', { type: 'date', value: n.date || '' });
    const weekSel = el('select');
    for (let i = 1; i <= state.semester.totalWeeks; i++) {
      weekSel.appendChild(el('option', { value: String(i), ...(i === n.week ? { selected: 'selected' } : {}) }, 'Week ' + i));
    }
    weekSel.value = String(n.week || currentWeek());
    dateInput.addEventListener('change', () => {
      n.date = dateInput.value;
      const w = weekOfDate(n.date);
      if (w && !n.weekManual) { n.week = w; weekSel.value = String(w); }
      save();
    });
    weekSel.addEventListener('change', () => { n.week = Number(weekSel.value); n.weekManual = true; save(); });
    card.appendChild(el('div', { class: 'note-head' },
      el('div', { class: 'note-meta-inputs' },
        el('span', { style: 'color: var(--muted); font-size: 11px;' }, 'Date'),
        dateInput,
        el('span', { style: 'color: var(--muted); font-size: 11px;' }, 'Week'),
        weekSel
      ),
      el('div', { class: 'grow' }),
      el('span', { class: 'note-date' }, n.date ? fmtDate(n.date) : '(no date)'),
      el('button', { class: 'btn btn-ghost btn-icon', title: 'Delete', onclick: () => {
        if (!confirm('Delete this note?')) return;
        c.notesEntries = c.notesEntries.filter(x => x.id !== n.id);
        save(); renderCourseDetail();
      }}, '×')
    ));
    const ed = richEditor(n.content || '', (html) => { n.content = html; save(); }, 'Lecture notes, key ideas, questions to ask…');
    card.appendChild(ed);
    panel.appendChild(card);
  });

  body.appendChild(panel);

  setTimeout(() => {
    const t = $('#sort-notes-toggle');
    if (t) t.addEventListener('click', () => { sortNotesDesc = !sortNotesDesc; renderCourseDetail(); });
  }, 10);
}

function addNewNote(c) {
  c.notesEntries = c.notesEntries || [];
  c.notesEntries.unshift({
    id: uid(),
    date: todayStr(),
    week: currentWeek(),
    content: '',
    createdAt: Date.now()
  });
  save(); renderCourseDetail();
  setTimeout(() => {
    const eds = document.querySelectorAll('.rte-editor');
    if (eds.length) (sortNotesDesc ? eds[0] : eds[eds.length-1]).focus();
  }, 50);
}

function renderGradeTab(body, c) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Grade breakdown'));
  const g = computeCourseGrade(c);
  if (!g.letter) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Nothing graded yet.</strong>Add weights and scores on the Assignments tab to see your projection here.' }));
  } else {
    panel.appendChild(el('div', { class: 'gpa-display' },
      el('div', { class: 'gpa-number' }, g.letter),
      el('div', { class: 'gpa-label' }, `${g.percent.toFixed(1)}% earned on ${g.weightSum.toFixed(0)}% of total weight`)
    ));
    const items = (c.assignments || []).filter(a => a.weight != null && a.score != null && a.score !== '');
    const list = el('div', { style: 'margin-top: 16px;' });
    items.forEach(a => {
      const w = Number(a.weight); const s = Number(a.score); const m = Number(a.max||100);
      const earned = (s/m) * w;
      list.appendChild(el('div', { style: 'display:grid; grid-template-columns: 1fr 60px 80px 120px; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px;' },
        el('span', {}, a.name),
        el('span', { style: 'color: var(--muted);' }, w + '%'),
        el('span', {}, s + '/' + m),
        el('span', { style: 'text-align:right; font-weight:600;' }, earned.toFixed(1) + ' pts')
      ));
    });
    panel.appendChild(list);
    const rest = 100 - g.weightSum;
    if (rest > 0) {
      panel.appendChild(el('div', { style: 'margin-top: 16px; padding: 14px; background: var(--panel-2); border-radius: 10px; font-size: 13px;' },
        el('strong', {}, 'What-if: '), `You have ${rest.toFixed(0)}% of weight remaining. To earn an A overall, you'd need about ${(((90 - g.earned) / rest) * 100).toFixed(0)}% on the rest.`
      ));
    }
  }
  body.appendChild(panel);
}

/* --- Mutation helpers ------------------------------------- */
function toggleAssignment(courseId, aId) {
  const c = state.courses.find(c => c.id === courseId);
  const a = c.assignments.find(a => a.id === aId);
  a.done = !a.done;
  save(); render();
}
function updateAssignment(courseId, aId, patch) {
  const c = state.courses.find(c => c.id === courseId);
  const a = c.assignments.find(a => a.id === aId);
  Object.assign(a, patch);
  save();
}
function deleteAssignment(courseId, aId) {
  if (!confirm('Delete this assignment?')) return;
  const c = state.courses.find(c => c.id === courseId);
  c.assignments = c.assignments.filter(a => a.id !== aId);
  save(); render();
}
function editAssignment(courseId, aId) {
  openModal('assignment', { courseId, editId: aId });
}
function deleteCourse(id) {
  if (!confirm('Delete this entire course? This cannot be undone.')) return;
  state.courses = state.courses.filter(c => c.id !== id);
  save(); setView('courses');
}
function editCourse(id) {
  openModal('course', { editId: id });
}

/* --- Weekly planner --------------------------------------- */
function renderWeekly() {
  const grid = $('#weeks-grid');
  grid.innerHTML = '';
  for (let w = 1; w <= state.semester.totalWeeks; w++) {
    const data = state.weekly[w] || { tasks: [], notes: '' };
    const isCurrent = w === currentWeek();
    const isPast = w < currentWeek();
    const dueCount = allAssignments().filter(a => weekOfDate(a.due) === w && !a.done).length;
    const doneCount = (data.tasks || []).filter(t => t.done).length;
    const totalTasks = (data.tasks || []).length;
    grid.appendChild(el('div', {
      class: 'week-card' + (isCurrent ? ' current' : '') + (isPast ? ' past' : ''),
      onclick: () => { openWeek = w; setView('week-detail'); }
    },
      el('div', { class: 'wk-head' },
        el('div', { class: 'wk-num' }, String(w)),
        el('div', { class: 'wk-date' }, weekDateRange(w))
      ),
      el('div', { class: 'wk-summary' }, (data.notes || '').slice(0, 80) || (totalTasks ? `${totalTasks} task${totalTasks===1?'':'s'} planned` : 'Click to plan')),
      el('div', { class: 'wk-counts' },
        dueCount ? el('span', { class: 'tag warn' }, dueCount + ' due') : null,
        totalTasks ? el('span', { class: 'tag' }, doneCount + '/' + totalTasks) : null,
        isCurrent ? el('span', { class: 'tag info' }, 'now') : null
      )
    ));
  }
}

function renderWeekDetail() {
  const w = openWeek;
  const body = $('#week-detail-body');
  body.innerHTML = '';
  if (!state.weekly[w]) state.weekly[w] = { tasks: [], notes: '' };
  const data = state.weekly[w];
  const isCurrent = w === currentWeek();
  body.appendChild(el('div', { style: 'display: flex; align-items: center; gap: 16px; margin-bottom: 18px;' },
    el('div', { class: 'course-color-square', style: 'background: ' + (isCurrent ? 'var(--primary)' : 'var(--ink-soft)') }, String(w)),
    el('div', {},
      el('h1', { style: 'margin:0;' }, 'Week ' + w),
      el('div', { style: 'color: var(--muted); font-size: 13px;' }, weekDateRange(w) || 'Set a semester start date in Settings')
    ),
    isCurrent ? el('span', { class: 'tag info', style: 'margin-left:auto;' }, 'This week') : null
  ));

  const dueAsg = allAssignments().filter(a => weekOfDate(a.due) === w);
  const dpanel = el('div', { class: 'panel', style: 'margin-bottom: 16px;' });
  dpanel.appendChild(el('h2', {}, 'Assignments due this week'));
  if (dueAsg.length === 0) {
    dpanel.appendChild(el('div', { class: 'empty', html: '<strong>No assignments due.</strong>A breath. Or a chance to get ahead.' }));
  } else {
    const list = el('div', { class: 'compact-list' });
    dueAsg.forEach(a => {
      const c = state.courses.find(c => c.id === a.courseId);
      list.appendChild(el('div', { class: 'compact-item' },
        el('div', { class: 'swatch-mini', style: 'background: ' + (c?.color || 'var(--muted)') }),
        el('div', { class: 'check-cell ' + (a.done ? 'checked' : ''), html: '✓', onclick: () => toggleAssignment(c.id, a.id) }),
        el('div', { class: 'grow' },
          el('div', { style: a.done ? 'text-decoration: line-through; color: var(--muted);' : '' }, a.name),
          el('div', { class: 'meta' }, (c?.name || 'Course') + ' • ' + fmtDate(a.due))
        )
      ));
    });
    dpanel.appendChild(list);
  }
  body.appendChild(dpanel);

  const tpanel = el('div', { class: 'panel', style: 'margin-bottom: 16px;' });
  tpanel.appendChild(el('h2', {}, 'Week plan',
    el('span', { class: 'actions' },
      el('input', { id: 'wk-task-input', placeholder: 'Add a task and hit Enter...', style: 'background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 7px 12px; font-size: 13px; width: 260px;' })
    )
  ));
  if (data.tasks.length === 0) {
    tpanel.appendChild(el('div', { class: 'empty', html: '<strong>An empty week.</strong>What do you want to make happen?' }));
  } else {
    const list = el('div', { class: 'compact-list' });
    data.tasks.forEach(t => {
      list.appendChild(el('div', { class: 'compact-item' },
        el('div', { class: 'check-cell ' + (t.done ? 'checked' : ''), html: '✓', onclick: () => { t.done = !t.done; save(); renderWeekDetail(); } }),
        el('div', { class: 'grow', style: t.done ? 'text-decoration: line-through; color: var(--muted);' : '' }, t.text),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { data.tasks = data.tasks.filter(x => x.id !== t.id); save(); renderWeekDetail(); } }, '×')
      ));
    });
    tpanel.appendChild(list);
  }
  body.appendChild(tpanel);

  const npanel = el('div', { class: 'panel' });
  npanel.appendChild(el('h2', {}, 'Notes & reflection'));
  const ta = el('textarea', {
    style: 'width:100%; min-height: 160px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px; font-size: 14px;',
    placeholder: "What went well? What's heavy? What do you want different next week?"
  });
  ta.value = data.notes || '';
  ta.addEventListener('input', () => { data.notes = ta.value; save(); });
  npanel.appendChild(ta);
  body.appendChild(npanel);

  setTimeout(() => {
    const inp = $('#wk-task-input');
    if (inp) inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inp.value.trim()) {
        data.tasks.push({ id: uid(), text: inp.value.trim(), done: false });
        inp.value = ''; save(); renderWeekDetail();
      }
    });
  }, 10);
}

/* --- Professional ----------------------------------------- */
function renderProfessional() {
  const wrap = $('#pro-content');
  wrap.innerHTML = '';
  if (proTab === 'apps') renderApps(wrap);
  else if (proTab === 'contacts') renderContacts(wrap);
  else if (proTab === 'skills') renderSkills(wrap);
  else if (proTab === 'projects') renderProjects(wrap);
}

function renderApps(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Applications', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('app') }, '+ Application')
  )));
  const apps = state.professional.applications;
  if (apps.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>No applications yet.</strong>Add internships, jobs, fellowships — anything you\'ve applied to or want to.' }));
  } else {
    const t = el('table');
    t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Role'), el('th', {}, 'Company'), el('th', {}, 'Status'), el('th', {}, 'Applied'), el('th', {}, 'Next step'), el('th', {}, ''))));
    const tb = el('tbody');
    apps.forEach(a => {
      tb.appendChild(el('tr', {},
        el('td', {}, inlineEdit(a.role, v => { a.role = v; save(); })),
        el('td', {}, inlineEdit(a.company, v => { a.company = v; save(); })),
        el('td', {}, statusSelect(a.status, ['Interested','Applied','Interview','Offer','Rejected','Withdrew'], v => { a.status = v; save(); renderProfessional(); })),
        el('td', {}, inlineDate(a.date, v => { a.date = v; save(); })),
        el('td', {}, inlineEdit(a.next, v => { a.next = v; save(); })),
        el('td', {}, el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.professional.applications = apps.filter(x => x.id !== a.id); save(); renderProfessional(); } }, '×'))
      ));
    });
    t.appendChild(tb);
    panel.appendChild(el('div', { class: 'tbl-wrap' }, t));
    const counts = {};
    apps.forEach(a => { counts[a.status||'Applied'] = (counts[a.status||'Applied']||0) + 1; });
    const summary = el('div', { style: 'display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;' });
    Object.entries(counts).forEach(([k,v]) => summary.appendChild(el('span', { class: 'tag' }, k + ': ' + v)));
    panel.appendChild(summary);
  }
  wrap.appendChild(panel);
}

function statusSelect(value, opts, onChange) {
  const s = el('select', { class: 'inline-input', style: 'border:1px solid transparent;' });
  opts.forEach(o => s.appendChild(el('option', { value: o, ...(o === value ? { selected: 'selected' } : {}) }, o)));
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function renderContacts(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Networking contacts', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('contact') }, '+ Contact')
  )));
  const arr = state.professional.contacts;
  if (arr.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Build your network.</strong>People you\'ve met, want to meet, or want to follow up with. <div class="hint">Small follow-ups compound.</div>' }));
  } else {
    const t = el('table');
    t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Role / Company'), el('th', {}, 'Context'), el('th', {}, 'Last touch'), el('th', {}, 'Follow up'), el('th', {}, ''))));
    const tb = el('tbody');
    arr.forEach(c => {
      tb.appendChild(el('tr', {},
        el('td', {}, inlineEdit(c.name, v => { c.name = v; save(); })),
        el('td', {}, inlineEdit(c.role, v => { c.role = v; save(); })),
        el('td', {}, inlineEdit(c.context, v => { c.context = v; save(); })),
        el('td', {}, inlineDate(c.last, v => { c.last = v; save(); })),
        el('td', {}, inlineDate(c.next, v => { c.next = v; save(); })),
        el('td', {}, el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.professional.contacts = arr.filter(x => x.id !== c.id); save(); renderProfessional(); } }, '×'))
      ));
    });
    t.appendChild(tb);
    panel.appendChild(el('div', { class: 'tbl-wrap' }, t));
  }
  wrap.appendChild(panel);
}

function renderSkills(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Skills & certifications', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('skill') }, '+ Skill')
  )));
  const arr = state.professional.skills;
  if (arr.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>What are you building?</strong>Track skills, courses, or certifications you\'re working toward — and how far along you are.' }));
  } else {
    arr.forEach(s => {
      panel.appendChild(el('div', { style: 'margin-bottom: 14px;' },
        el('div', { style: 'display:flex; align-items:center; gap:10px; margin-bottom:6px;' },
          el('strong', { style: 'flex:1;' }, s.name),
          el('span', { class: 'tag' }, (s.level||0) + '%'),
          el('input', { type: 'range', min: 0, max: 100, value: s.level||0, style: 'width:140px;', oninput: (e) => { s.level = Number(e.target.value); save(); renderSkills(wrap); } }),
          el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.professional.skills = arr.filter(x => x.id !== s.id); save(); renderProfessional(); } }, '×')
        ),
        el('div', { style: 'height: 6px; background: var(--line); border-radius: 99px; overflow:hidden;' },
          el('div', { style: `width: ${s.level||0}%; height:100%; background: linear-gradient(90deg, var(--primary), var(--accent)); transition: width .3s;` })
        ),
        s.note ? el('div', { style: 'font-size:12px; color: var(--muted); margin-top: 4px;' }, s.note) : null
      ));
    });
  }
  wrap.appendChild(panel);
}

function renderProjects(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Portfolio projects', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('project') }, '+ Project')
  )));
  const arr = state.professional.projects;
  if (arr.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Your work.</strong>Side projects, case studies, anything you can point at when someone asks "what have you built?"' }));
  } else {
    const g = el('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));' });
    arr.forEach(p => {
      g.appendChild(el('div', { class: 'panel', style: 'background: var(--panel-2);' },
        el('div', { style: 'display:flex; justify-content:space-between; align-items:start;' },
          el('div', { style: 'flex:1;' },
            el('strong', {}, p.name),
            el('div', { style: 'font-size:12px; color: var(--muted); margin: 4px 0;' }, p.status || 'In progress'),
            el('div', { style: 'font-size:13px; margin-top: 6px;' }, p.desc || '')
          ),
          el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.professional.projects = arr.filter(x => x.id !== p.id); save(); renderProfessional(); } }, '×')
        ),
        p.url ? el('div', { style: 'margin-top: 8px;' }, el('a', { href: p.url, target: '_blank' }, p.url)) : null
      ));
    });
    panel.appendChild(g);
  }
  wrap.appendChild(panel);
}

/* --- Personal --------------------------------------------- */
function renderPersonal() {
  const wrap = $('#pers-content');
  wrap.innerHTML = '';
  if (persTab === 'habits') renderHabits(wrap);
  else if (persTab === 'budget') renderBudget(wrap);
  else if (persTab === 'goals') renderGoals(wrap);
  else if (persTab === 'wellness') renderWellness(wrap);
}

function renderHabits(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Daily habits — this week', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('habit') }, '+ Habit')
  )));
  if (state.personal.habits.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Tiny habits, big shifts.</strong>Track 2–5 daily habits that anchor your week.' }));
  } else {
    const days = thisWeekDays();
    const head = el('div', { class: 'habit-grid' });
    head.appendChild(el('div', { class: 'hd', style: 'text-align:left;' }, 'Habit'));
    days.forEach(d => head.appendChild(el('div', { class: 'hd' }, d.label)));
    panel.appendChild(head);
    state.personal.habits.forEach(h => {
      const row = el('div', { class: 'habit-grid', style: 'margin-top: 6px;' });
      row.appendChild(el('div', { class: 'habit-name' },
        h.name,
        el('button', { class: 'btn btn-ghost btn-icon', style: 'margin-left: 6px; color: var(--muted);', onclick: () => { if(confirm('Delete this habit?')) { state.personal.habits = state.personal.habits.filter(x => x.id !== h.id); save(); renderPersonal(); } } }, '×')
      ));
      days.forEach(d => {
        const checked = (h.checks || {})[d.iso];
        row.appendChild(el('div', { class: 'habit-check ' + (checked ? 'done' : ''), html: checked ? '✓' : '', onclick: () => {
          h.checks = h.checks || {};
          if (h.checks[d.iso]) delete h.checks[d.iso]; else h.checks[d.iso] = true;
          save(); renderHabits(wrap);
        }}));
      });
      panel.appendChild(row);
    });
  }
  wrap.appendChild(panel);
}

function thisWeekDays() {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({ iso: d.toISOString().slice(0,10), label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + d.getDate() });
  }
  return out;
}

function renderBudget(wrap) {
  const b = state.personal.budget;
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Budget', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('budget-cat') }, '+ Category')
  )));
  panel.appendChild(el('div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;' },
    el('div', {},
      el('label', { style: 'font-size: 12px; color: var(--muted); font-weight:600;' }, 'Monthly income'),
      el('input', { type: 'number', value: b.income || '', class: 'inline-input', style: 'background:var(--panel-2); border:1px solid var(--line); padding: 8px 12px;', placeholder: '0', oninput: (e) => { b.income = Number(e.target.value); save(); renderBudget(wrap); } })
    ),
    el('div', {},
      el('label', { style: 'font-size: 12px; color: var(--muted); font-weight:600;' }, 'Total budgeted'),
      el('div', { style: 'padding: 8px 12px; font-size: 18px; font-weight: 700;' }, (b.categories || []).reduce((s,c) => s + (Number(c.budget)||0), 0).toLocaleString())
    )
  ));
  if (!b.categories || b.categories.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>Add categories.</strong>Rent, food, transport, fun money. Set a budget for each.' }));
  } else {
    const bars = el('div', { class: 'budget-bars' });
    b.categories.forEach(c => {
      const pct = c.budget ? Math.min(100, (c.spent||0) / c.budget * 100) : 0;
      const over = (c.spent||0) > c.budget;
      bars.appendChild(el('div', { class: 'budget-row' },
        el('strong', {}, c.name),
        el('input', { type: 'number', value: c.budget || '', placeholder: 'budget', class: 'inline-input', style: 'background:var(--panel-2); border:1px solid var(--line);', oninput: (e) => { c.budget = Number(e.target.value); save(); renderBudget(wrap); } }),
        el('input', { type: 'number', value: c.spent || '', placeholder: 'spent', class: 'inline-input', style: 'background:var(--panel-2); border:1px solid var(--line);', oninput: (e) => { c.spent = Number(e.target.value); save(); renderBudget(wrap); } }),
        el('div', {},
          el('div', { class: 'budget-bar' }, el('div', { style: `width:${pct}%; background: ${over ? 'var(--danger)' : 'var(--primary)'};` })),
          el('div', { style: 'font-size:11px; color: var(--muted); margin-top: 3px;' }, (c.spent||0) + ' / ' + (c.budget||0) + (over ? ' • over' : ''))
        )
      ));
    });
    panel.appendChild(bars);
  }
  wrap.appendChild(panel);
}

function renderGoals(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Goals', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('goal') }, '+ Goal')
  )));
  const arr = state.personal.goals;
  if (arr.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>What does success this semester look like?</strong>Write 3–5 goals. Big, small, weird — your call.' }));
  } else {
    arr.forEach(g => {
      panel.appendChild(el('div', { style: 'margin-bottom: 14px;' },
        el('div', { style: 'display:flex; align-items:center; gap:10px; margin-bottom:6px;' },
          el('div', { class: 'check-cell ' + (g.done ? 'checked' : ''), html: '✓', onclick: () => { g.done = !g.done; save(); renderGoals(wrap); } }),
          el('strong', { style: 'flex:1; text-decoration: ' + (g.done ? 'line-through' : 'none') + '; color: ' + (g.done ? 'var(--muted)' : 'inherit') + ';' }, g.text),
          el('span', { class: 'tag ' + (g.kind === 'professional' ? 'info' : '') }, g.kind || 'personal'),
          el('input', { type: 'range', min: 0, max: 100, value: g.progress||0, style: 'width:120px;', oninput: (e) => { g.progress = Number(e.target.value); save(); renderGoals(wrap); } }),
          el('span', { class: 'tag' }, (g.progress||0) + '%'),
          el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.personal.goals = arr.filter(x => x.id !== g.id); save(); renderPersonal(); } }, '×')
        ),
        el('div', { style: 'height: 5px; background: var(--line); border-radius: 99px; overflow: hidden;' },
          el('div', { style: `width: ${g.progress||0}%; height: 100%; background: ${g.kind === 'professional' ? 'var(--accent)' : 'var(--success)'};` })
        )
      ));
    });
  }
  wrap.appendChild(panel);
}

function renderWellness(wrap) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Wellness check-in', el('span', { class: 'actions' },
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => openModal('wellness') }, '+ Log today')
  )));
  const arr = state.personal.wellness.slice().reverse();
  if (arr.length === 0) {
    panel.appendChild(el('div', { class: 'empty', html: '<strong>How are you, really?</strong>Quick daily log: sleep hours, mood, exercise, anything on your mind.' }));
  } else {
    const t = el('table');
    t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Mood'), el('th', {}, 'Sleep'), el('th', {}, 'Exercise'), el('th', {}, 'Note'), el('th', {}, ''))));
    const tb = el('tbody');
    arr.forEach(w => {
      tb.appendChild(el('tr', {},
        el('td', {}, fmtDate(w.date)),
        el('td', {}, w.mood + ' /10'),
        el('td', {}, (w.sleep || 0) + 'h'),
        el('td', {}, w.exercise ? '✓' : '—'),
        el('td', { style: 'color: var(--ink-soft); font-size:12px;' }, (w.note || '').slice(0, 60)),
        el('td', {}, el('button', { class: 'btn btn-ghost btn-icon', onclick: () => { state.personal.wellness = state.personal.wellness.filter(x => x.id !== w.id); save(); renderPersonal(); } }, '×'))
      ));
    });
    t.appendChild(tb);
    panel.appendChild(el('div', { class: 'tbl-wrap' }, t));
    if (arr.length > 1) {
      panel.appendChild(el('div', { style: 'margin-top:14px;' },
        el('div', { style: 'font-size: 12px; color: var(--muted); margin-bottom: 6px;' }, 'Mood trend'),
        renderMoodSpark(state.personal.wellness)
      ));
    }
  }
  wrap.appendChild(panel);
}

function renderMoodSpark(data) {
  const arr = data.slice(-14);
  const w = arr.length * 28;
  const h = 50;
  const max = 10, min = 0;
  const pts = arr.map((d,i) => {
    const x = i * 28 + 14;
    const y = h - ((d.mood - min) / (max - min)) * (h - 10) - 5;
    return [x, y];
  });
  const pathD = pts.map((p,i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--primary)"/>`).join('')}
  </svg>`;
  return el('div', { html: svg, style: 'overflow-x:auto;' });
}

/* --- Analytics -------------------------------------------- */
function renderAnalytics() {
  const gpa = computeGPA();
  $('#gpa-big').textContent = gpa.value === null ? '—' : gpa.value.toFixed(2);
  const breakdown = $('#gpa-breakdown');
  breakdown.innerHTML = '';
  if (state.courses.length === 0) {
    breakdown.appendChild(el('div', { class: 'empty', html: '<strong>No courses yet.</strong>Add courses with credits and grades.' }));
  } else {
    state.courses.forEach(c => {
      const g = computeCourseGrade(c);
      breakdown.appendChild(el('div', { style: 'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;' },
        el('div', { style: 'width: 4px; height: 24px; border-radius: 99px; background: ' + c.color }),
        el('span', { style: 'flex:1;' }, c.name || c.code || 'Untitled'),
        el('span', { style: 'color: var(--muted); font-size: 12px;' }, (c.credits || 0) + ' cr'),
        el('strong', { style: 'min-width: 40px; text-align: right;' }, g.letter || '—')
      ));
    });
  }

  renderHeatmap('#full-heatmap', false);

  const pa = $('#progress-areas');
  pa.innerHTML = '';
  const totalAsg = allAssignments().length;
  const doneAsg = allAssignments().filter(a => a.done).length;
  const totalGoals = state.personal.goals.length;
  const doneGoals = state.personal.goals.filter(g => g.done).length;
  const apps = state.professional.applications.length;
  const interviews = state.professional.applications.filter(a => ['Interview','Offer'].includes(a.status)).length;
  const habitsThisWeek = state.personal.habits.reduce((s,h) => s + Object.keys(h.checks||{}).filter(d => {
    const dd = new Date(d); const today = new Date(); const diff = (today - dd) / 86400000;
    return diff >= 0 && diff < 7;
  }).length, 0);
  const habitsPossible = state.personal.habits.length * 7;
  [
    ['Coursework done', doneAsg, totalAsg, 'var(--primary)'],
    ['Goals achieved', doneGoals, totalGoals, 'var(--success)'],
    ['Applications → Interview', interviews, apps, 'var(--accent)'],
    ['Habits this week', habitsThisWeek, habitsPossible, 'var(--warn)']
  ].forEach(([lbl, num, denom, color]) => {
    const pct = denom ? Math.round(num/denom*100) : 0;
    pa.appendChild(el('div', { style: 'margin-bottom: 14px;' },
      el('div', { style: 'display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;' },
        el('span', {}, lbl),
        el('span', { style: 'color: var(--muted);' }, num + ' / ' + denom + ' • ' + pct + '%')
      ),
      el('div', { style: 'height: 6px; background: var(--line); border-radius: 99px; overflow: hidden;' },
        el('div', { style: `width: ${pct}%; height:100%; background: ${color};` })
      )
    ));
  });

  renderCharts();
}

function renderCharts() {
  const ctx = $('#chart-time');
  if (!ctx) return;
  if (timeChart) timeChart.destroy();
  const byKey = {};
  state.timeLogs.forEach(l => {
    let key, color;
    if (l.courseId) {
      const c = state.courses.find(c => c.id === l.courseId);
      if (c) { key = c.name || c.code || 'Course'; color = c.color; }
    } else {
      key = l.category || 'Other';
      color = ({ 'Professional':'var(--accent)', 'Personal':'var(--success)', 'Other':'var(--muted)' })[key] || 'var(--muted)';
    }
    if (!key) return;
    byKey[key] = byKey[key] || { hours: 0, color };
    byKey[key].hours += Number(l.hours) || 0;
  });
  const labels = Object.keys(byKey);
  const data = labels.map(l => byKey[l].hours);
  const colors = labels.map(l => byKey[l].color);
  const inkSoft = getComputedStyle(document.documentElement).getPropertyValue('--ink-soft');
  if (labels.length === 0) {
    ctx.parentElement.innerHTML = '<div class="empty"><strong>No time logged yet.</strong>Click "+ Log hours" to track where your time is going.</div>';
  } else {
    timeChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { color: inkSoft, font: { size: 11 } } } }
      }
    });
  }

  const ctx2 = $('#chart-weekly-time');
  if (ctx2) {
    if (weeklyTimeChart) weeklyTimeChart.destroy();
    const perWeek = {};
    for (let w = 1; w <= state.semester.totalWeeks; w++) perWeek[w] = 0;
    state.timeLogs.forEach(l => {
      const w = weekOfDate(l.date);
      if (w) perWeek[w] = (perWeek[w] || 0) + Number(l.hours||0);
    });
    const wlabels = Object.keys(perWeek);
    const wdata = wlabels.map(w => perWeek[w]);
    if (state.timeLogs.length === 0) {
      ctx2.parentElement.innerHTML = '<div class="empty"><strong>Log hours to see trends.</strong></div>';
    } else {
      weeklyTimeChart = new Chart(ctx2, {
        type: 'bar',
        data: { labels: wlabels.map(w => 'W'+w), datasets: [{ data: wdata, backgroundColor: 'rgba(109,93,252,.7)', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: inkSoft, font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: inkSoft, font: { size: 10 } }, grid: { color: 'rgba(127,127,160,.1)' } }
          }
        }
      });
    }
  }
}

/* --- Settings --------------------------------------------- */
function renderSettings() {
  $('#set-name').value = state.semester.name || '';
  $('#set-start').value = state.semester.startDate || '';
  $('#set-weeks').value = state.semester.totalWeeks || 13;
  $('#set-user').value = state.semester.userName || '';
  renderSyncInfo();
}
