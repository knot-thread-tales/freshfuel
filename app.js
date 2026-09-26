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

// ─── Fallback icons (used only when an item has no photo yet) ───
// Relevant per category rather than one generic fruit/box emoji for everything.
const ICONS = {
  'Classic Bowls': '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/></svg>', // citrus-slice
  'Protein Bowls': '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/></svg>', // dumbbell
  'Detox & Green': '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4-1-8-5-8-11 6 0 10 4 10 10 0 .3 0 .7-.05 1z"/><path d="M12 21c0-9 4-13 9-15-1 8-4 13-9 15z"/></svg>', // leaf
  'Add-ons': '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>', // plus-in-circle
  _menuDefault: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21c0-5 3.5-9 8-9s8 4 8 9"/><path d="M12 12V3"/><path d="M9 6c0-2 1.3-3 3-3s3 1 3 3"/></svg>', // bowl (matches Menu tab)
  package: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>', // box (matches Packages tab)
};
function categoryIcon(category) { return ICONS[category] || ICONS._menuDefault; }

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

function skeletonCards(n = 4) {
  return `<div class="card-grid">${'<div class="menu-card skeleton"><div class="menu-card__img"></div><div class="menu-card__body"><div class="sk-line sk-line--sm"></div><div class="sk-line sk-line--xs"></div></div></div>'.repeat(n)}</div>`;
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
  const img = m.image_url ? `<img src="${esc(m.image_url)}" alt="${esc(m.name)}" loading="lazy">` : categoryIcon(m.category);
  const soldOut = !m.is_available;
  return `
    <div class="menu-card ${soldOut ? 'is-unavailable' : ''}" data-id="${m.id}" data-type="menu" tabindex="0" role="button" aria-label="${esc(m.name)}, ${fmt(m.price)}${soldOut ? ', sold out today' : ''}">
      <div class="menu-card__img">${img}${soldOut ? '<span class="sold-out-badge">Sold Out Today</span>' : ''}</div>
      <div class="menu-card__body">
        <div class="menu-card__name">${esc(m.name)}</div>
        <div class="menu-card__desc">${esc(m.description || '')}</div>
        <div class="menu-card__foot">
          <span class="price">${fmt(m.price)}</span>
          <button class="add-btn" data-add="${m.id}" data-type="menu" ${soldOut ? 'disabled' : ''}>${soldOut ? '✕' : '+'}</button>
        </div>
      </div>
    </div>`;
}
function packageCardHtml(p) {
  const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : ICONS.package;
  return `
    <div class="package-card" data-id="${p.id}" data-type="package" tabindex="0" role="button" aria-label="${esc(p.name)}, ${fmt(p.price)}">
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
  const items = (State.activeCategory === 'All'
    ? State.menuItems
    : State.menuItems.filter(m => m.category === State.activeCategory))
    .slice()
    .sort((a, b) => (a.is_available === b.is_available) ? 0 : (a.is_available ? -1 : 1));
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.menu-card, .package-card');
  if (card) { e.preventDefault(); openItemModal(card.dataset.id, card.dataset.type); }
});
function findItem(id, type) {
  const list = type === 'package' ? State.packages : State.menuItems;
  return list.find(x => String(x.id) === String(id));
}
function openItemModal(id, type) {
  const item = findItem(id, type);
  if (!item) return;
  const soldOut = type === 'menu' && !item.is_available;
  const img = item.image_url ? `<img src="${esc(item.image_url)}" style="width:100%;border-radius:var(--r-md);margin-bottom:14px;${soldOut ? 'filter:grayscale(60%);opacity:.7;' : ''}">` : '';
  document.getElementById('itemModalBody').innerHTML = `
    ${img}
    ${type === 'package' ? `<span class="badge-duration">${esc(item.duration_label)}</span>` : ''}
    <h2 class="modal-title" style="margin-top:8px;">${esc(item.name)}</h2>
    <p style="color:var(--c-text-2);margin-bottom:14px;">${esc(item.description || '')}</p>
    ${soldOut ? '<p style="color:var(--c-error);font-weight:600;font-size:.88rem;margin-bottom:14px;">😔 Sold out for today — check back tomorrow, or ask us directly if you\'re at the stall.</p>' : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span class="price" style="font-size:1.3rem;">${fmt(item.price)}</span>
      <button class="btn btn--primary" data-add="${item.id}" data-type="${type}" ${soldOut ? 'disabled' : ''}>
        ${soldOut ? 'Out of Stock' : 'Add to Order'}
      </button>
    </div>`;
  openModal('itemModal');
}

// ─── Cart persistence (survives a refresh/closed tab until checkout) ─
const CART_KEY = 'freshfuel_cart_v1';
function saveCartToStorage() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(State.cart)); } catch { /* private mode etc — cart just won't persist */ }
}
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    State.cart = raw ? JSON.parse(raw) : [];
  } catch { State.cart = []; }
}
function clearCartStorage() {
  try { localStorage.removeItem(CART_KEY); } catch { /* ignore */ }
}
// A cart saved yesterday might reference an item that's now deleted, renamed,
// re-priced, or sold out — reconcile against the freshly-loaded catalog
// rather than silently charging or WhatsApp-ing a stale price.
function reconcileCartWithCatalog() {
  const removed = [];
  State.cart = State.cart.filter(c => {
    const item = findItem(c.id, c.type);
    if (!item) { removed.push(c.name); return false; }
    if (c.type === 'menu' && !item.is_available) { removed.push(c.name); return false; }
    c.price = Number(item.price); // keep the price in sync with any admin change
    c.name = item.name;
    return true;
  });
  if (removed.length) {
    saveCartToStorage();
    showToast(`Removed from your cart (no longer available): ${removed.join(', ')}`);
  }
}

// ─── Cart ───────────────────────────────────────────────────
function addToCart(id, type) {
  const item = findItem(id, type);
  if (!item) return;
  const existing = State.cart.find(c => c.id === id && c.type === type);
  if (existing) existing.qty++;
  else State.cart.push({ id, type, name: item.name, price: Number(item.price), qty: 1 });
  saveCartToStorage();
  renderCart();
  showToast(`Added ${item.name} to your order`);
  closeModal('itemModal');
}
function changeQty(id, type, delta) {
  const line = State.cart.find(c => c.id === id && c.type === type);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) State.cart = State.cart.filter(c => !(c.id === id && c.type === type));
  saveCartToStorage();
  renderCart();
}
function removeLine(id, type) {
  State.cart = State.cart.filter(c => !(c.id === id && c.type === type));
  saveCartToStorage();
  renderCart();
}
function clearCart() {
  if (State.cart.length && !confirm('Remove all items from your cart?')) return;
  State.cart = [];
  saveCartToStorage();
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
        <button class="qty-btn" data-qty="-1" data-id="${c.id}" data-type="${c.type}" aria-label="Decrease quantity">−</button>
        <span>${c.qty}</span>
        <button class="qty-btn" data-qty="1" data-id="${c.id}" data-type="${c.type}" aria-label="Increase quantity">+</button>
        <button class="qty-btn cart-line__remove" data-remove="${c.id}" data-type="${c.type}" aria-label="Remove ${esc(c.name)}" title="Remove">🗑</button>
      </div>
    </div>`).join('') : '<p class="empty-msg">Your cart is empty.</p>';

  document.getElementById('cartModalTotal').hidden = !State.cart.length;
  document.getElementById('cartModalTotalAmt').textContent = fmt(cartTotal());
  document.getElementById('cartCheckoutBtn').hidden = !State.cart.length;
  const clearBtn = document.getElementById('cartClearBtn');
  if (clearBtn) clearBtn.hidden = !State.cart.length;
}
document.addEventListener('click', (e) => {
  const q = e.target.closest('[data-qty]');
  if (q) changeQty(q.dataset.id, q.dataset.type, Number(q.dataset.qty));
  const rm = e.target.closest('[data-remove]');
  if (rm) removeLine(rm.dataset.remove, rm.dataset.type);
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
`Hi FreshFuel! 🥣 I'd like to place an order.

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
  State.cart = [];
  clearCartStorage();
  renderCart();
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
window.clearCart = clearCart;

// ─── PWA: service worker + install prompt ──────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW registration failed:', err));
  });
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.hidden = false;
});
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#installAppBtn') || !deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') document.getElementById('installAppBtn').hidden = true;
  deferredInstallPrompt = null;
});
window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.hidden = true;
  showToast('FreshFuel added to your home screen! 🎉');
});

// ─── Init ───────────────────────────────────────────────────
(async function init() {
  applyTheme();
  loadCartFromStorage();
  document.getElementById('homeMenuPreview').innerHTML = skeletonCards(4);
  document.getElementById('homePackagePreview').innerHTML = skeletonCards(2);
  await loadData();
  reconcileCartWithCatalog();
  renderHomePreviews();
  renderTrustStats();
  renderCart();
  Router.dispatch();
})();
