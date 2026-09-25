// ============================================================
// FreshFuel — Admin Panel
// Requires: config.js loaded first, @supabase/supabase-js UMD loaded first.
// ============================================================
'use strict';

(function applyTheme() {
  const t = CONFIG.theme;
  if (!t) return;
  const root = document.documentElement.style;
  const map = {
    '--c-primary': t.colors?.primary, '--c-primary-dark': t.colors?.primaryDark,
    '--c-primary-light': t.colors?.primaryLight, '--c-accent': t.colors?.accent,
    '--c-accent-dark': t.colors?.accentDark, '--c-bg': t.colors?.bg,
    '--c-text': t.colors?.text, '--c-text-2': t.colors?.text2, '--c-text-3': t.colors?.text3,
    '--c-border': t.colors?.border, '--c-border-dark': t.colors?.borderDark,
    '--font-body': t.font?.body,
  };
  Object.entries(map).forEach(([k, v]) => { if (v) root.setProperty(k, v); });
})();

const sb = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function toast(msg, type = '') {
  const host = $('#adminToastHost');
  const t = document.createElement('div');
  t.className = `admin-toast${type ? ' admin-toast--' + type : ''}`;
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

// ── Table configs ─────────────────────────────────────────
const CATEGORY_OPTIONS = ['Classic Bowls', 'Protein Bowls', 'Detox & Green', 'Add-ons']
  .map(c => ({ value: c, label: c }));

const TABLE_CONFIGS = {
  menu_items: {
    label: 'Menu Items', order: [{ col: 'sort_order', asc: true }],
    columns: [
      { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'price', label: 'Price (₹)', type: 'number', required: true },
      { key: 'image_url', label: 'Image URL', type: 'text' },
      { key: 'is_available', label: 'Available', type: 'checkbox', default: true },
      { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    ],
    listColumns: ['category', 'name', 'price', 'is_available', 'sort_order'],
    toggleColumns: ['is_available'],
  },
  packages: {
    label: 'Packages', order: [{ col: 'sort_order', asc: true }],
    columns: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'duration_label', label: 'Duration (e.g. "7 days")', type: 'text', required: true },
      { key: 'bowls_per_day', label: 'Bowls per Day', type: 'number', default: 1 },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'price', label: 'Price (₹)', type: 'number', required: true },
      { key: 'image_url', label: 'Image URL', type: 'text' },
      { key: 'is_active', label: 'Active', type: 'checkbox', default: true },
      { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    ],
    listColumns: ['name', 'duration_label', 'price', 'is_active', 'sort_order'],
    toggleColumns: ['is_active'],
  },
  orders: {
    label: 'Orders', order: [{ col: 'created_at', asc: false }], readOnly: true,
    columns: [
      { key: 'status', label: 'Status', type: 'select', options: [
          { value: 'pending', label: 'Pending' }, { value: 'confirmed', label: 'Confirmed' },
          { value: 'delivered', label: 'Delivered' }, { value: 'cancelled', label: 'Cancelled' } ] },
    ],
    listColumns: ['order_ref', 'customer_name', 'customer_phone', 'total_amount', 'status', 'created_at'],
    statusEditable: true,
  },
  business_settings: {
    label: 'Settings', order: [], singleton: true,
    columns: [
      { key: 'whatsapp_number', label: 'WhatsApp Number (e.g. 91XXXXXXXXXX)', type: 'text', required: true },
      { key: 'upi_id', label: 'UPI ID', type: 'text', required: true },
      { key: 'upi_name', label: 'UPI / Merchant Name', type: 'text', required: true },
      { key: 'delivery_note', label: 'Delivery Note (shown to customers)', type: 'textarea' },
    ],
    listColumns: ['whatsapp_number', 'upi_id'],
  },
};

let State = { view: 'menu_items', rows: [], tableSearch: '', sortKey: null, sortDir: 'asc' };

// ── Auth ──────────────────────────────────────────────────
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) showDashboard(); else showLogin();
}
function showLogin() { $('#loginScreen').hidden = false; $('#dashboard').hidden = true; }
function showDashboard() { $('#loginScreen').hidden = true; $('#dashboard').hidden = false; loadView('menu_items'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  const errEl = $('#loginError');
  const btn = e.target.querySelector('button[type="submit"]');
  errEl.hidden = true;
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign In';
  if (error) { errEl.textContent = error.message; errEl.hidden = false; return; }
  showDashboard();
});
$('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); showLogin(); });

// ── Mobile sidebar ────────────────────────────────────────
function setSidebarOpen(open) {
  $('.admin-sidebar')?.classList.toggle('open', open);
  $('#sidebarBackdrop')?.classList.toggle('show', open);
  $('#menuToggle')?.classList.toggle('is-hidden', open);
}
$('#menuToggle')?.addEventListener('click', () => setSidebarOpen(true));
$('#sidebarClose')?.addEventListener('click', () => setSidebarOpen(false));
$('#sidebarBackdrop')?.addEventListener('click', () => setSidebarOpen(false));

// ── Nav ───────────────────────────────────────────────────
$('#adminNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-nav-btn');
  if (!btn) return;
  $$('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  setSidebarOpen(false);
  State.tableSearch = ''; State.sortKey = null; State.sortDir = 'asc';
  loadView(btn.dataset.view);
});

// ── Load + render a table view ───────────────────────────
async function loadView(view) {
  State.view = view;
  const cfg = TABLE_CONFIGS[view];
  $('#viewTitle').textContent = cfg.label;
  $('#addBtn').hidden = !!cfg.readOnly || !!cfg.singleton;
  const body = $('#viewBody');
  body.innerHTML = '<div class="admin-loading"><div class="admin-spinner"></div>Loading…</div>';

  try {
    let q = sb.from(view).select('*');
    (cfg.order || []).forEach(o => { q = q.order(o.col, { ascending: o.asc }); });
    const { data, error } = await q;
    if (error) throw error;
    State.rows = data || [];

    if (cfg.singleton) {
      $('#addBtn').hidden = true;
      renderSingletonForm(cfg, data && data[0]);
      return;
    }
    renderTable(cfg, State.rows);
  } catch (err) {
    body.innerHTML = `<div class="admin-empty">⚠️ Could not load ${esc(cfg.label)}: ${esc(err.message)}</div>`;
  }
}

function getVisibleRows(cfg) {
  const cols = cfg.listColumns;
  let rows = State.rows;
  if (State.tableSearch.trim()) {
    const term = State.tableSearch.trim().toLowerCase();
    rows = rows.filter(r => cols.some(c => String(r[c] ?? '').toLowerCase().includes(term)));
  }
  if (State.sortKey) {
    const dir = State.sortDir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      let av = a[State.sortKey], bv = b[State.sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }
  return rows;
}

function renderTable(cfg, allRows) {
  const body = $('#viewBody');
  const cols = cfg.listColumns;
  const rows = getVisibleRows(cfg);

  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-toolbar__search">
        <span class="admin-toolbar__search-icon">🔎</span>
        <input type="search" id="tableSearchInput" placeholder="Search ${esc(cfg.label.toLowerCase())}…" value="${esc(State.tableSearch)}">
      </div>
      <div class="admin-toolbar__meta">
        <span class="admin-toolbar__count">${rows.length} of ${allRows.length}</span>
        <button class="admin-btn-sm" id="exportCsvBtn" ${!allRows.length ? 'disabled' : ''}>⬇ CSV</button>
      </div>
    </div>
    ${!rows.length
      ? `<div class="admin-empty">${allRows.length ? '🔍 No results match your search.' : `No ${esc(cfg.label.toLowerCase())} yet. Click "+ Add" to create one.`}</div>`
      : `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          ${cols.map(c => `<th class="sortable ${State.sortKey===c?'sorted-'+State.sortDir:''}" data-sort="${c}">${esc(colLabel(cfg, c))}<span class="sort-arrow"></span></th>`).join('')}
          <th class="actions-col">Actions</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${r.id}">
              ${cols.map(c => `<td data-label="${esc(colLabel(cfg, c))}">${renderCell(cfg, c, r)}</td>`).join('')}
              <td class="actions" data-label="Actions">${renderRowActions(cfg, r)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;

  body.querySelectorAll('[data-act]').forEach(el => {
    el.addEventListener('click', () => handleRowAction(cfg, el.dataset.act, el.dataset.id));
  });
  if (cfg.statusEditable) {
    body.querySelectorAll('select[data-status-id]').forEach(sel => {
      sel.addEventListener('change', () => updateOrderStatus(sel.dataset.statusId, sel.value));
    });
  }
  body.querySelectorAll('[data-toggle-id]').forEach(btn => {
    btn.addEventListener('click', () => toggleField(cfg, btn.dataset.toggleId, btn.dataset.toggleCol, btn.dataset.toggleVal === 'true'));
  });

  const searchInput = $('#tableSearchInput');
  searchInput?.addEventListener('input', () => {
    State.tableSearch = searchInput.value;
    const pos = searchInput.selectionStart;
    renderTable(cfg, allRows);
    const el = $('#tableSearchInput');
    el.focus(); el.setSelectionRange(pos, pos);
  });

  body.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      State.sortDir = (State.sortKey === key && State.sortDir === 'asc') ? 'desc' : 'asc';
      State.sortKey = key;
      renderTable(cfg, allRows);
    });
  });

  $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(cfg));
}

function exportCsv(cfg) {
  const cols = cfg.listColumns;
  const rows = getVisibleRows(cfg);
  const headers = cols.map(c => colLabel(cfg, c));
  const data = rows.map(r => cols.map(c => {
    const v = r[c];
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (c === 'created_at' && v) return new Date(v).toLocaleString('en-IN');
    return v ?? '';
  }));
  const escCsv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers, ...data].map(row => row.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${State.view}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
}

function colLabel(cfg, key) {
  const c = cfg.columns.find(c => c.key === key);
  return c ? c.label.replace(/\s*\(.*?\)/, '') : key.replace(/_/g, ' ');
}

function renderCell(cfg, key, row) {
  const val = row[key];
  if (key === 'status' && cfg.statusEditable) {
    const opts = cfg.columns.find(c => c.key === 'status').options;
    return `<select data-status-id="${row.id}" class="admin-pill-select admin-pill-select--${val}">${opts.map(o => `<option value="${o.value}" ${o.value===val?'selected':''}>${o.label}</option>`).join('')}</select>`;
  }
  if (typeof val === 'boolean' && cfg.toggleColumns?.includes(key)) {
    return `<button type="button" class="admin-pill admin-pill--${val ? 'yes' : 'no'} admin-pill--toggle"
              data-toggle-id="${row.id}" data-toggle-col="${key}" data-toggle-val="${val}"
              title="Click to mark ${val ? 'unavailable' : 'available'}">${val ? '✓ Yes' : '✕ No'}</button>`;
  }
  if (key === 'created_at' && val) return new Date(val).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  if (typeof val === 'boolean') return `<span class="admin-pill admin-pill--${val ? 'yes' : 'no'}">${val ? '✓ Yes' : '✕ No'}</span>`;
  if (key === 'total_amount' && val != null) return `₹${Number(val).toFixed(0)}`;
  if (key === 'price' && val != null) return `₹${Number(val).toFixed(0)}`;
  if (val && typeof val === 'string' && val.length > 60) return `<span title="${esc(val)}">${esc(val.slice(0, 60))}…</span>`;
  return esc(val ?? '—');
}

function renderRowActions(cfg, row) {
  let html = '';
  if (!cfg.readOnly) {
    html += `<button class="admin-btn-sm" data-act="edit" data-id="${row.id}">✎ Edit</button>`;
    html += `<button class="admin-btn-sm admin-btn-sm--danger" data-act="delete" data-id="${row.id}">🗑</button>`;
  } else if (cfg.statusEditable) {
    html += `<button class="admin-btn-sm" data-act="view" data-id="${row.id}">👁 View Items</button>`;
  }
  return html;
}

async function handleRowAction(cfg, act, id) {
  const row = State.rows.find(r => String(r.id) === String(id));
  if (act === 'edit') return openRecordModal(cfg, row);
  if (act === 'view') {
    const items = (row.items || []).map(i => `• ${i.name} x${i.qty} — ₹${i.price * i.qty}`).join('\n');
    alert(`Order ${row.order_ref || row.id}\n\n${items}\n\nDelivery: ${row.customer_address || '—'}`);
    return;
  }
  if (act === 'delete') {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    const { error } = await sb.from(State.view).delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    toast('Deleted.');
    loadView(State.view);
  }
}

async function updateOrderStatus(id, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Order status updated.');
}

async function toggleField(cfg, id, col, currentVal) {
  const newVal = !currentVal;
  const { error } = await sb.from(State.view).update({ [col]: newVal }).eq('id', id);
  if (error) return toast(error.message, 'error');
  const row = State.rows.find(r => String(r.id) === String(id));
  if (row) row[col] = newVal;
  const label = col === 'is_available' ? (newVal ? 'available' : 'sold out') : (newVal ? 'active' : 'inactive');
  toast(`Marked ${label}.`);
  renderTable(cfg, State.rows);
}

// ── Add / Edit modal ──────────────────────────────────────
$('#addBtn').addEventListener('click', () => openRecordModal(TABLE_CONFIGS[State.view], null));
$('#recordModalClose').addEventListener('click', () => $('#recordModal').hidden = true);

function openRecordModal(cfg, row) {
  $('#recordModalTitle').textContent = row ? `Edit ${cfg.label}` : `Add ${cfg.label}`;
  const form = $('#recordForm');
  form.innerHTML = cfg.columns.map(c => fieldHTML(c, row)).join('') +
    `<div class="admin-form-actions">
       <button type="submit" class="btn btn--primary btn--sm">Save</button>
       <button type="button" class="btn btn--outline btn--sm" id="recordCancelBtn">Cancel</button>
     </div>`;
  $('#recordCancelBtn').onclick = () => $('#recordModal').hidden = true;
  form.onsubmit = (e) => saveRecord(e, cfg, row);
  $('#recordModal').hidden = false;
}

function fieldHTML(col, row) {
  const val = row ? row[col.key] : (col.default ?? '');
  const req = col.required ? 'required' : '';
  if (col.type === 'checkbox') {
    return `<div class="admin-field admin-field--checkbox">
      <input type="checkbox" id="f_${col.key}" ${val ? 'checked' : ''}>
      <label for="f_${col.key}">${esc(col.label)}</label>
    </div>`;
  }
  if (col.type === 'textarea') {
    return `<div class="admin-field"><label>${esc(col.label)}</label>
      <textarea id="f_${col.key}" ${req}>${esc(val)}</textarea></div>`;
  }
  if (col.type === 'select') {
    const opts = col.options || [];
    return `<div class="admin-field"><label>${esc(col.label)}</label>
      <select id="f_${col.key}" ${req}>
        <option value="">— Select —</option>
        ${opts.map(o => `<option value="${esc(o.value)}" ${String(o.value)===String(val)?'selected':''}>${esc(o.label)}</option>`).join('')}
      </select></div>`;
  }
  return `<div class="admin-field"><label>${esc(col.label)}</label>
    <input type="${col.type}" id="f_${col.key}" value="${esc(val)}" ${req}></div>`;
}

async function saveRecord(e, cfg, row) {
  e.preventDefault();
  const payload = {};
  cfg.columns.forEach(c => {
    const el = $(`#f_${c.key}`);
    if (!el) return;
    if (c.type === 'checkbox') payload[c.key] = el.checked;
    else if (c.type === 'number') payload[c.key] = el.value === '' ? null : Number(el.value);
    else payload[c.key] = el.value === '' ? null : el.value;
  });

  const table = State.view;
  const { error } = row
    ? await sb.from(table).update(payload).eq('id', row.id)
    : await sb.from(table).insert(payload);

  if (error) return toast(error.message, 'error');
  toast(row ? 'Updated.' : 'Created.');
  $('#recordModal').hidden = true;
  loadView(table);
}

// ── Singleton form (business_settings) ───────────────────
function renderSingletonForm(cfg, row) {
  const body = $('#viewBody');
  body.innerHTML = `<form id="singletonForm" style="max-width:480px;background:var(--c-surface);padding:24px;border-radius:12px;">
    ${cfg.columns.map(c => fieldHTML(c, row)).join('')}
    <button type="submit" class="btn btn--primary btn--sm">Save</button>
  </form>`;
  $('#singletonForm').onsubmit = async (e) => {
    e.preventDefault();
    const payload = {};
    cfg.columns.forEach(c => {
      const el = $(`#f_${c.key}`);
      payload[c.key] = c.type === 'checkbox' ? el.checked : (el.value || null);
    });
    const { error } = row
      ? await sb.from(State.view).update(payload).eq('id', row.id)
      : await sb.from(State.view).insert(payload);
    if (error) return toast(error.message, 'error');
    toast('Saved.');
    loadView(State.view);
  };
}

checkSession();
