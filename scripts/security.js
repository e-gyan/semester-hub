/* ============================================================
   security.js — Secure JSONBin cloud sync + Web Crypto.
   - PIN hashed with PBKDF2-SHA256 (150k iterations)
   - Credentials encrypted at rest with AES-256-GCM
   - Key derived from PIN via PBKDF2 (separate salt)

   Depends on: helpers.js ($, el, toast)
   Depends on: state.js (state, STORAGE_KEY, JSONBIN_BASE)
   Depends on: modals.js (modalShell, field, closeModal) — runtime only
   Depends on: views.js (render, applyTheme, renderSyncInfo) — runtime only
   ============================================================ */

const SECURE_KEY = 'semester_hub_secure_v1';
const PBKDF2_ITER = 150000;

let secure = loadSecure();
let session = { unlocked: false, masterKey: null, binId: null };
let syncStatus = 'idle';
let syncDebounceTimer = null;
let cloudInFlight = false;
let pendingPush = false;

function loadSecure() {
  try { return JSON.parse(localStorage.getItem(SECURE_KEY) || '{}'); }
  catch(e) { return {}; }
}
function saveSecure() { localStorage.setItem(SECURE_KEY, JSON.stringify(secure)); }
function isCloudConfigured() { return !!(secure && secure.encrypted && secure.pinHash); }
function isUnlocked() { return session.unlocked && !!session.masterKey && !!session.binId; }

function relTime(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + ' min ago';
  if (s < 86400) return Math.floor(s/3600) + ' hr ago';
  return Math.floor(s/86400) + ' d ago';
}

/* --- Crypto primitives ---------------------------------- */
function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function toB64(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function bytesEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function pbkdf2Bits(pin, salt, iterations, bits = 256) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const buf = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, bits
  );
  return new Uint8Array(buf);
}
async function deriveAesKey(pin, salt, iterations) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptString(key, plaintext) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(plaintext)
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}
async function decryptString(key, blob) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct)
  );
  return new TextDecoder().decode(pt);
}

/* --- High-level security operations --------------------- */
async function securitySetup(pin, masterKey, binId) {
  const pinSalt = randomBytes(16);
  const encSalt = randomBytes(16);
  const pinHash = await pbkdf2Bits(pin, pinSalt, PBKDF2_ITER);
  const key = await deriveAesKey(pin, encSalt, PBKDF2_ITER);
  const enc = await encryptString(key, JSON.stringify({ masterKey, binId }));
  secure = {
    pinSalt: toB64(pinSalt),
    pinHash: toB64(pinHash),
    encSalt: toB64(encSalt),
    encrypted: enc,
    lastSyncedAt: null,
    failedAttempts: 0,
    lockedUntil: 0
  };
  saveSecure();
  session = { unlocked: true, masterKey, binId };
}

async function verifyPin(pin) {
  if (!secure.pinSalt || !secure.pinHash) return false;
  const h = await pbkdf2Bits(pin, fromB64(secure.pinSalt), PBKDF2_ITER);
  return bytesEq(h, fromB64(secure.pinHash));
}

async function unlockWithPin(pin) {
  if (!isCloudConfigured()) return false;
  if (secure.lockedUntil && Date.now() < secure.lockedUntil) {
    const wait = Math.ceil((secure.lockedUntil - Date.now()) / 1000);
    throw new Error(`Too many attempts. Try again in ${wait}s.`);
  }
  if (!(await verifyPin(pin))) {
    secure.failedAttempts = (secure.failedAttempts || 0) + 1;
    if (secure.failedAttempts >= 5) {
      secure.lockedUntil = Date.now() + 60 * 1000;
      secure.failedAttempts = 0;
      saveSecure();
      throw new Error('Too many wrong attempts. Locked for 60s.');
    }
    saveSecure();
    return false;
  }
  const key = await deriveAesKey(pin, fromB64(secure.encSalt), PBKDF2_ITER);
  try {
    const pt = await decryptString(key, secure.encrypted);
    const { masterKey, binId } = JSON.parse(pt);
    session = { unlocked: true, masterKey, binId };
    secure.failedAttempts = 0;
    secure.lockedUntil = 0;
    saveSecure();
    return true;
  } catch(e) {
    return false;
  }
}

async function changeCredentials(pin, masterKey, binId) {
  if (!(await verifyPin(pin))) throw new Error('Wrong PIN.');
  const key = await deriveAesKey(pin, fromB64(secure.encSalt), PBKDF2_ITER);
  secure.encrypted = await encryptString(key, JSON.stringify({ masterKey, binId }));
  saveSecure();
  session.masterKey = masterKey;
  session.binId = binId;
}

async function changePinFlow(currentPin, newPin) {
  if (!(await verifyPin(currentPin))) throw new Error('Wrong current PIN.');
  const pinSalt = randomBytes(16);
  const encSalt = randomBytes(16);
  const pinHash = await pbkdf2Bits(newPin, pinSalt, PBKDF2_ITER);
  const key = await deriveAesKey(newPin, encSalt, PBKDF2_ITER);
  const enc = await encryptString(key, JSON.stringify({ masterKey: session.masterKey, binId: session.binId }));
  secure.pinSalt = toB64(pinSalt);
  secure.pinHash = toB64(pinHash);
  secure.encSalt = toB64(encSalt);
  secure.encrypted = enc;
  saveSecure();
}

function resetSecurity() {
  secure = {};
  session = { unlocked: false, masterKey: null, binId: null };
  saveSecure();
  setSyncStatus('idle');
}

/* --- Cloud API (uses in-memory session creds) ----------- */
async function cloudCreate() {
  const r = await fetch(JSONBIN_BASE + '/b', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': session.masterKey,
      'X-Bin-Name': 'Semester Hub',
      'X-Bin-Private': 'true'
    },
    body: JSON.stringify({ state })
  });
  if (!r.ok) throw new Error('Create bin failed (' + r.status + ')');
  const j = await r.json();
  return j.metadata.id;
}
async function cloudFetch() {
  const r = await fetch(JSONBIN_BASE + '/b/' + session.binId + '/latest', {
    headers: { 'X-Master-Key': session.masterKey, 'X-Bin-Meta': 'false' }
  });
  if (!r.ok) throw new Error('Fetch failed (' + r.status + ')');
  return await r.json();
}
async function cloudPush() {
  const r = await fetch(JSONBIN_BASE + '/b/' + session.binId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': session.masterKey },
    body: JSON.stringify({ state })
  });
  if (!r.ok) throw new Error('Push failed (' + r.status + ')');
}

function scheduleCloudPush() {
  if (!isCloudConfigured() || !isUnlocked()) return;
  clearTimeout(syncDebounceTimer);
  setSyncStatus('pending');
  syncDebounceTimer = setTimeout(doCloudPush, 1500);
}
async function doCloudPush() {
  if (!isCloudConfigured() || !isUnlocked()) return;
  if (cloudInFlight) { pendingPush = true; return; }
  cloudInFlight = true;
  setSyncStatus('syncing');
  try {
    await cloudPush();
    secure.lastSyncedAt = Date.now();
    saveSecure();
    setSyncStatus('synced');
    renderSyncInfo();
  } catch(e) {
    setSyncStatus('error');
    toast('Cloud sync failed: ' + e.message, 'danger');
  } finally {
    cloudInFlight = false;
    if (pendingPush) { pendingPush = false; scheduleCloudPush(); }
  }
}

function setSyncStatus(s) {
  syncStatus = s;
  const dot = $('#sync-dot'), lbl = $('#sync-label');
  if (!dot || !lbl) return;
  dot.className = 'sync-dot ' + s;
  const labels = {
    idle: isCloudConfigured() ? (isUnlocked() ? 'Connected' : 'Locked') : 'Local only',
    pending: 'Saving…',
    syncing: 'Syncing…',
    synced: 'Synced',
    error: 'Sync error',
    offline: 'Offline'
  };
  lbl.textContent = labels[s] || s;
}

async function manualSyncNow() {
  if (!isUnlocked()) { toast('Unlock first.', 'danger'); return; }
  clearTimeout(syncDebounceTimer);
  await doCloudPush();
  if (syncStatus === 'synced') toast('Synced to cloud.', 'success');
}

async function pullFromCloud() {
  if (!isUnlocked()) { toast('Unlock first.', 'danger'); return; }
  if (!confirm('Replace your current data with whatever is in the cloud? Local changes since the last sync will be lost.')) return;
  setSyncStatus('syncing');
  try {
    const remote = await cloudFetch();
    const payload = remote.state ? remote.state : remote;
    state = { ...structuredClone(DEFAULT_STATE), ...payload };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
    secure.lastSyncedAt = Date.now();
    saveSecure();
    setSyncStatus('synced');
    applyTheme(); render(); renderSyncInfo();
    toast('Loaded from cloud.', 'success');
  } catch(e) {
    setSyncStatus('error');
    toast('Pull failed: ' + e.message, 'danger');
  }
}

function renderSyncInfo() {
  const wrap = $('#sync-info');
  const notConfig = $('#sync-not-configured');
  const config = $('#sync-configured');
  if (!wrap) return;
  if (!isCloudConfigured()) {
    notConfig?.classList.remove('hidden');
    config?.classList.add('hidden');
    return;
  }
  notConfig?.classList.add('hidden');
  config?.classList.remove('hidden');
  wrap.innerHTML = '';
  const binId = session.binId || '(locked)';
  wrap.appendChild(el('div', { style: 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;' },
    el('span', { class: 'sync-dot ' + syncStatus, style: 'display:inline-block;' }),
    el('strong', {}, isUnlocked() ? 'Connected' : 'Connected (locked)'),
    el('span', {}, '— Bin:'),
    el('span', { class: 'copy-id', title: 'Click to copy', onclick: () => {
      if (!isUnlocked()) { toast('Unlock first to view bin ID.', 'danger'); return; }
      navigator.clipboard?.writeText(binId).then(() => toast('Bin ID copied.', 'success'));
    }}, isUnlocked() ? binId : '••••••••'),
    secure.lastSyncedAt ? el('span', { style: 'color: var(--muted); margin-left:auto;' }, 'Last synced ' + relTime(secure.lastSyncedAt)) : null
  ));
}

window.addEventListener('online', () => { if (isUnlocked()) setSyncStatus('synced'); });
window.addEventListener('offline', () => setSyncStatus('offline'));

/* --- Overlay controllers -------------------------------- */
function showLockOverlay() {
  $('#lock-overlay').classList.remove('hidden');
  $('#lock-error').textContent = '';
  $('#lock-pin').value = '';
  setTimeout(() => $('#lock-pin').focus(), 50);
}
function hideLockOverlay() { $('#lock-overlay').classList.add('hidden'); }
function showSetupOverlay() {
  $('#setup-overlay').classList.remove('hidden');
  $('#setup-error').textContent = '';
  ['setup-pin','setup-pin-confirm','setup-key','setup-bin'].forEach(id => $('#'+id).value = '');
  setTimeout(() => $('#setup-pin').focus(), 50);
}
function hideSetupOverlay() { $('#setup-overlay').classList.add('hidden'); }

async function doSetup() {
  const err = $('#setup-error');
  err.textContent = '';
  const pin = $('#setup-pin').value;
  const pin2 = $('#setup-pin-confirm').value;
  const key = $('#setup-key').value.trim();
  const bin = $('#setup-bin').value.trim();
  if (pin.length < 4) { err.textContent = 'PIN must be at least 4 characters.'; return; }
  if (pin !== pin2) { err.textContent = 'PINs do not match.'; return; }
  if (!key) { err.textContent = 'Master Key required.'; return; }
  const submit = $('#setup-submit');
  submit.disabled = true; submit.textContent = 'Setting up…';
  try {
    session.masterKey = key;
    let binId = bin;
    let remotePayload = null;
    if (bin) {
      session.binId = bin;
      const r = await cloudFetch();
      remotePayload = r.state ? r.state : r;
    } else {
      session.binId = null;
      binId = await cloudCreate();
    }
    if (remotePayload) {
      const remoteHasData = remotePayload.courses?.length || Object.keys(remotePayload.weekly || {}).length || remotePayload.semester?.name;
      const localHasData = state.courses.length || state.semester.name;
      let useRemote = false;
      if (remoteHasData && localHasData) {
        useRemote = confirm('Both this device and the cloud bin have data.\n\nOK = use the CLOUD copy (overwrite local)\nCancel = push LOCAL to cloud (overwrite cloud)');
      } else if (remoteHasData) useRemote = true;
      if (useRemote) {
        state = { ...structuredClone(DEFAULT_STATE), ...remotePayload };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
      } else {
        session.binId = binId;
        await cloudPush();
      }
    }
    await securitySetup(pin, key, binId);
    secure.lastSyncedAt = Date.now();
    saveSecure();
    hideSetupOverlay();
    setSyncStatus('synced');
    applyTheme(); render(); renderSyncInfo();
    toast('Cloud sync set up. Encrypted with your PIN.', 'success');
  } catch(e) {
    session = { unlocked: false, masterKey: null, binId: null };
    err.textContent = e.message || 'Setup failed.';
  } finally {
    submit.disabled = false; submit.textContent = 'Set up & connect';
  }
}

async function doUnlock() {
  const err = $('#lock-error');
  err.textContent = '';
  const pin = $('#lock-pin').value;
  if (!pin) { err.textContent = 'Enter your PIN.'; return; }
  const submit = $('#lock-submit');
  submit.disabled = true; submit.textContent = 'Unlocking…';
  try {
    const ok = await unlockWithPin(pin);
    if (!ok) { err.textContent = 'Wrong PIN.'; return; }
    hideLockOverlay();
    setSyncStatus('synced');
    renderSyncInfo();
    try {
      const remote = await cloudFetch();
      const payload = remote.state ? remote.state : remote;
      const remoteTime = (payload && payload._meta && payload._meta.savedAt) || 0;
      const localTime = (state._meta && state._meta.savedAt) || 0;
      const localEmpty = state.courses.length === 0 && !state.semester.name;
      if (payload && (remoteTime > localTime || localEmpty)) {
        state = { ...structuredClone(DEFAULT_STATE), ...payload };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
        applyTheme(); render();
      }
      secure.lastSyncedAt = Date.now();
      saveSecure();
    } catch(e) {
      setSyncStatus('error');
      toast('Unlocked, but cloud unreachable.', 'danger');
    }
    renderSyncInfo();
  } catch(e) {
    err.textContent = e.message;
  } finally {
    submit.disabled = false; submit.textContent = 'Unlock';
  }
}

/* --- PIN-gated operations ------------------------------- */
async function promptPin(message = 'Enter your PIN to continue.') {
  return new Promise(resolve => {
    const m = $('#modal');
    m.innerHTML = '';
    const inp = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'PIN' });
    const errLine = el('div', { class: 'lock-error', style: 'min-height: 16px; margin-top: 4px;' });
    modalShell(m, 'Confirm PIN', message,
      el('div', { class: 'modal-body' }, field('PIN', inp), errLine),
      async () => {
        const ok = await verifyPin(inp.value);
        if (!ok) { errLine.textContent = 'Wrong PIN.'; return; }
        closeModal();
        resolve(inp.value);
      }
    );
    const cancelBtn = m.querySelector('.modal-foot .btn:not(.btn-primary)');
    if (cancelBtn) cancelBtn.onclick = () => { closeModal(); resolve(null); };
    $('#modal-backdrop').classList.add('open');
    setTimeout(() => inp.focus(), 50);
  });
}

async function doChangeCredentials() {
  const pin = await promptPin('Enter your PIN to change cloud credentials.');
  if (pin === null) return;
  const m = $('#modal');
  m.innerHTML = '';
  const kI = el('input', { type: 'password', placeholder: 'New Master Key', value: session.masterKey || '' });
  const bI = el('input', { placeholder: 'Bin ID', value: session.binId || '' });
  const err = el('div', { class: 'lock-error', style: 'min-height: 16px;' });
  modalShell(m, 'Change credentials', 'Update your JSONBin Master Key and / or Bin ID.',
    el('div', { class: 'modal-body' }, field('Master Key', kI), field('Bin ID', bI), err),
    async () => {
      if (!kI.value.trim() || !bI.value.trim()) { err.textContent = 'Both fields required.'; return; }
      try {
        session.masterKey = kI.value.trim();
        session.binId = bI.value.trim();
        await cloudFetch();
        await changeCredentials(pin, session.masterKey, session.binId);
        closeModal();
        toast('Credentials updated.', 'success');
        renderSyncInfo();
      } catch(e) {
        err.textContent = e.message;
      }
    }
  );
  $('#modal-backdrop').classList.add('open');
}

async function doChangePin() {
  const m = $('#modal');
  m.innerHTML = '';
  const oldI = el('input', { type: 'password', inputmode: 'numeric', placeholder: 'Current PIN' });
  const newI = el('input', { type: 'password', inputmode: 'numeric', placeholder: 'New PIN (4+ chars)' });
  const new2 = el('input', { type: 'password', inputmode: 'numeric', placeholder: 'Confirm new PIN' });
  const err = el('div', { class: 'lock-error', style: 'min-height: 16px;' });
  modalShell(m, 'Change PIN', 'Your credentials will be re-encrypted with the new PIN.',
    el('div', { class: 'modal-body' }, field('Current PIN', oldI), field('New PIN', newI), field('Confirm', new2), err),
    async () => {
      if (newI.value.length < 4) { err.textContent = 'New PIN must be at least 4 characters.'; return; }
      if (newI.value !== new2.value) { err.textContent = 'New PINs do not match.'; return; }
      try {
        await changePinFlow(oldI.value, newI.value);
        closeModal();
        toast('PIN changed and credentials re-encrypted.', 'success');
      } catch(e) {
        err.textContent = e.message;
      }
    }
  );
  $('#modal-backdrop').classList.add('open');
  setTimeout(() => oldI.focus(), 50);
}

async function doDisconnect() {
  const pin = await promptPin('Enter your PIN to disconnect cloud sync.');
  if (pin === null) return;
  if (!confirm('Disconnect this device from JSONBin? Your bin and its data stay on jsonbin.io; this clears the encrypted credentials from this device.')) return;
  resetSecurity();
  renderSyncInfo();
  toast('Disconnected. Local-only mode.', 'success');
}

/* --- Migration from older plaintext sync config --------- */
function migrateLegacySync() {
  try {
    const oldRaw = localStorage.getItem(SYNC_KEY);
    if (!oldRaw) return false;
    const old = JSON.parse(oldRaw);
    if (!(old.masterKey && old.binId)) {
      localStorage.removeItem(SYNC_KEY);
      return false;
    }
    setTimeout(() => {
      showSetupOverlay();
      $('#setup-key').value = old.masterKey;
      $('#setup-bin').value = old.binId;
      $('#setup-error').textContent = 'Your previous credentials are stored without encryption. Set a PIN now to protect them.';
    }, 200);
    localStorage.removeItem(SYNC_KEY);
    return true;
  } catch(e) { return false; }
}
