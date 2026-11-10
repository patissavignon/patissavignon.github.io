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
  /*  Commercial : le lien ?ref=code est mémorisé sur le téléphone       */
  /*  (le premier commercial reste, même si l'appli est installée après) */
  /* ------------------------------------------------------------------ */
  var REF_KEY = 'tle-commercial';
  function storedRef() {
    try { return localStorage.getItem(REF_KEY) || ''; } catch (e) { return ''; }
  }
  (function captureRef() {
    var r = new URLSearchParams(location.search).get('ref');
    r = (r || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,30}$/.test(r)) return;
    // Le dernier lien ouvert est retenu sur le téléphone. La base de données,
    // elle, garde toujours le commercial de la toute première commande du client.
    try { localStorage.setItem(REF_KEY, r); } catch (e) { /* navigation privée */ }
  })();
  (function prefillRef() {
    var el = $('fRef'), r = storedRef() || (new URLSearchParams(location.search).get('ref') || '').trim().toLowerCase();
    if (el && r) { el.defaultValue = r; el.value = r; }
  })();

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
    Object.keys(cart.tle).forEach(function (k) { if (cart.tle[k] < S.tle_min_per_flavor) cart.tle[k] = S.tle_min_per_flavor; });
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

  function itemCard(p, i) {
    var n = esc(p.name);
    // Décalage du reflet : il passe en vague d'une carte à l'autre
    var delay = ((i || 0) * 0.35).toFixed(2) + 's';
    return '<div class="item" data-tle="' + esc(p.id) + '" style="--shine-delay:' + delay + '">' + visual(p) +
      '<div class="name">' + n + '</div>' +
      '<div class="stepper qty-stepper">' +
      '<button class="round minus" type="button" data-act="sub" aria-label="Retirer un ' + n + '">−</button>' +
      '<input class="qty-input" type="number" inputmode="numeric" min="0" max="5000" step="1" placeholder="0"' +
      ' aria-label="Nombre de pièces ' + n + ' (minimum ' + S.tle_min_per_flavor + ')">' +
      '<button class="round plus" type="button" data-act="add" aria-label="Ajouter un ' + n + '">+</button>' +
      '</div>' +
      '<div class="qty-hint" aria-live="polite"></div>' +
      '</div>';
  }

  function cupRow(p) {
    var n = esc(p.name);
    var pic = p.image_url
      ? '<button class="dot-btn" type="button" data-zoom="' + esc(p.image_url) + '" data-zoom-name="Cupcake ' + n + '" aria-label="Agrandir la photo du cupcake ' + n + '">' + visual(p, 'dot') + '</button>'
      : visual(p, 'dot');
    return '<div class="row" data-cup="' + esc(p.id) + '">' + pic +
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

    setMedia('tlePhoto', 'tlePhotoImg', 'tleVideo', S.tle_media, S.tle_image_url, S.tle_video_url);
    setMedia('cupPhoto', 'cupPhotoImg', 'cupVideo', S.cupcake_media, S.cupcake_image_url, S.cupcake_video_url);

    // Bandeau « vrais fruits »
    var minPrice = T.sortedTiers(S.tiers).reduce(function (m, t) { return Math.min(m, t.price); }, Infinity);
    $('banner').hidden = !S.banner_active;
    $('bannerEyebrow').textContent = S.banner_eyebrow || '';
    $('bannerTitle').textContent = S.banner_title || '';
    $('bannerText').textContent = S.banner_text || '';
    // Carré prix : textes du tableau de bord, prix calculé si le champ du milieu est vide
    var main = (S.banner_price_main || '').trim() || (isFinite(minPrice) ? moneyShort(minPrice) : '');
    var top = S.banner_price_top == null ? 'dès' : S.banner_price_top;
    var bottom = S.banner_price_bottom == null ? 'la pièce' : S.banner_price_bottom;
    $('bannerPriceTop').textContent = top;
    $('bannerPrice').textContent = main;
    $('bannerPriceBottom').textContent = bottom;
    $('bannerPrice').className = 'amount' + (main.length > 9 ? ' xlong' : main.length > 5 ? ' long' : '');
    $('bannerPriceTop').hidden = !top; $('bannerPriceBottom').hidden = !bottom;
    document.querySelector('.banner-price').hidden = !main;
    $('bannerPriceText').textContent = [top, main, bottom].filter(Boolean).join(' ') + '.';
    $('minNote').textContent = 'Minimum ' + S.tle_min_per_flavor + ' pièces par goût. Tapez directement le nombre voulu.';

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
    $('gridSpe').innerHTML = spe.map(function (p, i) { return itemCard(p, std.length + i); }).join('');
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

  /** Affiche la vidéo ou la photo choisie dans le tableau de bord (repli sur l'autre si absente) */
  function setMedia(boxId, imgId, vidId, mode, imageUrl, videoUrl) {
    var box = $(boxId), img = $(imgId), vid = $(vidId);
    var useVideo = videoUrl && (mode === 'video' || !imageUrl);
    var useImage = !useVideo && imageUrl;
    box.hidden = !(useVideo || useImage);
    vid.hidden = !useVideo; img.hidden = !useImage;
    if (useVideo) {
      if (imageUrl) vid.poster = imageUrl;
      vid.muted = true; vid.defaultMuted = true;
      vid.src = videoUrl;
      vid.onerror = function () { if (imageUrl) { vid.hidden = true; img.src = imageUrl; img.hidden = false; } else box.hidden = true; };
      var p = vid.play(); if (p && p.catch) p.catch(function () { /* lecture auto bloquée : l'image d'aperçu reste */ });
    } else if (useImage) {
      img.src = imageUrl;
      img.onerror = function () { box.hidden = true; };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Mise à jour de l'affichage après chaque clic                      */
  /* ------------------------------------------------------------------ */
  function update() {
    var c = compute();

    document.querySelectorAll('[data-tle]').forEach(function (el) {
      var q = cart.tle[el.getAttribute('data-tle')] || 0;
      el.classList.toggle('has', q > 0);
      var inp = el.querySelector('.qty-input');
      if (document.activeElement !== inp) inp.value = q > 0 ? q : '';
      el.querySelector('.minus').disabled = q === 0;
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
        ' · dernier : ' + last.pieces + ' pièces (' + mixLabel(last).replace(/^Inserts? : /, '') + ')';
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
    sheet = { kind: kind, pieces: Math.min(S.custom_max, Math.max(S.custom_min, 10)), flavor: 'Assortiment', mix: {} };
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
    $('pcsSub').disabled = sheet.pieces <= Math.max(S.custom_min, isC ? mixSum() : 0);
    $('pcsAdd').disabled = sheet.pieces >= S.custom_max;
    $('sheetFlavor').hidden = isC;
    $('sheetMix').hidden = !isC;
    if (isC) { renderMix(); return; }
    $('sheetOpts').innerHTML = flavours().map(function (f) {
      return '<button type="button" class="opt" data-flavor="' + esc(f) + '" aria-pressed="' + (f === sheet.flavor) + '">' + esc(f) + '</button>';
    }).join('');
  }

  /* ---------- Bouquet sur mesure : répartition goût par goût ---------- */
  function mixSum() {
    return Object.keys(sheet.mix).reduce(function (a, k) { return a + (sheet.mix[k] || 0); }, 0);
  }
  function renderMix() {
    var used = mixSum(), rest = sheet.pieces - used;
    var st = $('mixStatus');
    if (used === 0) {
      st.innerHTML = 'Touchez <b>+</b> pour choisir vos goûts. Sans choix, le chef compose un <b>assortiment</b>.';
    } else if (rest > 0) {
      st.innerHTML = '<b>' + used + ' / ' + sheet.pieces + '</b> choisis · les <b>' + rest + '</b> restants seront en assortiment';
    } else {
      st.innerHTML = '<b>' + used + ' / ' + sheet.pieces + '</b> · tout est réparti ✓';
    }
    st.classList.toggle('done', used > 0 && rest === 0);
    var list = $('mixList');
    if (!list.children.length) {
      list.innerHTML = byCat('cupcake').map(function (p) {
        var n = esc(p.name);
        return '<div class="mix-row" data-mix="' + n + '">' + visual(p, 'dot') +
          '<div class="mix-name">' + n + '</div>' +
          '<button class="round minus" type="button" data-m="sub" aria-label="Un ' + n + ' de moins">−</button>' +
          '<input class="mix-q" type="number" inputmode="numeric" min="0" step="1" aria-label="Nombre de cupcakes ' + n + '">' +
          '<button class="round plus" type="button" data-m="add" aria-label="Un ' + n + ' de plus">+</button>' +
          '</div>';
      }).join('');
    }
    Array.prototype.forEach.call(list.children, function (row) {
      var f = row.getAttribute('data-mix'), q = sheet.mix[f] || 0;
      var input = row.querySelector('.mix-q');
      if (document.activeElement !== input) input.value = q;
      row.classList.toggle('on', q > 0);
      row.querySelector('[data-m="sub"]').disabled = q <= 0;
      row.querySelector('[data-m="add"]').disabled = rest <= 0 && sheet.pieces >= S.custom_max;
    });
    $('mixReset').hidden = used === 0;
  }
  function setMix(f, q) {
    q = Math.max(0, Math.floor(Number(q) || 0));
    var others = mixSum() - (sheet.mix[f] || 0);
    // Si on dépasse le nombre de pièces, le bouquet grandit (jusqu'au maximum)
    if (others + q > sheet.pieces) sheet.pieces = Math.min(S.custom_max, others + q);
    q = Math.min(q, sheet.pieces - others);
    if (q > 0) sheet.mix[f] = q; else delete sheet.mix[f];
  }
  function mixLabel(b) {
    var keys = Object.keys(b.mix || {});
    if (!keys.length) return 'Insert : ' + b.flavor;
    var used = 0;
    var parts = keys.map(function (k) { used += b.mix[k]; return k + ' ×' + b.mix[k]; });
    if (used < b.pieces) parts.push('Assortiment ×' + (b.pieces - used));
    return 'Inserts : ' + parts.join(' · ');
  }
  function mixKey(b) { return b.pieces + '|' + b.flavor + '|' + JSON.stringify(b.mix || {}); }

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
    group(cart.custom, mixKey).forEach(function (g) {
      cupHtml += line(g.n, 'Bouquet sur mesure · ' + g.x.pieces + ' pièces', mixLabel(g.x), g.n * g.x.pieces * S.cupcake_price);
    });
    if (cupHtml) html += '<div class="box"><div class="eyebrow">Cupcakes floraux</div>' + cupHtml + '</div>';
    $('recapLines').innerHTML = html;
    $('recapTotal').textContent = money(c.total);
  }

  function payload(form) {
    var fd = new FormData(form), out = {};
    ['business_name', 'contact_name', 'phone', 'email', 'delivery_date', 'message', 'ref'].forEach(function (k) {
      out[k] = String(fd.get(k) || '').trim();
    });
    out.tle = Object.keys(cart.tle).filter(function (k) { return cart.tle[k] > 0; })
      .map(function (k) { return { product_id: k, qty: cart.tle[k] }; });
    out.cupcakes = Object.keys(cart.cup).filter(function (k) { return cart.cup[k] > 0; })
      .map(function (k) { return { product_id: k, qty: cart.cup[k] }; });
    out.bouquets = group(cart.bouquets, function (b) { return b.flavor; })
      .map(function (g) { return { flavor: g.x.flavor, count: g.n }; });
    out.custom = group(cart.custom, mixKey).map(function (g) {
      var mix = Object.keys(g.x.mix || {}).map(function (k) { return { flavor: k, qty: g.x.mix[k] }; });
      var o = { flavor: g.x.flavor || 'Assortiment', pieces: g.x.pieces, count: g.n };
      if (mix.length) o.mix = mix;
      return o;
    });
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
        var ref = (data.ref || storedRef() || (new URLSearchParams(location.search).get('ref') || '')).trim().toLowerCase();
        if (ref) data.ref = ref; else delete data.ref;
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

  /** Trompe-l'œil : 0 ou au moins le minimum par goût (5 par défaut) */
  function setTle(id, q, card) {
    var min = S.tle_min_per_flavor, hint = card && card.querySelector('.qty-hint');
    q = Math.max(0, Math.min(5000, Math.round(Number(q) || 0)));
    if (q > 0 && q < min) {
      q = min;
      if (hint) { hint.textContent = 'Minimum ' + min + ' pièces'; clearTimeout(hint._t); hint._t = setTimeout(function () { hint.textContent = ''; }, 2500); }
    }
    if (q) cart.tle[id] = q; else delete cart.tle[id];
  }
  function stepTle(id, d, card) {
    var cur = cart.tle[id] || 0, min = S.tle_min_per_flavor;
    if (d > 0) setTle(id, cur === 0 ? min : cur + 1, card);
    else setTle(id, cur <= min ? 0 : cur - 1, card);
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      var d = b.getAttribute('data-act') === 'add' ? 1 : -1;
      var t = b.closest('[data-tle]'), c = b.closest('[data-cup]');
      if (t) stepTle(t.getAttribute('data-tle'), d, t);
      else if (c) bump(cart.cup, c.getAttribute('data-cup'), d);
      update();
    });

    // Saisie directe du nombre de pièces
    document.addEventListener('change', function (e) {
      if (!e.target.classList.contains('qty-input')) return;
      var t = e.target.closest('[data-tle]');
      setTle(t.getAttribute('data-tle'), e.target.value, t);
      e.target.value = cart.tle[t.getAttribute('data-tle')] || '';
      update();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('qty-input')) e.target.blur();
    });
    document.addEventListener('focusin', function (e) {
      if (e.target.classList && e.target.classList.contains('qty-input')) e.target.select();
    });

    $('promoAdd').onclick = function () { openSheet('promo'); };
    $('promoSub').onclick = function () { cart.bouquets.pop(); update(); };
    $('customOpen').onclick = function () { openSheet('custom'); };
    $('customClear').onclick = function () { cart.custom.pop(); update(); };

    $('pcsSub').onclick = function () {
      var floor = sheet.kind === 'custom' ? Math.max(S.custom_min, mixSum()) : S.custom_min;
      sheet.pieces = Math.max(floor, sheet.pieces - 1); renderSheet();
    };
    $('mixList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      var f = b.closest('[data-mix]').getAttribute('data-mix');
      setMix(f, (sheet.mix[f] || 0) + (b.getAttribute('data-m') === 'add' ? 1 : -1));
      renderSheet();
    });
    $('mixList').addEventListener('input', function (e) {
      if (!e.target.matches('.mix-q')) return;
      var f = e.target.closest('[data-mix]').getAttribute('data-mix');
      setMix(f, e.target.value);
      renderSheet();
    });
    $('mixList').addEventListener('focusout', function (e) {
      if (e.target.matches('.mix-q')) renderSheet();
    });
    $('mixReset').onclick = function () { sheet.mix = {}; renderSheet(); };
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
      else {
        var mix = {};
        Object.keys(sheet.mix).forEach(function (k) { if (sheet.mix[k] > 0) mix[k] = sheet.mix[k]; });
        var keys = Object.keys(mix);
        var fl = keys.length === 1 && mix[keys[0]] === sheet.pieces ? keys[0] : 'Assortiment';
        cart.custom.push(keys.length === 1 && mix[keys[0]] === sheet.pieces
          ? { pieces: sheet.pieces, flavor: fl }
          : { pieces: sheet.pieces, flavor: fl, mix: mix });
      }
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
      S.tle_min_per_flavor = Math.max(1, Number(S.tle_min_per_flavor) || 1);
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

  /* ------------------------------------------------------------------ */
  /*  Agrandir une photo de cupcake (clic sur la petite image ronde)     */
  /* ------------------------------------------------------------------ */
  (function zoomViewer() {
    var box = document.createElement('div');
    box.className = 'zoom';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = '<button class="zoom-x" type="button" aria-label="Fermer">×</button>' +
      '<figure><img alt=""><figcaption></figcaption></figure>';
    document.body.appendChild(box);
    var img = box.querySelector('img'), cap = box.querySelector('figcaption'), x = box.querySelector('.zoom-x');
    var lastBtn = null;

    function open(btn) {
      lastBtn = btn;
      img.src = btn.getAttribute('data-zoom');
      img.alt = btn.getAttribute('data-zoom-name') || '';
      cap.textContent = btn.getAttribute('data-zoom-name') || '';
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      x.focus();
    }
    function close() {
      box.hidden = true;
      document.body.style.overflow = '';
      if (lastBtn) lastBtn.focus();
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-zoom]');
      if (btn) { e.preventDefault(); e.stopPropagation(); open(btn); }
    }, true);
    x.onclick = close;
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
  })();
})();
