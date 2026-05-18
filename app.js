/* ============================================================================
   CYRABELL — frontend application
   ============================================================================ */

const CFG = window.CYRABELL_CONFIG;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

// ---------- STATE ----------
const state = {
  user: null,
  flocks: [],
  dashboard: null,
  currentView: 'dashboard'
};

// ---------- API ----------
async function api(action, params = {}) {
  if (!CFG.API_URL || CFG.API_URL.includes('PASTE_YOUR')) {
    throw new Error('Backend URL not configured. Edit config.js with your Google Apps Script Web App URL.');
  }
  // Apps Script web apps require simple POST without custom headers to avoid CORS preflight
  const body = JSON.stringify({ action, ...params });
  const res = await fetch(CFG.API_URL, {
    method: 'POST',
    body,
    redirect: 'follow',
    // Plain-text content-type avoids CORS preflight, Apps Script reads e.postData.contents anyway
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Backend error');
  return json.data;
}

// ---------- TOAST ----------
let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 3000);
}

// ---------- MODAL ----------
function openModal(title, htmlOrEl) {
  $('#modal-title').textContent = title;
  const body = $('#modal-body');
  body.innerHTML = '';
  if (typeof htmlOrEl === 'string') body.innerHTML = htmlOrEl;
  else body.appendChild(htmlOrEl);
  $('#modal-backdrop').hidden = false;
}
function closeModal() { $('#modal-backdrop').hidden = true; }

// ---------- LOGIN ----------
async function handleLogin(e) {
  e.preventDefault();
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  const btn = $('#login-btn');
  const errEl = $('#login-error');
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const user = await api('login', { username, password });
    state.user = user;
    sessionStorage.setItem('cyrabell_user', JSON.stringify(user));
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enter the coop';
  }
}

function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#user-name').textContent = state.user.username;
  $('#user-avatar').textContent = state.user.username.charAt(0).toUpperCase();
  renderView('dashboard');
}

function logout() {
  sessionStorage.removeItem('cyrabell_user');
  state.user = null;
  location.reload();
}

// ---------- ROUTING ----------
function setActiveNav(view) {
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('#mobile-title').textContent = {
    dashboard: 'Dashboard', flocks: 'Flocks', eggs: 'Eggs', growth: 'Growth',
    feed: 'Feed', health: 'Health', mortality: 'Mortality', sales: 'Sales',
    ai: 'AI Advisor', settings: 'Settings'
  }[view] || view;
}

async function renderView(view) {
  state.currentView = view;
  setActiveNav(view);
  const main = $('#main-content');
  main.innerHTML = `<div class="loader"><div class="spinner"></div>Loading…</div>`;
  $('.sidebar')?.classList.remove('open');

  try {
    switch (view) {
      case 'dashboard': await renderDashboard(main); break;
      case 'flocks':    await renderRecordList(main, 'flocks', flockConfig); break;
      case 'eggs':      await renderRecordList(main, 'eggs', eggConfig); break;
      case 'growth':    await renderRecordList(main, 'growth', growthConfig); break;
      case 'feed':      await renderRecordList(main, 'feed', feedConfig); break;
      case 'health':    await renderRecordList(main, 'health', healthConfig); break;
      case 'mortality': await renderRecordList(main, 'mortality', mortalityConfig); break;
      case 'sales':     await renderRecordList(main, 'sales', salesConfig); break;
      case 'ai':        renderAI(main); break;
      case 'settings':  renderSettings(main); break;
    }
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><span class="emoji">⚠</span><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ---------- DASHBOARD ----------
async function renderDashboard(main) {
  const d = await api('dashboard');
  state.dashboard = d;

  const fmt = n => Number(n || 0).toLocaleString();
  const money = n => CFG.CURRENCY + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const profitClass = d.profit30d >= 0 ? 'badge-success' : 'badge-danger';

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Good day on the farm</h1>
        <div class="subtitle">${CFG.TAGLINE}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" onclick="renderView('dashboard')">↻ Refresh</button>
        <button class="btn btn-primary btn-sm" onclick="renderView('eggs')">+ Log eggs</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card accent-clay">
        <div class="label">Total birds</div>
        <div class="value">${fmt(d.totalBirds)}</div>
        <div class="meta">${d.totalFlocks} active flock${d.totalFlocks === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-card accent-gold">
        <div class="label">Eggs · last 7 days</div>
        <div class="value">${fmt(d.eggs7d)}</div>
        <div class="meta">Laying rate ${d.layingRate}%</div>
      </div>
      <div class="stat-card accent-forest">
        <div class="label">Revenue · 30d</div>
        <div class="value">${money(d.revenue30d)}</div>
        <div class="meta">Feed ${money(d.feedCost30d)} · Health ${money(d.healthCost30d)}</div>
      </div>
      <div class="stat-card accent-moss">
        <div class="label">Profit · 30d</div>
        <div class="value">${money(d.profit30d)}</div>
        <div class="meta"><span class="badge ${profitClass}">${d.profit30d >= 0 ? '↑ profitable' : '↓ deficit'}</span></div>
      </div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-head">
          <h3>Egg collection · 14 days</h3>
          <span class="badge badge-clay">${fmt(d.eggs30d)} in 30 days</span>
        </div>
        <div class="chart-wrap" id="egg-chart"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>At a glance</h3></div>
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid var(--oat);">
            <span class="muted" style="font-size:13px">Mortality (30d)</span>
            <strong>${fmt(d.mortality30d)} birds</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid var(--oat);">
            <span class="muted" style="font-size:13px">Avg eggs / day (7d)</span>
            <strong>${Math.round(d.eggs7d / 7)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid var(--oat);">
            <span class="muted" style="font-size:13px">Feed cost / bird (30d)</span>
            <strong>${d.totalBirds ? money(d.feedCost30d / d.totalBirds) : '—'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span class="muted" style="font-size:13px">Margin (30d)</span>
            <strong>${d.revenue30d ? Math.round((d.profit30d / d.revenue30d) * 100) + '%' : '—'}</strong>
          </div>
        </div>
        <button class="btn btn-secondary btn-block" style="margin-top:18px" onclick="renderView('ai')">✦ Ask Cyrabell advisor</button>
      </div>
    </div>
  `;

  drawEggChart(d.trend);
}

function drawEggChart(trend) {
  const container = $('#egg-chart');
  const w = container.clientWidth;
  const h = container.clientHeight;
  const pad = { t: 20, r: 10, b: 28, l: 30 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const max = Math.max(1, ...trend.map(d => d.eggs));
  const bw = cw / trend.length * 0.75;
  const step = cw / trend.length;

  let bars = '';
  let labels = '';
  trend.forEach((d, i) => {
    const x = pad.l + step * i + (step - bw) / 2;
    const bh = (d.eggs / max) * ch;
    const y = pad.t + ch - bh;
    bars += `<rect class="chart-bar" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3"/>`;
    if (d.eggs > 0) {
      bars += `<text class="chart-value" x="${x + bw/2}" y="${y - 4}">${d.eggs}</text>`;
    }
    if (i % 2 === 0) {
      const label = d.date.slice(5);
      labels += `<text class="chart-label" x="${x + bw/2}" y="${pad.t + ch + 16}">${label}</text>`;
    }
  });

  container.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${bars}${labels}</svg>`;
}

// ---------- GENERIC RECORD LIST ----------
const flockConfig = {
  title: 'Flocks',
  subtitle: 'Manage your batches and breeds',
  fields: [
    { key: 'name',         label: 'Flock name', type: 'text', required: true },
    { key: 'breed',        label: 'Breed', type: 'text', placeholder: 'e.g. Dekalb Brown, Native' },
    { key: 'startCount',   label: 'Start count', type: 'number', required: true },
    { key: 'currentCount', label: 'Current count', type: 'number', required: true },
    { key: 'startDate',    label: 'Start date', type: 'date', required: true },
    { key: 'purpose',      label: 'Purpose', type: 'select', options: ['Layers', 'Broilers', 'Breeders', 'Dual purpose', 'Native'] },
    { key: 'notes',        label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['name', 'breed', 'startCount', 'currentCount', 'startDate', 'purpose']
};

const eggConfig = {
  title: 'Egg production',
  subtitle: 'Daily egg collection log',
  fields: [
    { key: 'flockId',       label: 'Flock', type: 'flock', required: true },
    { key: 'date',          label: 'Date', type: 'date', required: true, default: 'today' },
    { key: 'eggsCollected', label: 'Eggs collected', type: 'number', required: true },
    { key: 'broken',        label: 'Broken', type: 'number', default: 0 },
    { key: 'doubleYolk',    label: 'Double yolk', type: 'number', default: 0 },
    { key: 'notes',         label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['date', 'flockId', 'eggsCollected', 'broken', 'doubleYolk']
};

const growthConfig = {
  title: 'Growth tracking',
  subtitle: 'Weight measurements over time',
  fields: [
    { key: 'flockId',         label: 'Flock', type: 'flock', required: true },
    { key: 'date',            label: 'Date', type: 'date', required: true, default: 'today' },
    { key: 'avgWeightGrams',  label: 'Avg weight (grams)', type: 'number', required: true },
    { key: 'sampleSize',      label: 'Sample size', type: 'number', default: 10 },
    { key: 'notes',           label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['date', 'flockId', 'avgWeightGrams', 'sampleSize']
};

const feedConfig = {
  title: 'Feed records',
  subtitle: 'Feed consumption and costs',
  fields: [
    { key: 'flockId',     label: 'Flock', type: 'flock', required: true },
    { key: 'date',        label: 'Date', type: 'date', required: true, default: 'today' },
    { key: 'feedType',    label: 'Feed type', type: 'text', placeholder: 'e.g. Starter, Grower, Layer' },
    { key: 'quantityKg',  label: 'Quantity (kg)', type: 'number', required: true },
    { key: 'costPerKg',   label: 'Cost per kg', type: 'number' },
    { key: 'totalCost',   label: 'Total cost', type: 'number', calc: (r) => (Number(r.quantityKg) || 0) * (Number(r.costPerKg) || 0) },
    { key: 'notes',       label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['date', 'flockId', 'feedType', 'quantityKg', 'totalCost']
};

const healthConfig = {
  title: 'Health & vaccination',
  subtitle: 'Treatments, vaccinations, observations',
  fields: [
    { key: 'flockId',     label: 'Flock', type: 'flock', required: true },
    { key: 'date',        label: 'Date', type: 'date', required: true, default: 'today' },
    { key: 'eventType',   label: 'Event type', type: 'select', options: ['Vaccination', 'Deworming', 'Treatment', 'Observation', 'Other'] },
    { key: 'description', label: 'Description', type: 'text', required: true },
    { key: 'medication',  label: 'Medication / vaccine' },
    { key: 'cost',        label: 'Cost', type: 'number', default: 0 },
    { key: 'notes',       label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['date', 'flockId', 'eventType', 'description', 'cost']
};

const mortalityConfig = {
  title: 'Mortality log',
  subtitle: 'Track losses and causes',
  fields: [
    { key: 'flockId', label: 'Flock', type: 'flock', required: true },
    { key: 'date',    label: 'Date', type: 'date', required: true, default: 'today' },
    { key: 'count',   label: 'Count', type: 'number', required: true },
    { key: 'cause',   label: 'Cause', type: 'select', options: ['Disease', 'Predator', 'Heat stress', 'Cannibalism', 'Unknown', 'Other'] },
    { key: 'notes',   label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['date', 'flockId', 'count', 'cause']
};

const salesConfig = {
  title: 'Sales',
  subtitle: 'Revenue from eggs, birds, and culls',
  fields: [
    { key: 'flockId',      label: 'Flock', type: 'flock' },
    { key: 'date',         label: 'Date', type: 'date', required: true, default: 'today' },
    { key: 'itemType',     label: 'Item', type: 'select', options: ['Eggs (tray)', 'Eggs (piece)', 'Live bird', 'Dressed bird', 'Manure', 'Other'] },
    { key: 'quantity',     label: 'Quantity', type: 'number', required: true },
    { key: 'unitPrice',    label: 'Unit price', type: 'number', required: true },
    { key: 'totalRevenue', label: 'Total', type: 'number', calc: (r) => (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0) },
    { key: 'buyer',        label: 'Buyer' },
    { key: 'notes',        label: 'Notes', type: 'textarea', full: true }
  ],
  columns: ['date', 'itemType', 'quantity', 'unitPrice', 'totalRevenue', 'buyer']
};

async function renderRecordList(main, sheetName, config) {
  // Always ensure flocks are loaded for the flock-picker
  if (state.flocks.length === 0 || sheetName === 'flocks') {
    state.flocks = await api('list', { sheet: 'flocks' });
  }
  const records = sheetName === 'flocks'
    ? state.flocks
    : await api('list', { sheet: sheetName });

  // Sort by date desc if records have a date
  records.sort((a, b) => {
    const da = new Date(a.date || a.startDate || a.createdAt || 0).getTime();
    const db = new Date(b.date || b.startDate || b.createdAt || 0).getTime();
    return db - da;
  });

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${config.title}</h1>
        <div class="subtitle">${config.subtitle}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" onclick="renderView('${state.currentView}')">↻</button>
        <button class="btn btn-primary btn-sm" id="add-btn">+ New ${config.title.split(' ')[0].toLowerCase()}</button>
      </div>
    </div>
    <div class="card" style="padding:0; overflow:hidden;">
      ${records.length === 0
        ? `<div class="empty-state"><span class="emoji">○</span><p>No records yet. Click "+ New" to start.</p></div>`
        : `<table class="data-table">
          <thead><tr>
            ${config.columns.map(c => `<th>${humanize(c)}</th>`).join('')}
            <th></th>
          </tr></thead>
          <tbody>
            ${records.map(r => `
              <tr>
                ${config.columns.map(c => `<td>${formatCell(c, r[c])}</td>`).join('')}
                <td class="row-actions">
                  <button class="btn btn-ghost btn-sm edit-btn" data-id="${r.id}">Edit</button>
                  <button class="btn btn-ghost btn-sm del-btn" data-id="${r.id}">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`
      }
    </div>
  `;

  $('#add-btn').onclick = () => openRecordForm(sheetName, config);
  $$('.edit-btn').forEach(b => b.onclick = () => {
    const rec = records.find(r => r.id === b.dataset.id);
    openRecordForm(sheetName, config, rec);
  });
  $$('.del-btn').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this record?')) return;
    try {
      await api('delete', { sheet: sheetName, id: b.dataset.id });
      toast('Deleted', 'success');
      renderView(state.currentView);
    } catch (e) { toast(e.message, 'error'); }
  });
}

function formatCell(col, val) {
  if (val == null || val === '') return '<span style="color:var(--ink-soft)">—</span>';
  if (col === 'flockId') {
    const f = state.flocks.find(x => x.id === val);
    return f ? `<span class="badge badge-forest">${escapeHtml(f.name)}</span>` : escapeHtml(String(val));
  }
  if (col === 'date' || col === 'startDate' || col === 'createdAt') {
    return escapeHtml(String(val).slice(0, 10));
  }
  if (col === 'purpose' || col === 'eventType' || col === 'cause' || col === 'itemType') {
    return `<span class="badge badge-gold">${escapeHtml(String(val))}</span>`;
  }
  if (col === 'totalRevenue' || col === 'totalCost' || col === 'cost' || col === 'unitPrice') {
    return CFG.CURRENCY + Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return escapeHtml(String(val));
}

function humanize(k) {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
    .replace(/Id$/, '').replace(/Kg$/, ' (kg)').replace(/Grams$/, ' (g)');
}

function openRecordForm(sheetName, config, existing) {
  const isEdit = !!existing;
  const data = existing ? { ...existing } : {};

  // Apply defaults for new records
  if (!isEdit) {
    config.fields.forEach(f => {
      if (f.default === 'today') data[f.key] = new Date().toISOString().slice(0, 10);
      else if (f.default !== undefined) data[f.key] = f.default;
    });
  }

  const form = document.createElement('form');
  form.className = 'record-form';
  form.innerHTML = `
    <div class="form-grid">
      ${config.fields.map(f => renderField(f, data[f.key])).join('')}
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save changes' : 'Add record'}</button>
    </div>
  `;

  openModal(isEdit ? 'Edit ' + config.title.toLowerCase() : 'New ' + config.title.split(' ')[0].toLowerCase(), form);

  $('#cancel-btn').onclick = closeModal;

  // Auto-calc fields
  form.addEventListener('input', () => {
    config.fields.forEach(f => {
      if (f.calc) {
        const fd = new FormData(form);
        const rec = Object.fromEntries(fd.entries());
        const val = f.calc(rec);
        const input = form.querySelector(`[name="${f.key}"]`);
        if (input && !input.matches(':focus')) input.value = val ? Number(val).toFixed(2) : '';
      }
    });
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const record = Object.fromEntries(fd.entries());
    // Apply calcs at submit time
    config.fields.forEach(f => {
      if (f.calc) record[f.key] = f.calc(record);
    });
    if (isEdit) record.id = existing.id;

    try {
      if (isEdit) await api('update', { sheet: sheetName, id: existing.id, record });
      else await api('add', { sheet: sheetName, record });
      toast(isEdit ? 'Saved' : 'Added', 'success');
      closeModal();
      renderView(state.currentView);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

function renderField(f, val) {
  val = val !== undefined ? val : '';
  const wrap = (inner) => `<label class="${f.full ? 'full' : ''}"><span>${f.label}${f.required ? ' *' : ''}</span>${inner}</label>`;
  const required = f.required ? 'required' : '';
  const ph = f.placeholder || '';

  if (f.type === 'flock') {
    return wrap(`<select name="${f.key}" ${required}>
      <option value="">— select flock —</option>
      ${state.flocks.map(fl => `<option value="${fl.id}" ${val === fl.id ? 'selected' : ''}>${escapeHtml(fl.name)} (${fl.breed || 'unspecified'})</option>`).join('')}
    </select>`);
  }
  if (f.type === 'select') {
    return wrap(`<select name="${f.key}" ${required}>
      <option value="">—</option>
      ${f.options.map(o => `<option ${val === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
    </select>`);
  }
  if (f.type === 'textarea') {
    return wrap(`<textarea name="${f.key}" rows="3" placeholder="${ph}">${escapeHtml(String(val))}</textarea>`);
  }
  if (f.type === 'date') {
    const v = val ? String(val).slice(0, 10) : '';
    return wrap(`<input type="date" name="${f.key}" value="${v}" ${required} />`);
  }
  return wrap(`<input type="${f.type || 'text'}" name="${f.key}" value="${escapeHtml(String(val))}" placeholder="${ph}" ${required} ${f.type === 'number' ? 'step="any"' : ''} />`);
}

// ---------- AI ADVISOR ----------
const aiHistory = [];

function renderAI(main) {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>AI farm advisor</h1>
        <div class="subtitle">Ask anything about your operation. Cyrabell reads your live data.</div>
      </div>
    </div>

    <div class="card">
      <div class="ai-suggestions">
        <button class="suggestion-chip" data-q="How is my farm performing this month?">How is my farm performing this month?</button>
        <button class="suggestion-chip" data-q="What's a healthy laying rate for my flocks and how do I compare?">Am I at a healthy laying rate?</button>
        <button class="suggestion-chip" data-q="My eggs dropped — what should I check first?">Egg production dropped — why?</button>
        <button class="suggestion-chip" data-q="How can I reduce feed cost without hurting production?">Reduce feed cost?</button>
        <button class="suggestion-chip" data-q="What vaccinations should I schedule next?">Next vaccinations?</button>
      </div>
      <div class="ai-msg-list" id="ai-msgs">
        ${aiHistory.length === 0
          ? `<div class="ai-msg bot">Magandang araw, ${escapeHtml(state.user.username)}! I'm your farm advisor. I can read your live data from Google Sheets. Ask me about egg production, feed efficiency, flock health, or anything else.</div>`
          : aiHistory.map(m => `<div class="ai-msg ${m.role}">${escapeHtml(m.text)}</div>`).join('')
        }
      </div>
      <div class="ai-input-row">
        <input type="text" id="ai-input" placeholder="Ask about your farm..." />
        <button class="btn btn-primary" id="ai-send">Ask</button>
      </div>
    </div>
  `;

  const send = async () => {
    const input = $('#ai-input');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    await sendAIMessage(q);
  };

  $('#ai-send').onclick = send;
  $('#ai-input').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  $$('.suggestion-chip').forEach(c => c.onclick = () => sendAIMessage(c.dataset.q));
}

async function sendAIMessage(q) {
  aiHistory.push({ role: 'user', text: q });
  const list = $('#ai-msgs');
  const userMsg = document.createElement('div');
  userMsg.className = 'ai-msg user';
  userMsg.textContent = q;
  list.appendChild(userMsg);
  const typing = document.createElement('div');
  typing.className = 'ai-msg bot';
  typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  list.appendChild(typing);
  list.scrollTop = list.scrollHeight;

  try {
    const { advice } = await api('aiAdvice', { question: q });
    typing.remove();
    aiHistory.push({ role: 'bot', text: advice });
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-msg bot';
    botMsg.textContent = advice;
    list.appendChild(botMsg);
    list.scrollTop = list.scrollHeight;
  } catch (err) {
    typing.remove();
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-msg bot';
    botMsg.textContent = '⚠ ' + err.message;
    list.appendChild(botMsg);
  }
}

// ---------- SETTINGS ----------
function renderSettings(main) {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Settings</h1>
        <div class="subtitle">Manage your account and app preferences</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Change password</h3></div>
      <form id="pw-form">
        <div class="form-grid">
          <label><span>Current password *</span><input type="password" name="oldPw" required /></label>
          <label><span>New password *</span><input type="password" name="newPw" required minlength="6" /></label>
          <label><span>Confirm new password *</span><input type="password" name="confirmPw" required minlength="6" /></label>
        </div>
        <div class="form-actions"><button class="btn btn-primary">Update password</button></div>
      </form>
    </div>

    <div class="card">
      <div class="card-head"><h3>About</h3></div>
      <p style="color:var(--ink-soft); font-size:14px; line-height:1.7;">
        <strong>${CFG.APP_NAME}</strong><br>
        Frontend: hosted free on GitHub Pages.<br>
        Backend: Google Apps Script + Google Sheets — you own all your data.<br>
        AI: Anthropic Claude (configured in Apps Script).<br>
        <br>
        Built for Filipino poultry farmers. Designed for small to mid-scale operations.
      </p>
    </div>
  `;

  $('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const o = Object.fromEntries(fd.entries());
    if (o.newPw !== o.confirmPw) return toast('Passwords do not match', 'error');
    try {
      await api('changePassword', { username: state.user.username, oldPassword: o.oldPw, newPassword: o.newPw });
      toast('Password changed', 'success');
      e.target.reset();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ---------- HELPERS ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- INIT ----------
function init() {
  $('#login-form').onsubmit = handleLogin;
  $('#logout-btn').onclick = logout;
  $('#modal-close').onclick = closeModal;
  $('#modal-backdrop').onclick = (e) => { if (e.target.id === 'modal-backdrop') closeModal(); };
  $('#menu-toggle').onclick = () => $('.sidebar').classList.toggle('open');
  $('#sync-btn').onclick = () => renderView(state.currentView);

  $$('.nav-item').forEach(n => n.onclick = () => renderView(n.dataset.view));

  // Auto-login if we have a stored session
  const stored = sessionStorage.getItem('cyrabell_user');
  if (stored) {
    try {
      state.user = JSON.parse(stored);
      showApp();
    } catch {
      sessionStorage.removeItem('cyrabell_user');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
window.renderView = renderView; // expose for inline onclicks
