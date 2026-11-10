/* =====================================================================
   Carte client : affichage des produits, panier, prix dégressif,
   formulaire et envoi de la commande.
   ===================================================================== */
(function () {
  'use strict';

  var T = window.TLE;
  var $ = function (id) { return document.getElementById(id); };
  var esc = T.esc, money = T.money, moneyShort = T.moneyShort;

  var S = null;            // réglages (prix, textes, photos)
  var P = [];              // produits actifs
  var DEMO = true;
  var STORE_KEY = 'tle-panier-v1';

  var cart = { tle: {}, cup: {}, bouquets: [], custom: [] };
  var sheet = null;        // { kind: 'promo' | 'custom', pieces, flavor }

  /* ------------------------------------------------------------------ */
  /*  Panier : sauvegarde légère dans le navigateur                      */
  /* ------------------------------------------------------------------ */
  function saveCart() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); } catch (e) { /* navigation privée */ }
  }
  function loadCart() {
    try {
      var c = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (c && typeof c === 'object') {
        cart.tle = c.tle || {}; cart.cup = c.cup || {};
        cart.bouquets = Array.isArray(c.bouquets) ? c.bouquets : [];
        cart.custom = Array.isArray(c.custom) ? c.custom : [];
      }
    } catch (e) { /* ignore */ }
    // On retire ce qui n'existe plus dans la carte
    var ids = {}; P.forEach(function (p) { ids[p.id] = true; });
    Object.keys(cart.tle).forEach(function (k) { if (!ids[k]) delete cart.tle[k]; });
    Object.keys(cart.cup).forEach(function (k) { if (!ids[k]) delete cart.cup[k]; });
    if (!S.promo_active) cart.bouquets = [];
  }

  /* ------------------------------------------------------------------ */
  /*  Calculs                                                           */
  /* ------------------------------------------------------------------ */
  function byCat(cat) { return P.filter(function (p) { return p.category === cat; }); }
  function flavours() { return ['Assortiment'].concat(byCat('cupcake').map(function (p) { return p.name; })); }

  function compute() {
    var nTle = 0, tleLines = [];
    P.forEach(function (p) {
      if (p.category === 'cupcake') return;
      var q = cart.tle[p.id] || 0;
      if (q > 0) { nTle += q; tleLines.push({ p: p, q: q }); }
    });
    var tier = T.tierFor(S.tiers, nTle);
    var tleTotal = nTle * tier.unit;
    var base = tier.tiers.length ? tier.tiers[0].price : tier.unit;

    var nCup = 0, cupLines = [];
    byCat('cupcake').forEach(function (p) {
      var q = cart.cup[p.id] || 0;
      if (q > 0) { nCup += q; cupLines.push({ p: p, q: q }); }
    });
    var cupPrice = Number(S.cupcake_price);
    var cupTotal = nCup * cupPrice;
    var promoTotal = cart.bouquets.length * Number(S.promo_price);
    var customTotal = 0, customPieces = 0;
    cart.custom.forEach(function (b) { customTotal += b.pieces * cupPrice; customPieces += b.pieces; });

    var cupShort = nCup > 0 && nCup < S.cupcake_min;
    var pieces = nTle + nCup + cart.bouquets.length * S.promo_size + customPieces;
    return {
      nTle: nTle, tier: tier, tleLines: tleLines, tleTotal: tleTotal, saving: nTle * base - tleTotal,
      nCup: nCup, cupLines: cupLines, cupTotal: cupTotal, cupShort: cupShort,
      promoTotal: promoTotal, customTotal: customTotal,
      total: tleTotal + cupTotal + promoTotal + customTotal,
      pieces: pieces,
      canOrder: pieces > 0 && !cupShort
    };
  }

  function group(list, keyFn) {
    var g = {}, order = [];
    list.forEach(function (x) { var k = keyFn(x); if (!g[k]) { g[k] = { x: x, n: 0 }; order.push(k); } g[k].n++; });
    return order.map(function (k) { return g[k]; });
  }

  /* ------------------------------------------------------------------ */
  /*  Construction de la carte (une fois)                               */
  /* ------------------------------------------------------------------ */
  function visual(p, cls) {
    if (p.image_url) return '<img class="' + (cls === 'dot' ? 'dot' : 'thumb') + '" src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" loading="lazy">';
    return '<span class="' + (cls === 'dot' ? 'dot' : 'pastille') + '" style="background:' + T.ball(p.color) + '" aria-hidden="true"></span>';
  }

  function itemCard(p) {
    var n = esc(p.name);
    return '<div class="item" data-tle="' + esc(p.id) + '">' + visual(p) +
      '<div class="name">' + n + '</div>' +
      '<div class="stepper">' +
      '<button class="round minus" type="button" data-act="sub" aria-label="Retirer un ' + n + '">−</button>' +
      '<span class="q" aria-live="polite">0</span>' +
      '<button class="round plus" type="button" data-act="add" aria-label="Ajouter un ' + n + '">+</button>' +
      '</div>' +
      '<button class="chip" type="button" data-act="add10" aria-label="Ajouter 10 ' + n + '">+ 10 pièces</button>' +
      '</div>';
  }

  function cupRow(p) {
    var n = esc(p.name);
    return '<div class="row" data-cup="' + esc(p.id) + '">' + visual(p, 'dot') +
      '<div class="name">' + n + '</div>' +
      '<button class="round minus" type="button" data-act="sub" aria-label="Retirer un cupcake ' + n + '">−</button>' +
      '<span class="q" aria-live="polite">0</span>' +
      '<button class="round plus" type="button" data-act="add" aria-label="Ajouter un cupcake ' + n + '">+</button>' +
      '</div>';
  }

  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

  function buildCatalog() {
    $('brandName').textContent = S.brand_name || 'Trompe l’Œil';
    $('brandSub').textContent = S.brand_sub || '';
    $('tagline').textContent = S.tagline || '';
    $('priceNote').textContent = S.price_note || '';

    setPhoto('tlePhoto', 'tlePhotoImg', S.tle_image_url);
    setPhoto('cupPhoto', 'cupPhotoImg', S.cupcake_image_url);

    // Paliers
    var tiers = T.sortedTiers(S.tiers);
    $('tiers').style.gridTemplateColumns = 'repeat(' + Math.max(1, tiers.length) + ', minmax(0, 1fr))';
    $('tiers').innerHTML = tiers.map(function (t, i) {
      var next = tiers[i + 1];
      var range = next ? (t.min + ' à ' + (next.min - 1) + ' pcs') : (t.min + ' pcs et +');
      return '<div class="tier" data-tier="' + i + '"><span class="r">' + range + '</span><span class="p">' + money(t.price) + '</span><span class="u">la pièce</span></div>';
    }).join('');
    var top = tiers.length ? tiers[tiers.length - 1].min : 1;
    $('barMarks').innerHTML = tiers.slice(1, -1).map(function (t) {
      return '<div class="mark" style="left:' + (t.min / top * 100).toFixed(1) + '%"></div>';
    }).join('');

    var std = byCat('classique'), spe = byCat('special'), cup = byCat('cupcake');
    $('gridStd').innerHTML = std.map(itemCard).join('');
    $('gridSpe').innerHTML = spe.map(itemCard).join('');
    $('countStd').textContent = plural(std.length, 'goût', 'goûts');
    $('countSpe').textContent = plural(spe.length, 'goût', 'goûts');

    // Cupcakes
    var names = cup.map(function (p) { return p.name; });
    $('cupFlavours').textContent = names.length ? 'Insert au choix : ' + names.join(', ') : '';
    $('cupPrice').textContent = money(S.cupcake_price);
    $('cupList').innerHTML = cup.map(cupRow).join('');
    $('cupCard').hidden = cup.length === 0;

    // Offre bouquet
    $('promoCard').hidden = !S.promo_active;
    if (S.promo_active) {
      var normal = S.promo_size * S.cupcake_price;
      var save = normal - S.promo_price;
      $('promoTitle').textContent = S.promo_title;
      $('promoPrice').textContent = moneyShort(S.promo_price);
      $('promoOld').textContent = save > 0.004 ? money(normal) : '';
      $('promoText').textContent = S.promo_size + ' cupcakes floraux montés en bouquet, soit ' +
        money(S.promo_price / S.promo_size) + ' la pièce' +
        (save > 0.004 ? ' au lieu de ' + money(S.cupcake_price) + '. Vous économisez ' + money(save) + ' par bouquet.' : '.');
    }
    $('customText').textContent = 'Vous choisissez le nombre de cupcakes et le goût de l’insert. ' +
      money(S.cupcake_price) + ' la pièce, de ' + S.custom_min + ' à ' + S.custom_max + ' pièces.';
  }

  function setPhoto(boxId, imgId, url) {
    var box = $(boxId), img = $(imgId);
    if (url) { img.src = url; box.hidden = false; img.onerror = function () { box.hidden = true; }; }
    else { box.hidden = true; img.removeAttribute('src'); }
  }

  /* ------------------------------------------------------------------ */
  /*  Mise à jour de l'affichage après chaque clic                      */
  /* ------------------------------------------------------------------ */
  function update() {
    var c = compute();

    document.querySelectorAll('[data-tle]').forEach(function (el) {
      var q = cart.tle[el.getAttribute('data-tle')] || 0;
      el.classList.toggle('has', q > 0);
      el.querySelector('.q').textContent = q;
    });
    document.querySelectorAll('[data-cup]').forEach(function (el) {
      var q = cart.cup[el.getAttribute('data-cup')] || 0;
      el.classList.toggle('has', q > 0);
      el.querySelector('.q').textContent = q;
    });

    // Paliers + progression
    document.querySelectorAll('[data-tier]').forEach(function (el) {
      el.classList.toggle('on', c.nTle > 0 && Number(el.getAttribute('data-tier')) === c.tier.index);
    });
    var tiers = c.tier.tiers, top = tiers.length ? tiers[tiers.length - 1].min : 1;
    $('barFill').style.width = Math.min(100, c.nTle / top * 100).toFixed(1) + '%';
    var prog, tip = '';
    if (c.nTle === 0) {
      prog = tiers.length > 1 ? 'Le prix baisse dès ' + tiers[1].min + ' pièces' : '';
    } else if (c.tier.next) {
      var miss = c.tier.next.min - c.nTle;
      prog = c.nTle + ' pièces · encore ' + miss + ' pour passer à ' + money(c.tier.next.price);
      tip = 'Trompe-l’œil : ' + c.nTle + ' pcs à ' + money(c.tier.unit) + ' · encore ' + miss + ' pour ' + money(c.tier.next.price);
    } else {
      prog = c.nTle + ' pièces · meilleur prix atteint';
      tip = 'Trompe-l’œil : ' + c.nTle + ' pcs à ' + money(c.tier.unit) + ' · meilleur prix';
    }
    $('progress').textContent = prog;
    $('barTip').textContent = tip;
    $('barTip').hidden = !tip;

    // Cupcakes
    var note = $('cupNote');
    if (c.nCup === 0) { note.textContent = 'Minimum ' + S.cupcake_min + ' cupcakes, goûts mélangeables'; }
    else if (c.cupShort) { note.textContent = c.nCup + ' cupcakes · encore ' + (S.cupcake_min - c.nCup) + ' pour atteindre le minimum'; }
    else { note.textContent = c.nCup + ' cupcakes · ' + money(c.cupTotal); }
    note.classList.toggle('alert', c.cupShort);

    var nb = cart.bouquets.length;
    $('promoQty').textContent = nb;
    $('promoQty').hidden = nb === 0;
    $('promoSub').hidden = nb === 0;

    var cs = cart.custom;
    $('customSummary').hidden = cs.length === 0;
    $('customClear').hidden = cs.length === 0;
    if (cs.length) {
      var last = cs[cs.length - 1];
      $('customSummary').textContent = plural(cs.length, 'bouquet composé', 'bouquets composés') +
        ' · dernier : ' + last.pieces + ' pièces, ' + last.flavor;
    }

    // Barre du bas
    $('barCount').textContent = c.pieces === 0 ? 'Votre panier est vide' : plural(c.pieces, 'pièce', 'pièces') + ' · total';
    $('barTotal').textContent = money(c.total);
    $('goRecap').hidden = !c.canOrder;
    $('barBlocked').hidden = c.canOrder;
    $('barBlocked').textContent = c.cupShort ? 'Cupcakes : minimum ' + S.cupcake_min + ' pièces' : 'Ajoutez vos pièces';

    saveCart();
    return c;
  }

  /* ------------------------------------------------------------------ */
  /*  Fenêtre bouquet                                                   */
  /* ------------------------------------------------------------------ */
  var lastFocus = null;
  function openSheet(kind) {
    lastFocus = document.activeElement;
    sheet = { kind: kind, pieces: Math.min(S.custom_max, Math.max(S.custom_min, 10)), flavor: 'Assortiment' };
    renderSheet();
    $('sheet').hidden = false;
    $('sheetOk').focus();
  }
  function closeSheet() {
    $('sheet').hidden = true; sheet = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderSheet() {
    var isC = sheet.kind === 'custom';
    $('sheetTitle').textContent = isC ? 'Bouquet sur mesure' : S.promo_title;
    $('sheetPrice').textContent = isC ? money(sheet.pieces * S.cupcake_price) : moneyShort(S.promo_price);
    $('sheetPieces').hidden = !isC;
    $('pcsVal').textContent = sheet.pieces + ' pièces';
    $('pcsSub').disabled = sheet.pieces <= S.custom_min;
    $('pcsAdd').disabled = sheet.pieces >= S.custom_max;
    $('sheetOpts').innerHTML = flavours().map(function (f) {
      return '<button type="button" class="opt" data-flavor="' + esc(f) + '" aria-pressed="' + (f === sheet.flavor) + '">' + esc(f) + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /*  Récapitulatif                                                     */
  /* ------------------------------------------------------------------ */
  function line(q, label, detail, price) {
    return '<div class="ln"><div class="q">' + q + ' ×</div><div class="l">' + esc(label) +
      (detail ? '<div class="d">' + esc(detail) + '</div>' : '') + '</div><div class="p">' + money(price) + '</div></div>';
  }

  function renderRecap() {
    var c = compute(), html = '';
    if (c.nTle > 0) {
      html += '<div class="box" style="margin-bottom:14px"><div class="box-head"><div class="eyebrow">Trompe-l’œil</div>' +
        '<div style="font-size:13px;font-weight:700">' + c.nTle + ' pcs × ' + money(c.tier.unit) + '</div></div>' +
        c.tleLines.map(function (l) { return line(l.q, l.p.name, '', l.q * c.tier.unit); }).join('') +
        (c.saving > 0.004 ? '<div class="saving">Tarif ' + money(c.tier.unit) + ' appliqué : vous économisez ' + money(c.saving) + '</div>' : '') +
        '</div>';
    }
    var cupHtml = c.cupLines.map(function (l) { return line(l.q, 'Cupcake ' + l.p.name, '', l.q * S.cupcake_price); }).join('');
    group(cart.bouquets, function (b) { return b.flavor; }).forEach(function (g) {
      cupHtml += line(g.n, S.promo_title + ' · offre', 'Insert : ' + g.x.flavor, g.n * S.promo_price);
    });
    group(cart.custom, function (b) { return b.pieces + '|' + b.flavor; }).forEach(function (g) {
      cupHtml += line(g.n, 'Bouquet sur mesure · ' + g.x.pieces + ' pièces', 'Insert : ' + g.x.flavor, g.n * g.x.pieces * S.cupcake_price);
    });
    if (cupHtml) html += '<div class="box"><div class="eyebrow">Cupcakes floraux</div>' + cupHtml + '</div>';
    $('recapLines').innerHTML = html;
    $('recapTotal').textContent = money(c.total);
  }

  function payload(form) {
    var fd = new FormData(form), out = {};
    ['business_name', 'contact_name', 'phone', 'email', 'delivery_date', 'message'].forEach(function (k) {
      out[k] = String(fd.get(k) || '').trim();
    });
    out.tle = Object.keys(cart.tle).filter(function (k) { return cart.tle[k] > 0; })
      .map(function (k) { return { product_id: k, qty: cart.tle[k] }; });
    out.cupcakes = Object.keys(cart.cup).filter(function (k) { return cart.cup[k] > 0; })
      .map(function (k) { return { product_id: k, qty: cart.cup[k] }; });
    out.bouquets = group(cart.bouquets, function (b) { return b.flavor; })
      .map(function (g) { return { flavor: g.x.flavor, count: g.n }; });
    out.custom = group(cart.custom, function (b) { return b.pieces + '|' + b.flavor; })
      .map(function (g) { return { flavor: g.x.flavor, pieces: g.x.pieces, count: g.n }; });
    return out;
  }

  function showScreen(name) {
    ['Carte', 'Recap', 'Sent'].forEach(function (s) { $('screen' + s).hidden = s !== name; });
    window.scrollTo(0, 0);
  }

  async function sendOrder(ev) {
    ev.preventDefault();
    var form = $('orderForm'), err = $('formError'), btn = $('sendBtn');
    err.hidden = true;
    var data = payload(form);
    if (!data.business_name || !data.phone) {
      err.textContent = 'Merci d’indiquer le nom de l’établissement et un téléphone.';
      err.hidden = false;
      (data.business_name ? $('fPhone') : $('fBusiness')).focus();
      return;
    }
    btn.disabled = true; btn.textContent = 'Envoi en cours…';
    try {
      var result;
      if (DEMO) {
        result = { id: 'DÉMO', total: compute().total };
      } else {
        var res = await T.sb.rpc('place_order', { p: data });
        if (res.error) throw res.error;
        result = res.data;
      }
      $('sentNum').textContent = 'COMMANDE N° ' + result.id;
      $('sentTotal').textContent = money(result.total);
      $('sentText').textContent = DEMO
        ? 'Mode démo : la commande n’a pas été envoyée. Une fois Supabase branché, elle arrivera dans votre tableau de bord.'
        : 'Votre commande est bien envoyée. Nous vous recontactons très vite pour la livraison.';
      cart = { tle: {}, cup: {}, bouquets: [], custom: [] };
      saveCart();
      form.reset();
      showScreen('Sent');
    } catch (e) {
      err.textContent = 'La commande n’a pas pu être envoyée : ' + T.errText(e);
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Envoyer ma commande';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Événements                                                        */
  /* ------------------------------------------------------------------ */
  function bump(map, id, d) { map[id] = Math.max(0, Math.min(5000, (map[id] || 0) + d)); if (!map[id]) delete map[id]; }

  function bind() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      var d = act === 'add' ? 1 : act === 'sub' ? -1 : 10;
      var t = b.closest('[data-tle]'), c = b.closest('[data-cup]');
      if (t) bump(cart.tle, t.getAttribute('data-tle'), d);
      else if (c) bump(cart.cup, c.getAttribute('data-cup'), d);
      update();
    });

    $('promoAdd').onclick = function () { openSheet('promo'); };
    $('promoSub').onclick = function () { cart.bouquets.pop(); update(); };
    $('customOpen').onclick = function () { openSheet('custom'); };
    $('customClear').onclick = function () { cart.custom.pop(); update(); };

    $('pcsSub').onclick = function () { sheet.pieces = Math.max(S.custom_min, sheet.pieces - 1); renderSheet(); };
    $('pcsAdd').onclick = function () { sheet.pieces = Math.min(S.custom_max, sheet.pieces + 1); renderSheet(); };
    $('sheetOpts').addEventListener('click', function (e) {
      var o = e.target.closest('[data-flavor]');
      if (o) { sheet.flavor = o.getAttribute('data-flavor'); renderSheet(); }
    });
    $('sheetCancel').onclick = closeSheet;
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
    $('sheet').addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    $('sheetOk').onclick = function () {
      if (sheet.kind === 'promo') cart.bouquets.push({ flavor: sheet.flavor });
      else cart.custom.push({ pieces: sheet.pieces, flavor: sheet.flavor });
      closeSheet(); update();
    };

    $('goRecap').onclick = function () { renderRecap(); showScreen('Recap'); };
    $('backCarte').onclick = function () { showScreen('Carte'); };
    $('orderForm').addEventListener('submit', sendOrder);
    $('newOrder').onclick = function () { update(); showScreen('Carte'); };
  }

  /* ------------------------------------------------------------------ */
  /*  Démarrage                                                         */
  /* ------------------------------------------------------------------ */
  async function start() {
    try {
      if (T.libMissing) throw new Error('Le module Supabase n’a pas pu être chargé. Vérifiez votre connexion Internet.');
      var data = await T.loadCatalog();
      S = data.settings; P = data.products; DEMO = data.demo;
      ['cupcake_price', 'promo_price'].forEach(function (k) { S[k] = Number(S[k]); });
      ['cupcake_min', 'promo_size', 'custom_min', 'custom_max'].forEach(function (k) { S[k] = Number(S[k]); });
      $('demoBanner').hidden = !DEMO;
      buildCatalog();
      loadCart();
      bind();
      $('loading').hidden = true;
      $('carteBody').hidden = false;
      update();
    } catch (e) {
      $('loading').textContent = 'La carte n’a pas pu être chargée. ' + T.errText(e);
    }
  }
  start();
})();
