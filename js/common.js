/* =====================================================================
   Outils partagés par la carte client (index.html) et le tableau de bord
   (admin.html) : connexion Supabase, données de démonstration, calcul des
   prix, mise en forme.
   ===================================================================== */
(function () {
  'use strict';

  var cfg = window.TLE_CONFIG || {};
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  var sb = null;
  if (configured && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  }

  /* ---------- Données de démonstration (identiques à schema.sql) ---------- */
  var DEMO_SETTINGS = {
    brand_name: 'Trompe l’Œil',
    brand_sub: 'EVENT',
    tagline: 'Pâtisseries trompe-l’œil et cupcakes floraux pour boulangeries, restaurants et traiteurs',
    tiers: [{ min: 1, price: 3.5 }, { min: 60, price: 3.2 }, { min: 151, price: 3.0 }],
    cupcake_price: 3.3, cupcake_min: 6,
    promo_active: true, promo_title: 'Bouquet de 7 cupcakes', promo_size: 7, promo_price: 20,
    custom_min: 6, custom_max: 60,
    tle_image_url: null, cupcake_image_url: null,
    price_note: 'Prix HT · Livraison à convenir après validation',
    tle_min_per_flavor: 5,
    banner_active: true,
    banner_eyebrow: 'Notre différence',
    banner_title: 'Le vrai fruit, au cœur de chaque pièce',
    banner_text: 'Nous achetons des fruits frais et les transformons nous-mêmes en inserts. Là où beaucoup utilisent des gels aromatisés, vous servez le goût du vrai fruit.',
    tle_video_url: null, cupcake_video_url: null,
    tle_media: 'video', cupcake_media: 'photo',
    banner_price_top: 'dès', banner_price_main: '', banner_price_bottom: 'la pièce'
  };
  var DEMO_PRODUCTS = [
    ['classique', 'Cacahuète', '#C99459'], ['classique', 'Pistache', '#9BB065'],
    ['classique', 'Cabosse', '#B0602F'], ['classique', 'Pop-corn', '#EBD49E'],
    ['classique', 'Fraise', '#D33A44'], ['classique', 'Framboise', '#BE2C55'],
    ['classique', 'Mangue', '#EFA236'], ['classique', 'Citron', '#EDCF3A'],
    ['special', 'Passion', '#7A4268'], ['special', 'Myrtille', '#43508C'],
    ['special', 'Amande', '#D8B587'], ['special', 'Ananas', '#E5BC3E'],
    ['special', 'Banane', '#F0D660'],
    ['cupcake', 'Nutella', '#5A3420'], ['cupcake', 'Fraise', '#D33A44'],
    ['cupcake', 'Spéculoos', '#B9783F'], ['cupcake', 'Caramel', '#C98A3D'],
    ['cupcake', 'Mangue', '#EFA236']
  ].map(function (p, i) {
    return { id: 'demo-' + i, category: p[0], name: p[1], color: p[2], image_url: null, active: true, sort_order: i };
  });

  /* ---------- Mise en forme ---------- */
  function money(n) {
    var v = Math.round(Number(n || 0) * 100) / 100;
    return v.toFixed(2).replace('.', ',') + ' €';
  }
  function moneyShort(n) {
    var v = Math.round(Number(n || 0) * 100) / 100;
    return (v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', ',')) + ' €';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hexRgb(h) {
    h = /^#[0-9a-f]{6}$/i.test(h || '') ? h : '#C99459';
    return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); });
  }
  function mix(h, t, k) {
    var a = hexRgb(h), b = hexRgb(t);
    return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * k); }).join(',') + ')';
  }
  /** Petite bille colorée qui représente un goût quand il n'y a pas de photo */
  function ball(color) {
    return 'radial-gradient(circle at 32% 28%, ' + mix(color, '#FFFFFF', 0.55) + ' 0%, ' +
      (/^#[0-9a-f]{6}$/i.test(color || '') ? color : '#C99459') + ' 52%, ' + mix(color, '#000000', 0.35) + ' 100%)';
  }

  /* ---------- Prix dégressif ---------- */
  function sortedTiers(tiers) {
    return (tiers || []).map(function (t) { return { min: Number(t.min), price: Number(t.price) }; })
      .filter(function (t) { return t.min >= 1 && t.price >= 0; })
      .sort(function (a, b) { return a.min - b.min; });
  }
  /** Renvoie { unit, index, next } pour un nombre de pièces donné */
  function tierFor(tiers, n) {
    var t = sortedTiers(tiers);
    if (!t.length) return { unit: 0, index: -1, next: null, tiers: t };
    var idx = 0;
    t.forEach(function (x, i) { if (n >= x.min) idx = i; });
    return { unit: t[idx].price, index: idx, next: t[idx + 1] || null, tiers: t };
  }

  function sortProducts(list) {
    var order = { classique: 0, special: 1, cupcake: 2 };
    return list.slice().sort(function (a, b) {
      return (order[a.category] - order[b.category]) || (a.sort_order - b.sort_order) || a.name.localeCompare(b.name);
    });
  }

  /* ---------- Lecture de la carte ---------- */
  async function loadCatalog() {
    if (!sb) {
      return { settings: DEMO_SETTINGS, products: DEMO_PRODUCTS, demo: true };
    }
    var res = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).single(),
      sb.from('products').select('*').eq('active', true).order('sort_order')
    ]);
    if (res[0].error) throw res[0].error;
    if (res[1].error) throw res[1].error;
    return { settings: res[0].data, products: sortProducts(res[1].data || []), demo: false };
  }

  /** Message d'erreur lisible à partir d'une erreur Supabase */
  function errText(e) {
    if (!e) return 'Erreur inconnue';
    var m = e.message || String(e);
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible. Vérifiez votre connexion Internet.';
    if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    return m;
  }

  window.TLE = {
    sb: sb,
    configured: configured,
    libMissing: configured && !sb,
    DEMO_SETTINGS: DEMO_SETTINGS,
    DEMO_PRODUCTS: DEMO_PRODUCTS,
    money: money, moneyShort: moneyShort, esc: esc, ball: ball,
    tierFor: tierFor, sortedTiers: sortedTiers, sortProducts: sortProducts,
    loadCatalog: loadCatalog, errText: errText
  };
})();
