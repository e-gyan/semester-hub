/* ============================================================
   helpers.js — DOM helpers, toast, date / week math,
   inline editors, rich-text editor.
   Pure functions with no app-state dependencies (except the
   shared `state` global, defined in state.js).
   ============================================================ */

/* --- DOM ---------------------------------------------------- */
function $(s, root = document) { return root.querySelector(s); }
function $$(s, root = document) { return [...root.querySelectorAll(s)]; }

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'style') e.style.cssText = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  children.flat().forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

function toast(msg, kind = 'info') {
  const t = el('div', { class: 'toast' }, msg);
  if (kind === 'danger') t.style.background = 'var(--danger)';
  if (kind === 'success') t.style.background = 'var(--success)';
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

/* --- Date / week math --------------------------------------- */
function todayStr() { return new Date().toISOString().slice(0, 10); }

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysUntil(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((dt - today) / 86400000);
}

function statusFor(asg) {
  if (asg.done) return { label: 'Done', class: 'success' };
  const du = daysUntil(asg.due);
  if (du === null) return { label: 'Open', class: '' };
  if (du < 0) return { label: 'Overdue', class: 'danger' };
  if (du <= 2) return { label: `${du}d left`, class: 'warn' };
  return { label: `${du}d left`, class: 'info' };
}

function weekOfDate(d) {
  if (!state.semester.startDate || !d) return null;
  const start = new Date(state.semester.startDate);
  const dt = new Date(d);
  const diff = Math.floor((dt - start) / 86400000);
  const w = Math.floor(diff / 7) + 1;
  if (w < 1 || w > state.semester.totalWeeks) return null;
  return w;
}

function weekDateRange(w) {
  if (!state.semester.startDate) return '';
  const start = new Date(state.semester.startDate);
  const ws = new Date(start); ws.setDate(start.getDate() + (w - 1) * 7);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  return `${fmtDate(ws)} – ${fmtDate(we)}`;
}

/* --- Inline cell editors ------------------------------------ */
function inlineEdit(value, onSave) {
  const inp = el('input', { class: 'inline-input', value: value || '', placeholder: '—' });
  inp.addEventListener('change', () => onSave(inp.value));
  inp.addEventListener('blur', () => onSave(inp.value));
  return inp;
}
function inlineDate(value, onSave) {
  const inp = el('input', { class: 'inline-input', type: 'date', value: value || '' });
  inp.addEventListener('change', () => onSave(inp.value));
  return inp;
}
function inlineNumber(value, onSave, ph = '–') {
  const inp = el('input', { class: 'inline-input', type: 'number', value: value ?? '', placeholder: ph, style: 'width: 60px;' });
  inp.addEventListener('change', () => onSave(inp.value === '' ? null : Number(inp.value)));
  return inp;
}

/* --- Rich text editor (reusable, contenteditable + execCommand) -- */
function richEditor(initialHTML, onChange, placeholder = 'Start typing…') {
  const wrap = el('div', { class: 'rte' });
  const tb = el('div', { class: 'rte-toolbar' });
  const ed = el('div', { class: 'rte-editor', contenteditable: 'true', 'data-placeholder': placeholder });
  ed.innerHTML = sanitizeRichHTML(initialHTML || '');

  const tools = [
    { lbl: 'B', cmd: 'bold', title: 'Bold (Ctrl+B)', style: 'font-weight:800;' },
    { lbl: 'I', cmd: 'italic', title: 'Italic (Ctrl+I)', style: 'font-style:italic;' },
    { lbl: 'U', cmd: 'underline', title: 'Underline (Ctrl+U)', style: 'text-decoration:underline;' },
    { sep: true },
    { lbl: 'H', cmd: 'formatBlock', arg: 'H3', title: 'Heading' },
    { lbl: '•', cmd: 'insertUnorderedList', title: 'Bullet list' },
    { lbl: '1.', cmd: 'insertOrderedList', title: 'Numbered list' },
    { sep: true },
    { lbl: '🔗', cmd: 'createLink', title: 'Add link' },
    { lbl: '⌫', cmd: 'removeFormat', title: 'Clear formatting' }
  ];
  tools.forEach(t => {
    if (t.sep) { tb.appendChild(el('div', { class: 'rte-sep' })); return; }
    const b = el('button', { class: 'rte-btn', title: t.title, type: 'button', style: t.style || '' }, t.lbl);
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => {
      ed.focus();
      if (t.cmd === 'createLink') {
        const url = prompt('Link URL:');
        if (url) document.execCommand(t.cmd, false, url);
      } else if (t.cmd === 'formatBlock') {
        document.execCommand(t.cmd, false, t.arg);
      } else {
        document.execCommand(t.cmd, false, null);
      }
      handleChange();
    });
    tb.appendChild(b);
  });

  function handleChange() { onChange(ed.innerHTML); }
  ed.addEventListener('input', handleChange);
  ed.addEventListener('blur', () => onChange(sanitizeRichHTML(ed.innerHTML)));

  wrap.appendChild(tb);
  wrap.appendChild(ed);
  return wrap;
}

function sanitizeRichHTML(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/ on\w+="[^"]*"/gi, '')
    .replace(/ on\w+='[^']*'/gi, '');
}
