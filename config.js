// ============================================================
// FreshFuel — Configuration
// ============================================================

const CONFIG = {
  site: {
    // ⚠️ PLACEHOLDER — update once you know your actual GitHub repo/Pages
    // path, e.g. 'https://<your-username>.github.io/freshfuel/'
    baseUrl: 'https://knot-thread-tales.github.io/freshfuel/',
  },
  supabase: {
    // ⚠️ PLACEHOLDER — this MUST be a NEW Supabase project, not the
    // Knot & Thread Tales one. Different business, different data,
    // different free-tier quota. Create one at supabase.com (free),
    // run database.sql in its SQL Editor, then paste its real
    // URL + anon/publishable key here (Settings → API in that project).
    url: 'https://eynalejlgmmdwrvpjtut.supabase.co',
    anonKey: 'sb_publishable_zczHPXGBf4bJGvkzA0LLxg_ji9-gBIG',
  },
  whatsapp: {
    // Same contact number as requested — update if FreshFuel should
    // actually run on a different number than Knot & Thread Tales.
    number: '917075636381',
    businessName: 'FreshFuel',
  },
  upi: {
    // Same UPI ID as requested. Change this if FreshFuel needs to
    // settle into a different account than your crochet business.
    id: 'rakeshroy001@icici',
    name: 'FreshFuel',
  },
  business: {
    name: 'FreshFuel',
    tagline: 'Real fruit. Real fuel. Delivered fresh.',
    email: 'knotthreadtales@gmail.com', // same email as requested — update if FreshFuel needs its own inbox
    phone: '+91 70756 36381',
    address: 'Hyderabad, Telangana, India',
    // ⚠️ PLACEHOLDER — Instagram is a brand-specific identity, not a
    // shared contact detail, so this needs a real new handle once you
    // create one for FreshFuel (can't reuse @knotandthreadtales here).
    instagram: 'https://instagram.com/freshfuel_hyderabad',
    currency: '₹',
    deliveryNote: 'Made fresh to order — delivered same-day within Hyderabad.',
  },
  cart: {
    // Cart lives in memory only (no login), so it's cleared on refresh —
    // fine for a same-day, order-ahead-a-few-hours food business.
  },
  cache: {
    ttlMs: 2 * 60 * 1000, // shorter than a handmade-goods site: stock/availability changes daily here
  },
  // ── Theme ──────────────────────────────────────────────────
  // Fresh/healthy palette: leafy green primary, mango-orange accent,
  // warm off-white background. Edit here to re-theme — no need to
  // touch styles.css, applyTheme() in app.js pushes these onto :root.
  theme: {
    colors: {
      primary:      '#2E8B57',   // sea green
      primaryDark:  '#1F6B41',
      primaryLight: '#4CAF6D',
      accent:       '#FF9F1C',   // mango orange
      accentDark:   '#E07C00',
      bg:           '#FBFBF6',
      surface:      '#FFFFFF',
      text:         '#1E2A22',
      text2:        '#5B6B60',
      text3:        '#8FA096',
      success:      '#2E8B57',
      error:        '#E5484D',
      border:       '#E4EDE6',
      borderDark:   '#CFE0D3',
    },
    radius:   { sm: '8px', md: '14px', lg: '22px', xl: '32px', full: '9999px' },
    shadow: {
      sm: '0 1px 4px rgba(20,40,25,.06), 0 2px 8px rgba(20,40,25,.04)',
      md: '0 4px 16px rgba(20,40,25,.10), 0 1px 4px rgba(20,40,25,.06)',
      lg: '0 10px 32px rgba(20,40,25,.14)',
    },
    font: {
      display: "'Poppins', system-ui, -apple-system, sans-serif",
      body:    "'Inter', system-ui, -apple-system, sans-serif",
    },
    layout: { maxWidth: '1100px' },
  },
};

Object.freeze(CONFIG);
