'use strict';

// ─── Lightweight Supabase REST wrapper (no SDK needed on the storefront) ─
const _cache = new Map();
const db = (() => {
  async function request(table, params, opts = {}) {
    const key = table + JSON.stringify(params);
    if (!opts.skipCache && _cache.has(key)) {
      const hit = _cache.get(key);
      if (Date.now() - hit.t < CONFIG.cache.ttlMs) return hit.v;
    }
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${CONFIG.supabase.url}/rest/v1/${table}?${qs}`, {
      headers: {
        apikey: CONFIG.supabase.anonKey,
        Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
        ...(opts.headers || {}),
      },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) throw new Error(`Supabase ${table} request failed: ${res.status}`);
    const data = res.status === 204 ? null : await res.json();
    if (!opts.skipCache && (opts.method || 'GET') === 'GET') _cache.set(key, { t: Date.now(), v: data });
    return data;
  }
  return {
    from(table) {
      const params = { select: '*' };
      const builder = {
        select(cols) { params.select = cols; return builder; },
        eq(col, val) { params[col] = `eq.${val}`; return builder; },
        order(col, { ascending = true } = {}) { params.order = `${col}.${ascending ? 'asc' : 'desc'}`; return builder; },
        limit(n) { params.limit = n; return builder; },
        async execute() { return request(table, params); },
        async insert(row) {
          return request(table, {}, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: row,
            skipCache: true,
          }).then(r => Array.isArray(r) ? r[0] : r);
        },
      };
      return builder;
    },
  };
})();

// ─── State ──────────────────────────────────────────────────────
const State = {
  menuItems: [], packages: [], businessSettings: null,
  activeCategory: 'All', cart: [], lastOrderRef: null,
};

function applyTheme() {
  const c = CONFIG.theme.colors;
  const root = document.documentElement.style;
  root.setProperty('--c-primary', c.primary);
  root.setProperty('--c-primary-dark', c.primaryDark);
  root.setProperty('--c-primary-light', c.primaryLight);
  root.setProperty('--c-accent', c.accent);
  root.setProperty('--c-accent-dark', c.accentDark);
  root.setProperty('--c-bg', c.bg);
  root.setProperty('--c-text', c.text);
  root.setProperty('--c-text-2', c.text2);
  root.setProperty('--c-text-3', c.text3);
  root.setProperty('--c-border', c.border);
  root.setProperty('--c-border-dark', c.borderDark);
}

function fmt(n) { return `${CONFIG.business.currency}${Number(n).toFixed(0)}`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function openModal(id) {
  document.getElementById(id)?.classList.add('modal--open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('modal--open');
  if (!document.querySelector('.modal--open')) document.body.style.overflow = '';
}
document.addEventListener('click', (e) => {
  const m = e.target.closest('.modal');
  if (m && e.target === m) closeModal(m.id);
});

// ─── Router (tab-based, mirrors a mobile app's bottom nav) ───────
const Router = (() => {
  const pages = ['home', 'menu', 'packages', 'contact'];
  function current() { return (location.hash.replace('#', '') || '/').split('?')[0]; }
  function navigate(path) { location.hash = path; }
  function dispatch() {
    const path = current();
    const slug = path === '/' ? 'home' : path.replace('/', '');
    pages.forEach(p => {
      const el = document.getElementById(`${p}-page`);
      if (el) el.hidden = (p !== slug);
    });
    document.querySelectorAll('[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === path);
    });
    if (slug === 'menu') renderMenuPage();
    if (slug === 'packages') renderPackagesPage();
    if (slug === 'contact') renderContactPage();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', dispatch);
  return { navigate, dispatch };
})();
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (link) { e.preventDefault(); Router.navigate(link.dataset.route); }
});

// ─── Data loading ─────────────────────────────────────────────
async function loadData() {
  try { State.menuItems = await db.from('menu_items').select('*').order('sort_order').execute(); }
  catch (err) { console.error('menu_items load failed', err); State.menuItems = []; }
  try { State.packages = await db.from('packages').select('*').eq('is_active', true).order('sort_order').execute(); }
  catch (err) { console.error('packages load failed', err); State.packages = []; }
  try {
    const rows = await db.from('business_settings').select('*').limit(1).execute();
    State.businessSettings = rows?.[0] || null;
  } catch { State.businessSettings = null; }
}

function getUpi() {
  return {
    id: State.businessSettings?.upi_id || CONFIG.upi.id,
    name: State.businessSettings?.upi_name || CONFIG.upi.name,
  };
}
function getWhatsapp() { return State.businessSettings?.whatsapp_number || CONFIG.whatsapp.number; }

// ─── Real trust stats (no invented numbers) ──────────────────
async function renderTrustStats() {
  let orders = [];
  try { orders = await db.from('orders').select('id').execute(); } catch { orders = []; }
  const statOrders = document.getElementById('statOrders');
  if (statOrders) statOrders.textContent = orders.length > 0 ? `${orders.length}+` : 'New';
  const statItems = document.getElementById('statItems');
  if (statItems) statItems.textContent = State.menuItems.length || '—';
}

// ─── Home page ────────────────────────────────────────────────
function renderHomePreviews() {
  const menuPrev = document.getElementById('homeMenuPreview');
  const available = State.menuItems.filter(m => m.is_available).slice(0, 4);
  menuPrev.innerHTML = available.length
    ? available.map(menuCardHtml).join('')
    : '<p class="empty-msg">Menu coming soon.</p>';

  const pkgPrev = document.getElementById('homePackagePreview');
  pkgPrev.innerHTML = State.packages.length
    ? State.packages.slice(0, 3).map(packageCardHtml).join('')
    : '<p class="empty-msg">Plans coming soon.</p>';
}

function menuCardHtml(m) {
  const img = m.image_url ? `<img src="${esc(m.image_url)}" alt="${esc(m.name)}">` : '🍓';
  return `
    <div class="menu-card" data-id="${m.id}" data-type="menu">
      <div class="menu-card__img">${img}</div>
      <div class="menu-card__body">
        <div class="menu-card__name">${esc(m.name)}</div>
        <div class="menu-card__desc">${esc(m.description || '')}</div>
        <div class="menu-card__foot">
          <span class="price">${fmt(m.price)}</span>
          <button class="add-btn" data-add="${m.id}" data-type="menu" ${!m.is_available ? 'disabled' : ''}>${m.is_available ? '+' : '✕'}</button>
        </div>
      </div>
    </div>`;
}
function packageCardHtml(p) {
  const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : '📦';
  return `
    <div class="package-card" data-id="${p.id}" data-type="package">
      <div class="package-card__img">${img}</div>
      <div class="package-card__body">
        <span class="badge-duration">${esc(p.duration_label)}</span>
        <div class="package-card__name">${esc(p.name)}</div>
        <div class="menu-card__desc">${esc(p.description || '')}</div>
        <div class="menu-card__foot">
          <span class="price">${fmt(p.price)}</span>
          <button class="add-btn" data-add="${p.id}" data-type="package">+</button>
        </div>
      </div>
    </div>`;
}

// ─── Menu page (with category chips) ───────────────────────────
function renderMenuPage() {
  const cats = ['All', ...new Set(State.menuItems.map(m => m.category))];
  document.getElementById('menuChips').innerHTML = cats.map(c =>
    `<button class="chip ${c === State.activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join('');
  renderMenuGrid();
}
function renderMenuGrid() {
  const items = State.activeCategory === 'All'
    ? State.menuItems
    : State.menuItems.filter(m => m.category === State.activeCategory);
  document.getElementById('menuGrid').innerHTML = items.length
    ? items.map(menuCardHtml).join('')
    : '<p class="empty-msg">No items in this category yet.</p>';
}
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) { State.activeCategory = chip.dataset.cat; renderMenuPage(); }
});

// ─── Packages page ──────────────────────────────────────────
function renderPackagesPage() {
  document.getElementById('packagesGrid').innerHTML = State.packages.length
    ? State.packages.map(packageCardHtml).join('')
    : '<p class="empty-msg">Plans coming soon.</p>';
}

// ─── Contact page ───────────────────────────────────────────
function renderContactPage() {
  document.getElementById('contactWhatsapp').textContent = CONFIG.business.phone;
  document.getElementById('contactEmail').textContent = CONFIG.business.email;
  document.getElementById('contactAddress').textContent = CONFIG.business.address;
  document.getElementById('contactNote').textContent = State.businessSettings?.delivery_note || CONFIG.business.deliveryNote;
  document.getElementById('contactInstagramLink').href = CONFIG.business.instagram;
  document.getElementById('contactWaLink').href = `https://wa.me/${getWhatsapp()}`;
}

// ─── Item detail modal ──────────────────────────────────────
document.addEventListener('click', (e) => {
  const addBtn = e.target.closest('[data-add]');
  if (addBtn) { e.stopPropagation(); addToCart(addBtn.dataset.add, addBtn.dataset.type); return; }
  const card = e.target.closest('.menu-card, .package-card');
  if (card) { openItemModal(card.dataset.id, card.dataset.type); return; }
  if (e.target.closest('#cartIconBtn')) { openModal('cartModal'); return; }
});
function findItem(id, type) {
  const list = type === 'package' ? State.packages : State.menuItems;
  return list.find(x => String(x.id) === String(id));
}
function openItemModal(id, type) {
  const item = findItem(id, type);
  if (!item) return;
  const img = item.image_url ? `<img src="${esc(item.image_url)}" style="width:100%;border-radius:var(--r-md);margin-bottom:14px;">` : '';
  document.getElementById('itemModalBody').innerHTML = `
    ${img}
    ${type === 'package' ? `<span class="badge-duration">${esc(item.duration_label)}</span>` : ''}
    <h2 class="modal-title" style="margin-top:8px;">${esc(item.name)}</h2>
    <p style="color:var(--c-text-2);margin-bottom:14px;">${esc(item.description || '')}</p>
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span class="price" style="font-size:1.3rem;">${fmt(item.price)}</span>
      <button class="btn btn--primary" data-add="${item.id}" data-type="${type}" ${type==='menu' && !item.is_available ? 'disabled' : ''}>
        ${type==='menu' && !item.is_available ? 'Out of Stock' : 'Add to Order'}
      </button>
    </div>`;
  openModal('itemModal');
}

// ─── Cart ───────────────────────────────────────────────────
function addToCart(id, type) {
  const item = findItem(id, type);
  if (!item) return;
  const existing = State.cart.find(c => c.id === id && c.type === type);
  if (existing) existing.qty++;
  else State.cart.push({ id, type, name: item.name, price: Number(item.price), qty: 1 });
  renderCart();
  showToast(`Added ${item.name} to your order`);
  closeModal('itemModal');
}
function changeQty(id, type, delta) {
  const line = State.cart.find(c => c.id === id && c.type === type);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) State.cart = State.cart.filter(c => !(c.id === id && c.type === type));
  renderCart();
}
function cartTotal() { return State.cart.reduce((s, c) => s + c.price * c.qty, 0); }
function cartCount() { return State.cart.reduce((s, c) => s + c.qty, 0); }
function renderCart() {
  const count = cartCount();
  document.getElementById('cartBadge').hidden = count === 0;
  document.getElementById('cartBadge').textContent = count;
  document.getElementById('cartBar').hidden = count === 0;
  document.getElementById('cartBarCount').textContent = count;
  document.getElementById('cartBarTotal').textContent = fmt(cartTotal());

  const linesEl = document.getElementById('cartLines');
  linesEl.innerHTML = State.cart.length ? State.cart.map(c => `
    <div class="cart-line">
      <div><div style="font-weight:600;">${esc(c.name)}</div><div style="font-size:.8rem;color:var(--c-text-2);">${fmt(c.price)} each</div></div>
      <div class="cart-line__qty">
        <button class="qty-btn" data-qty="-1" data-id="${c.id}" data-type="${c.type}">−</button>
        <span>${c.qty}</span>
        <button class="qty-btn" data-qty="1" data-id="${c.id}" data-type="${c.type}">+</button>
      </div>
    </div>`).join('') : '<p class="empty-msg">Your cart is empty.</p>';

  document.getElementById('cartModalTotal').hidden = !State.cart.length;
  document.getElementById('cartModalTotalAmt').textContent = fmt(cartTotal());
  document.getElementById('cartCheckoutBtn').hidden = !State.cart.length;
}
document.addEventListener('click', (e) => {
  const q = e.target.closest('[data-qty]');
  if (q) changeQty(q.dataset.id, q.dataset.type, Number(q.dataset.qty));
});

// ─── Checkout: insert order, get real reference, open WhatsApp ─
document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  if (!name || !phone || !address) return;

  const items = State.cart.map(c => ({ type: c.type, name: c.name, qty: c.qty, price: c.price }));
  const total = cartTotal();

  let orderRef;
  try {
    const inserted = await db.from('orders').insert({
      customer_name: name, customer_phone: phone, customer_address: address,
      items, total_amount: total, status: 'pending',
    });
    orderRef = `FF-${String(inserted?.id ?? '').padStart(4, '0')}`;
  } catch (err) {
    console.error('Order insert failed:', err);
    orderRef = `FF-${Date.now().toString(36).toUpperCase()}`;
  }
  State.lastOrderRef = orderRef;

  const lines = items.map(i => `• ${i.name} x${i.qty} — ${fmt(i.price * i.qty)}`).join('\n');
  const msg = encodeURIComponent(
`Hi FreshFuel! 🍓 I'd like to place an order.

*Order Reference:* ${orderRef}

${lines}

*Total: ${fmt(total)}*

*Delivery Details:*
Name: ${name}
Phone: ${phone}
Address: ${address}

Please confirm and share payment details. 🙏`
  );

  closeModal('checkoutModal');
  closeModal('cartModal');
  showToast('Order sent! Opening WhatsApp…');
  setTimeout(() => {
    openPaymentModal(total);
    window.open(`https://wa.me/${getWhatsapp()}?text=${msg}`, '_blank');
  }, 600);
});

// ─── Payment modal (UPI QR + WhatsApp confirmation) ────────────
function openPaymentModal(amount) {
  const upi = getUpi();
  const m = document.getElementById('paymentModal');
  m.querySelector('.payment-order-ref').textContent = State.lastOrderRef || '';
  m.querySelector('.payment-upi-id').textContent = upi.id;
  const note = encodeURIComponent(State.lastOrderRef || 'FreshFuel order');
  m.querySelector('.payment-qr').src =
    `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=upi://pay?pa=${encodeURIComponent(upi.id)}&pn=${encodeURIComponent(upi.name)}&am=${amount}&tn=${note}`;
  openModal('paymentModal');
}
function copyUPI() {
  const upi = document.querySelector('.payment-upi-id')?.textContent;
  if (!upi) return;
  navigator.clipboard.writeText(upi).then(() => showToast('UPI ID copied!')).catch(() => showToast('UPI: ' + upi));
}
function confirmPayment() {
  const ref = State.lastOrderRef || 'unknown';
  const msg = encodeURIComponent(`Payment done ✅\n\nOrder Reference: ${ref}\n\nSharing my payment confirmation.`);
  window.open(`https://wa.me/${getWhatsapp()}?text=${msg}`, '_blank');
  closeModal('paymentModal');
}
window.openModal = openModal;
window.closeModal = closeModal;
window.copyUPI = copyUPI;
window.confirmPayment = confirmPayment;

// ─── Init ───────────────────────────────────────────────────
(async function init() {
  applyTheme();
  await loadData();
  renderHomePreviews();
  renderTrustStats();
  renderCart();
  Router.dispatch();
})();
