/* =====================================================================
   Tableau de bord propriétaire : connexion, commandes, produits,
   prix et photos.
   ===================================================================== */
(function () {
  'use strict';

  var T = window.TLE;
  var sb = T.sb;
  var $ = function (id) { return document.getElementById(id); };
  var esc = T.esc, money = T.money;

  var BUCKET = 'photos';
  var STATUS = {
    nouvelle: 'Nouvelle', confirmee: 'Confirmée', livree: 'Livrée', annulee: 'Annulée'
  };
  var CATS = [['classique', 'Trompe-l’œil · Classiques'], ['special', 'Trompe-l’œil · Spéciaux'], ['cupcake', 'Cupcakes · goûts d’insert']];

  var settings = null;
  var products = [];
  var orders = [];
  var commercials = [];
  var refreshTimer = null;
  var currentTab = 'orders';

  /* ------------------------------------------------------------------ */
  /*  Petits outils                                                     */
  /* ------------------------------------------------------------------ */
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg; t.classList.toggle('err', !!isErr); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 6000 : 2600);
  }
  function fail(e) { console.error(e); toast(T.errText(e), true); }
  function show(view) {
    ['viewSetup', 'viewLogin', 'viewReset', 'viewDenied', 'viewDash'].forEach(function (v) { $(v).hidden = v !== view; });
  }
  function fmtDate(d) {
    if (!d) return '';
    var x = new Date(d);
    return x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' à ' +
      x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(d) {
    if (!d) return '';
    var x = new Date(d + 'T12:00:00');
    return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /* ---------- Photos : studio (cadrage + harmonisation) puis envoi ---------- */
  /** Renvoie l'adresse publique de la photo, ou null si l'envoi est annulé */
  async function uploadPhoto(file, folder, format) {
    var blob = await T.studio.open(file, format);
    if (!blob) return null;
    toast('Envoi de la photo…');
    var path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (up.error) throw up.error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  function pathFromUrl(url) {
    var mark = '/object/public/' + BUCKET + '/';
    var i = (url || '').indexOf(mark);
    return i >= 0 ? decodeURIComponent(url.slice(i + mark.length).split('?')[0]) : null;
  }
  async function deletePhoto(url) {
    var p = pathFromUrl(url);
    if (!p) return;
    var r = await sb.storage.from(BUCKET).remove([p]);
    if (r.error) console.warn('Suppression photo :', r.error.message);
  }

  /* ------------------------------------------------------------------ */
  /*  Connexion                                                         */
  /* ------------------------------------------------------------------ */
  async function afterLogin(session) {
    if (!session) { show('viewLogin'); return; }
    var r = await sb.rpc('is_admin');
    if (r.error || !r.data) {
      $('deniedEmail').textContent = session.user.email || '';
      show('viewDenied');
      return;
    }
    show('viewDash');
    await Promise.all([loadSettings(), loadProducts(), loadCommercials()]);
    await loadOrders();
    switchTab(currentTab);
  }

  function bindAuth() {
    $('loginForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('loginError'), btn = $('loginBtn');
      err.hidden = true; $('loginInfo').hidden = true;
      var email = $('lEmail').value.trim(), pass = $('lPass').value;
      if (!email || !pass) { err.textContent = 'Indiquez votre email et votre mot de passe.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Connexion…';
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      btn.disabled = false; btn.textContent = 'Se connecter';
      if (r.error) { err.textContent = T.errText(r.error); err.hidden = false; return; }
      $('lPass').value = '';
      afterLogin(r.data.session);
    });

    $('forgotBtn').onclick = async function () {
      var email = $('lEmail').value.trim(), err = $('loginError');
      err.hidden = true;
      if (!email) { err.textContent = 'Écrivez d’abord votre email ci-dessus.'; err.hidden = false; $('lEmail').focus(); return; }
      var redirect = location.href.split('#')[0].split('?')[0];
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (r.error) { err.textContent = T.errText(r.error); err.hidden = false; return; }
      $('loginInfo').textContent = 'Si ce compte existe, un email de réinitialisation vient d’être envoyé.';
      $('loginInfo').hidden = false;
    };

    $('resetForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var p = $('rPass').value, err = $('resetError');
      err.hidden = true;
      if (p.length < 8) { err.textContent = '8 caractères minimum.'; err.hidden = false; return; }
      var r = await sb.auth.updateUser({ password: p });
      if (r.error) { err.textContent = T.errText(r.error); err.hidden = false; return; }
      toast('Mot de passe enregistré');
      var s = await sb.auth.getSession();
      afterLogin(s.data.session);
    });

    document.querySelectorAll('[data-logout]').forEach(function (b) {
      b.onclick = async function () {
        clearInterval(refreshTimer);
        await sb.auth.signOut();
        show('viewLogin');
      };
    });

    sb.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') show('viewReset');
      if (event === 'SIGNED_OUT') show('viewLogin');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Onglets                                                           */
  /* ------------------------------------------------------------------ */
  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.setAttribute('aria-selected', String(on));
      $('tab-' + b.getAttribute('data-tab')).hidden = !on;
    });
    clearInterval(refreshTimer);
    if (name === 'orders') refreshTimer = setInterval(function () { if (!document.hidden) loadOrders(); }, 60000);
    if (name === 'sales') loadSales();
  }

  /* ------------------------------------------------------------------ */
  /*  COMMANDES                                                         */
  /* ------------------------------------------------------------------ */
  async function loadOrders() {
    var f = $('orderFilter').value;
    var q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(300);
    if (f === 'open') q = q.in('status', ['nouvelle', 'confirmee']);
    else if (f !== 'all') q = q.eq('status', f);
    var r = await q;
    if (r.error) { fail(r.error); return; }
    orders = r.data || [];
    renderOrders();
    var c = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle');
    var n = c.count || 0;
    $('newCount').textContent = n; $('newCount').hidden = n === 0;
  }

  function renderOrders() {
    var list = $('ordersList');
    var open = orders.filter(function (o) { return o.status !== 'annulee'; });
    var sum = open.reduce(function (a, o) { return a + Number(o.total); }, 0);
    var pcs = open.reduce(function (a, o) {
      return a + (o.items || []).reduce(function (b, it) { return b + Number(it.pieces || it.qty || 0); }, 0);
    }, 0);
    $('orderStats').innerHTML =
      '<div class="stat"><div class="v">' + orders.length + '</div><div class="k">Commandes affichées</div></div>' +
      '<div class="stat"><div class="v">' + money(sum) + '</div><div class="k">Montant (hors annulées)</div></div>' +
      '<div class="stat"><div class="v">' + pcs + '</div><div class="k">Pièces à produire</div></div>';

    if (!orders.length) { list.innerHTML = '<div class="empty">Aucune commande pour ce filtre.</div>'; return; }
    list.innerHTML = orders.map(function (o) {
      var items = (o.items || []).map(function (it) {
        return '<div class="ln"><div class="q">' + esc(it.qty) + ' ×</div><div class="l">' + esc(it.label) +
          (it.detail ? '<div class="d">' + esc(it.detail) + '</div>' : '') +
          '<div class="d">' + money(it.unit_price) + ' l’unité</div></div><div class="p">' + money(it.total) + '</div></div>';
      }).join('');
      var opts = Object.keys(STATUS).map(function (k) {
        return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + STATUS[k] + '</option>';
      }).join('');
      var tel = String(o.phone || '').replace(/[^\d+]/g, '');
      return '<article class="order st-' + esc(o.status) + '" data-order="' + o.id + '">' +
        '<div class="order-top"><div><h3>N° ' + o.id + ' · ' + esc(o.business_name) + '</h3>' +
        '<div class="meta">Reçue le ' + esc(fmtDate(o.created_at)) +
        (o.delivery_date ? ' · <b>Livraison souhaitée : ' + esc(fmtDay(o.delivery_date)) + '</b>' : '') + '</div>' +
        salesBadge(o.commercial_code) + salesSelect(o) + '</div>' +
        '<div class="order-total">' + money(o.total) + '</div></div>' +
        '<div class="order-contact">' +
        (o.contact_name ? '<span>' + esc(o.contact_name) + '</span>' : '') +
        '<a href="tel:' + esc(tel) + '">' + esc(o.phone) + '</a>' +
        (o.email ? '<a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' : '') + '</div>' +
        '<div class="order-items">' + items + '</div>' +
        (o.message ? '<div class="order-msg">' + esc(o.message) + '</div>' : '') +
        '<div class="order-actions">' +
        '<label class="sr" for="st-' + o.id + '">Statut</label>' +
        '<select id="st-' + o.id + '" data-status>' + opts + '</select>' +
        '<label class="sr" for="nt-' + o.id + '">Note interne</label>' +
        '<textarea id="nt-' + o.id + '" data-note placeholder="Note interne (visible par vous seule)">' + esc(o.admin_note || '') + '</textarea>' +
        '<button class="btn sm" type="button" data-save-note>Enregistrer la note</button>' +
        '<button class="btn sm danger" type="button" data-del-order>Supprimer</button>' +
        '</div></article>';
    }).join('');
  }

  function bindOrders() {
    $('orderFilter').onchange = loadOrders;
    $('ordersRefresh').onclick = function () { loadOrders().then(function () { toast('Commandes à jour'); }); };
    $('ordersList').addEventListener('change', async function (e) {
      if (e.target.matches('[data-sales-assign]')) {
        var oid = Number(e.target.closest('[data-order]').getAttribute('data-order'));
        var code = e.target.value || null;
        var u = await sb.from('orders').update({ commercial_code: code }).eq('id', oid);
        if (u.error) return fail(u.error);
        toast(code ? 'Commande attribuée' : 'Commande passée en client direct');
        loadOrders();
        return;
      }
      if (!e.target.matches('[data-status]')) return;
      var id = Number(e.target.closest('[data-order]').getAttribute('data-order'));
      var r = await sb.from('orders').update({ status: e.target.value }).eq('id', id);
      if (r.error) return fail(r.error);
      toast('Statut : ' + STATUS[e.target.value]);
      loadOrders();
    });
    $('ordersList').addEventListener('click', async function (e) {
      var card = e.target.closest('[data-order]');
      if (!card) return;
      var id = Number(card.getAttribute('data-order'));
      if (e.target.matches('[data-save-note]')) {
        var r = await sb.from('orders').update({ admin_note: card.querySelector('[data-note]').value.trim() || null }).eq('id', id);
        if (r.error) return fail(r.error);
        toast('Note enregistrée');
      }
      if (e.target.matches('[data-del-order]')) {
        if (!window.confirm('Supprimer définitivement la commande N° ' + id + ' ?')) return;
        var d = await sb.from('orders').delete().eq('id', id);
        if (d.error) return fail(d.error);
        toast('Commande supprimée');
        loadOrders();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  COMMERCIAUX                                                       */
  /* ------------------------------------------------------------------ */
  var SITE_URL = new URL('./', location.href).href;

  function salesLink(code) { return SITE_URL + '?ref=' + encodeURIComponent(code); }
  function spaceLink(c) { return SITE_URL + 'commercial.html?k=' + encodeURIComponent(c.access_token || ''); }
  function waPhone(p) {
    var phone = String(p || '').replace(/\D/g, '');
    if (phone.charAt(0) === '0') phone = '33' + phone.slice(1);
    return phone;
  }

  function salesBadge(code) {
    if (!code) return '<div class="sales-badge direct">Client direct</div>';
    var c = commercials.find(function (x) { return x.code === code; });
    return '<div class="sales-badge">Apporté par ' + esc(c ? c.name : code) + '</div>';
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  function avatar(c) {
    var inner = c.photo_url
      ? '<img src="' + esc(c.photo_url) + '" alt="Photo de ' + esc(c.name) + '">'
      : '<span>' + esc(initials(c.name)) + '</span>';
    return '<label class="avatar" title="Ajouter ou changer la photo">' + inner +
      '<span class="avatar-cam" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><circle cx="12" cy="13" r="3"/></svg></span>' +
      '<input type="file" accept="image/*" data-photo-input aria-label="Photo de profil de ' + esc(c.name) + '" hidden></label>';
  }

  function salesSelect(o) {
    if (!commercials.length) return '';
    var opts = '<option value="">Client direct</option>' + commercials.map(function (c) {
      return '<option value="' + esc(c.code) + '"' + (c.code === o.commercial_code ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    return '<div class="sales-assign"><label class="small" for="sc-' + o.id + '">Commercial</label>' +
      '<select id="sc-' + o.id + '" data-sales-assign>' + opts + '</select></div>';
  }

  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  }

  function monthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  function fillMonths() {
    var sel = $('salesMonth');
    if (sel.options.length) return;
    var d = new Date(); d.setDate(1);
    for (var i = 0; i < 12; i++) {
      var o = document.createElement('option');
      o.value = monthKey(d);
      var label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      o.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      sel.appendChild(o);
      d.setMonth(d.getMonth() - 1);
    }
  }

  async function loadCommercials() {
    var r = await sb.from('commercials').select('*').order('created_at');
    if (r.error) { console.error(r.error); return; }
    commercials = r.data || [];
  }

  async function loadSales() {
    fillMonths();
    await loadCommercials();
    var r = await sb.from('commissions_mensuelles').select('*').eq('mois', $('salesMonth').value);
    if (r.error) { fail(r.error); return; }
    renderSales(r.data || []);
  }

  function renderSales(rows) {
    var byCode = {};
    rows.forEach(function (x) { byCode[x.commercial] = x; });
    var totCom = rows.reduce(function (a, x) { return a + Number(x.commission_a_payer || 0); }, 0);
    var totPcs = rows.reduce(function (a, x) { return a + Number(x.pieces || 0); }, 0);
    var totCa = rows.reduce(function (a, x) { return a + Number(x.chiffre_affaires || 0); }, 0);
    $('salesStats').innerHTML =
      '<div class="stat"><div class="v">' + money(totCom) + '</div><div class="k">Commissions à payer</div></div>' +
      '<div class="stat"><div class="v">' + totPcs + '</div><div class="k">Pièces via commerciaux</div></div>' +
      '<div class="stat"><div class="v">' + money(totCa) + '</div><div class="k">Chiffre d’affaires apporté</div></div>';

    var list = $('salesList');
    if (!commercials.length) {
      list.innerHTML = '<div class="empty">Aucun commercial pour l’instant. Ajoutez le premier ci-dessous.</div>';
      return;
    }
    list.innerHTML = commercials.map(function (c) {
      var s = byCode[c.code] || {};
      var code = esc(c.code);
      return '<article class="acard sales-card' + (c.active ? '' : ' off') + '" data-sales="' + code + '">' +
        '<div class="order-top"><div class="sales-id">' + avatar(c) +
        '<div><h3>' + esc(c.name) + '</h3>' +
        '<div class="meta">' + (c.phone ? esc(c.phone) + ' · ' : '') + (c.active ? 'Actif' : 'Désactivé') + '</div></div></div>' +
        '<div class="order-total">' + money(s.commission_a_payer || 0) + '</div></div>' +
        '<div class="sales-figs">' +
        '<span><b>' + (s.clients || 0) + '</b> client(s)</span>' +
        '<span><b>' + (s.commandes || 0) + '</b> commande(s)</span>' +
        '<span><b>' + (s.pieces || 0) + '</b> pièce(s)</span>' +
        '<span><b>' + money(s.chiffre_affaires || 0) + '</b> de CA</span></div>' +
        '<div class="sales-link">' + esc(salesLink(c.code)) + '</div>' +
        '<div class="inline wrap">' +
        '<button class="btn btn-dark sm" type="button" data-copy>Copier le lien</button>' +
        '<button class="btn sm" type="button" data-wa>Envoyer par WhatsApp</button>' +
        '</div>' +
        '<div class="slot-sub">Son espace privé (ses chiffres uniquement)</div>' +
        '<div class="inline wrap">' +
        '<button class="btn btn-dark sm" type="button" data-space-wa>Envoyer son espace</button>' +
        '<button class="btn sm" type="button" data-space-copy>Copier le lien</button>' +
        '<button class="btn sm" type="button" data-space-new>Nouveau lien secret</button>' +
        '</div>' +
        '<div class="inline wrap" style="margin-top:10px">' +
        '<span class="small">Commission : <b>' + money(c.commission_per_piece) + '</b> / pièce</span>' +
        '<button class="btn sm" type="button" data-edit>Modifier</button>' +
        '<button class="btn sm' + (c.active ? ' danger' : '') + '" type="button" data-toggle>' + (c.active ? 'Désactiver' : 'Réactiver') + '</button>' +
        '</div>' +
        '<div class="sales-edit" data-edit-box hidden>' +
        '<div class="grid-form">' +
        '<div class="field"><label for="en-' + code + '">Nom et prénom</label><input id="en-' + code + '" data-e="name" maxlength="80" value="' + esc(c.name) + '"></div>' +
        '<div class="field"><label for="ep-' + code + '">Téléphone</label><input id="ep-' + code + '" data-e="phone" type="tel" maxlength="40" value="' + esc(c.phone || '') + '"></div>' +
        '<div class="field"><label for="er-' + code + '">Commission par pièce (€)</label><input id="er-' + code + '" data-e="rate" type="number" step="0.01" min="0" value="' + esc(c.commission_per_piece) + '"></div>' +
        '</div>' +
        (c.photo_url ? '<button class="btn sm danger" type="button" data-photo-remove style="margin-bottom:8px">Retirer la photo</button>' : '') +
        '<p class="muted small">Le code du lien (« ' + code + ' ») ne se modifie pas, pour ne pas casser les liens déjà partagés.</p>' +
        '<div class="inline wrap">' +
        '<button class="btn btn-dark sm" type="button" data-save-edit>Enregistrer</button>' +
        '<button class="btn sm" type="button" data-cancel-edit>Annuler</button>' +
        '</div></div></article>';
    }).join('');
  }

  function bindSales() {
    $('salesMonth').onchange = loadSales;

    $('asName').addEventListener('input', function () {
      var codeInput = $('asCode');
      if (!codeInput.dataset.touched) codeInput.value = slugify($('asName').value.split(' ')[0]);
    });
    $('asCode').addEventListener('input', function () { $('asCode').dataset.touched = '1'; });

    $('addSales').addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('asError'); err.hidden = true;
      var name = $('asName').value.trim();
      var code = slugify($('asCode').value);
      var rate = Number($('asRate').value);
      var msg = '';
      if (!name) msg = 'Indiquez le nom du commercial.';
      else if (code.length < 2) msg = 'Le code du lien doit faire au moins 2 caractères.';
      else if (commercials.some(function (c) { return c.code === code; })) msg = 'Le code « ' + code + ' » est déjà utilisé. Choisissez-en un autre.';
      else if (!(rate >= 0)) msg = 'La commission doit être un nombre positif.';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      var r = await sb.from('commercials').insert({
        code: code, name: name, phone: $('asPhone').value.trim() || null, commission_per_piece: rate
      });
      if (r.error) return fail(r.error);
      $('addSales').reset(); $('asRate').value = '0.30'; delete $('asCode').dataset.touched;
      toast('« ' + name + ' » ajouté');
      loadSales();
    });

    $('salesList').addEventListener('change', async function (e) {
      if (!e.target.matches('[data-photo-input]')) return;
      var card = e.target.closest('[data-sales]');
      var code = card.getAttribute('data-sales');
      var c = commercials.find(function (x) { return x.code === code; });
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !c) return;
      try {
        var url = await uploadPhoto(file, 'commerciaux', 'profil');
        if (!url) return;
        var r = await sb.from('commercials').update({ photo_url: url }).eq('code', code);
        if (r.error) throw r.error;
        if (c.photo_url) await deletePhoto(c.photo_url);
        toast('Photo enregistrée');
        loadSales();
      } catch (err) { fail(err); }
    });

    $('salesList').addEventListener('click', async function (e) {
      var card = e.target.closest('[data-sales]');
      if (!card) return;
      var code = card.getAttribute('data-sales');
      var c = commercials.find(function (x) { return x.code === code; });
      if (!c) return;
      var link = salesLink(code);
      if (e.target.matches('[data-copy]')) {
        try { await navigator.clipboard.writeText(link); toast('Lien copié'); }
        catch (err) { window.prompt('Copiez ce lien :', link); }
      }
      if (e.target.matches('[data-wa]')) {
        var text = 'Bonjour ' + c.name.split(' ')[0] + ', voici ton lien personnel Trompe l’Œil Event à partager avec tes clients : ' + link;
        window.open('https://wa.me/' + waPhone(c.phone) + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      }
      if (e.target.matches('[data-space-wa]')) {
        var msg = 'Bonjour ' + c.name.split(' ')[0] + ', voici ton espace personnel pour suivre tes ventes et ta commission (ne le partage pas) : ' + spaceLink(c);
        window.open('https://wa.me/' + waPhone(c.phone) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      }
      if (e.target.matches('[data-space-copy]')) {
        try { await navigator.clipboard.writeText(spaceLink(c)); toast('Lien de son espace copié'); }
        catch (err) { window.prompt('Copiez ce lien :', spaceLink(c)); }
      }
      if (e.target.matches('[data-space-new]')) {
        if (!window.confirm('Créer un nouveau lien secret pour ' + c.name + ' ? L’ancien lien de son espace ne marchera plus (son lien client ne change pas).')) return;
        var tok = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
        var n = await sb.from('commercials').update({ access_token: tok }).eq('code', code);
        if (n.error) return fail(n.error);
        toast('Nouveau lien créé. Renvoyez-le-lui.');
        loadSales();
      }
      if (e.target.matches('[data-edit]') || e.target.matches('[data-cancel-edit]')) {
        var box = card.querySelector('[data-edit-box]');
        box.hidden = !box.hidden;
        if (!box.hidden) card.querySelector('[data-e="name"]').focus();
      }
      if (e.target.matches('[data-photo-remove]')) {
        if (!window.confirm('Retirer la photo de ' + c.name + ' ?')) return;
        var pr = await sb.from('commercials').update({ photo_url: null }).eq('code', code);
        if (pr.error) return fail(pr.error);
        await deletePhoto(c.photo_url);
        toast('Photo retirée');
        loadSales();
      }
      if (e.target.matches('[data-save-edit]')) {
        var newName = card.querySelector('[data-e="name"]').value.trim();
        var newPhone = card.querySelector('[data-e="phone"]').value.trim();
        var rate = Number(card.querySelector('[data-e="rate"]').value);
        if (!newName) return toast('Le nom ne peut pas être vide', true);
        if (!(rate >= 0)) return toast('Commission invalide', true);
        var r = await sb.from('commercials')
          .update({ name: newName, phone: newPhone || null, commission_per_piece: rate }).eq('code', code);
        if (r.error) return fail(r.error);
        toast('Modifications enregistrées');
        loadSales();
      }
      if (e.target.matches('[data-toggle]')) {
        if (c.active && !window.confirm('Désactiver ' + c.name + ' ? Son lien n’attribuera plus de nouveaux clients, mais ses clients actuels restent comptés pour lui.')) return;
        var t = await sb.from('commercials').update({ active: !c.active }).eq('code', code);
        if (t.error) return fail(t.error);
        toast(c.active ? 'Commercial désactivé' : 'Commercial réactivé');
        loadSales();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  PRODUITS                                                          */
  /* ------------------------------------------------------------------ */
  async function loadProducts() {
    var r = await sb.from('products').select('*').order('sort_order');
    if (r.error) { fail(r.error); return; }
    products = T.sortProducts(r.data || []);
    renderProducts();
  }

  function renderProducts() {
    $('productsList').innerHTML = CATS.map(function (c) {
      var list = products.filter(function (p) { return p.category === c[0]; });
      return '<h3 class="cat-title">' + c[1] + ' <span class="muted small">(' + list.length + ')</span></h3>' +
        (list.length ? list.map(productRow).join('') : '<div class="empty">Aucun produit</div>');
    }).join('');
  }

  function productRow(p) {
    var id = esc(p.id);
    var vis = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '">'
      : '<span class="pastille" style="background:' + T.ball(p.color) + '" aria-hidden="true"></span>';
    return '<div class="prod' + (p.active ? '' : ' off') + '" data-prod="' + id + '">' +
      '<div class="prod-vis">' + vis + '</div>' +
      '<div class="prod-fields">' +
      '<div class="field"><label for="pn-' + id + '">Nom</label><input id="pn-' + id + '" data-f="name" maxlength="60" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label for="pc-' + id + '">Couleur</label><input id="pc-' + id + '" data-f="color" type="color" value="' + esc(p.color) + '"></div>' +
      '<div class="field f-order"><label for="po-' + id + '">Ordre</label><input id="po-' + id + '" data-f="sort_order" type="number" step="1" value="' + Number(p.sort_order) + '"></div>' +
      '</div>' +
      '<div class="prod-actions">' +
      '<label class="check-line" style="min-height:40px"><input type="checkbox" data-f="active"' + (p.active ? ' checked' : '') + '> Visible sur la carte</label>' +
      '<label class="btn sm file-btn">' + (p.image_url ? 'Changer la photo' : 'Ajouter une photo') + '<input type="file" accept="image/*" data-prod-photo></label>' +
      (p.image_url ? '<button class="btn sm" type="button" data-prod-unphoto>Retirer la photo</button>' : '') +
      '<button class="btn btn-dark sm" type="button" data-prod-save>Enregistrer</button>' +
      '<button class="btn sm danger" type="button" data-prod-del>Supprimer</button>' +
      '</div></div>';
  }

  function bindProducts() {
    $('addProduct').addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('apError'); err.hidden = true;
      var cat = $('apCat').value, name = $('apName').value.trim();
      if (!name) { err.textContent = 'Indiquez le nom du goût.'; err.hidden = false; return; }
      var maxOrder = products.filter(function (p) { return p.category === cat; })
        .reduce(function (m, p) { return Math.max(m, p.sort_order); }, 0);
      var r = await sb.from('products').insert({ category: cat, name: name, color: $('apColor').value, sort_order: maxOrder + 1 });
      if (r.error) { err.textContent = T.errText(r.error); err.hidden = false; return; }
      $('apName').value = '';
      toast('« ' + name + ' » ajouté');
      loadProducts();
    });

    var list = $('productsList');
    list.addEventListener('click', async function (e) {
      var row = e.target.closest('[data-prod]');
      if (!row) return;
      var id = row.getAttribute('data-prod');
      var p = products.find(function (x) { return x.id === id; });
      if (e.target.matches('[data-prod-save]')) {
        var name = row.querySelector('[data-f="name"]').value.trim();
        if (!name) return toast('Le nom ne peut pas être vide', true);
        var r = await sb.from('products').update({
          name: name,
          color: row.querySelector('[data-f="color"]').value,
          sort_order: parseInt(row.querySelector('[data-f="sort_order"]').value, 10) || 0,
          active: row.querySelector('[data-f="active"]').checked
        }).eq('id', id);
        if (r.error) return fail(r.error);
        toast('Enregistré');
        loadProducts();
      }
      if (e.target.matches('[data-prod-unphoto]')) {
        var old = p.image_url;
        var u = await sb.from('products').update({ image_url: null }).eq('id', id);
        if (u.error) return fail(u.error);
        await deletePhoto(old);
        toast('Photo retirée');
        loadProducts();
      }
      if (e.target.matches('[data-prod-del]')) {
        if (!window.confirm('Supprimer « ' + p.name + ' » de la carte ?\n(Pour le masquer seulement, décochez « Visible sur la carte ».)')) return;
        var d = await sb.from('products').delete().eq('id', id);
        if (d.error) return fail(d.error);
        await deletePhoto(p.image_url);
        toast('Produit supprimé');
        loadProducts();
      }
    });
    list.addEventListener('change', async function (e) {
      if (!e.target.matches('[data-prod-photo]')) return;
      var row = e.target.closest('[data-prod]'), id = row.getAttribute('data-prod');
      var p = products.find(function (x) { return x.id === id; });
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        var url = await uploadPhoto(file, 'produits', 'carre');
        if (!url) return;
        var r = await sb.from('products').update({ image_url: url }).eq('id', id);
        if (r.error) throw r.error;
        if (p.image_url) await deletePhoto(p.image_url);
        toast('Photo enregistrée');
        loadProducts();
      } catch (err) { fail(err); }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  PRIX & OFFRE                                                      */
  /* ------------------------------------------------------------------ */
  async function loadSettings() {
    var r = await sb.from('settings').select('*').eq('id', 1).single();
    if (r.error) { fail(r.error); return; }
    settings = r.data;
    fillPrices();
    renderSlots();
  }

  function tierRow(t, i) {
    return '<div class="tier-row" data-tier-row>' +
      '<div class="field"><label for="tm-' + i + '">À partir de (pièces)</label><input id="tm-' + i + '" type="number" min="1" step="1" data-t="min" value="' + esc(t.min) + '"' + (i === 0 ? ' readonly' : '') + '></div>' +
      '<div class="field"><label for="tp-' + i + '">Prix la pièce (€)</label><input id="tp-' + i + '" type="number" min="0" step="0.01" data-t="price" value="' + esc(t.price) + '"></div>' +
      (i === 0 ? '<span style="width:44px"></span>' : '<button class="round" type="button" data-del-tier aria-label="Supprimer ce palier">×</button>') +
      '</div>';
  }
  function renderTiers(tiers) {
    $('tiersEditor').innerHTML = tiers.map(tierRow).join('');
  }
  function readTiers() {
    return Array.prototype.map.call(document.querySelectorAll('[data-tier-row]'), function (r) {
      return { min: parseInt(r.querySelector('[data-t="min"]').value, 10), price: Number(r.querySelector('[data-t="price"]').value) };
    });
  }

  function fillPrices() {
    var s = settings;
    var tiers = T.sortedTiers(s.tiers);
    if (!tiers.length || tiers[0].min !== 1) tiers.unshift({ min: 1, price: tiers.length ? tiers[0].price : 3.5 });
    renderTiers(tiers);
    $('sCupPrice').value = s.cupcake_price;
    $('sCupMin').value = s.cupcake_min;
    $('sPromoOn').checked = !!s.promo_active;
    $('sPromoTitle').value = s.promo_title || '';
    $('sPromoSize').value = s.promo_size;
    $('sPromoPrice').value = s.promo_price;
    $('sCustMin').value = s.custom_min;
    $('sCustMax').value = s.custom_max;
    $('sTagline').value = s.tagline || '';
    $('sNote').value = s.price_note || '';
    $('sTleMin').value = s.tle_min_per_flavor;
    $('sBannerOn').checked = !!s.banner_active;
    $('sBannerEyebrow').value = s.banner_eyebrow || '';
    $('sBannerTitle').value = s.banner_title || '';
    $('sBannerText').value = s.banner_text || '';
    $('sBpTop').value = s.banner_price_top == null ? 'dès' : s.banner_price_top;
    $('sBpMain').value = s.banner_price_main || '';
    $('sBpBottom').value = s.banner_price_bottom == null ? 'la pièce' : s.banner_price_bottom;
  }

  function bindPrices() {
    $('addTier').onclick = function () {
      var t = readTiers(), last = t[t.length - 1] || { min: 1, price: 3.5 };
      t.push({ min: last.min + 50, price: Math.max(0, Math.round((last.price - 0.2) * 100) / 100) });
      renderTiers(t);
    };
    $('tiersEditor').addEventListener('click', function (e) {
      if (!e.target.matches('[data-del-tier]')) return;
      e.target.closest('[data-tier-row]').remove();
      renderTiers(readTiers());
    });
    $('pricesForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('pricesError'); err.hidden = true;
      var tiers = readTiers();
      var problem = null;
      tiers.forEach(function (t, i) {
        if (!(t.min >= 1) || !(t.price >= 0) || isNaN(t.price)) problem = 'Chaque palier doit avoir un nombre de pièces et un prix.';
        else if (i > 0 && t.min <= tiers[i - 1].min) problem = 'Les paliers doivent aller en augmentant (ex. 1, puis 60, puis 151).';
      });
      var num = function (id) { return Number($(id).value); };
      var int = function (id) { return parseInt($(id).value, 10); };
      var data = {
        tiers: tiers,
        cupcake_price: num('sCupPrice'), cupcake_min: int('sCupMin'),
        promo_active: $('sPromoOn').checked, promo_title: $('sPromoTitle').value.trim() || 'Bouquet',
        promo_size: int('sPromoSize'), promo_price: num('sPromoPrice'),
        custom_min: int('sCustMin'), custom_max: int('sCustMax'),
        tagline: $('sTagline').value.trim(), price_note: $('sNote').value.trim(),
        tle_min_per_flavor: int('sTleMin'),
        banner_active: $('sBannerOn').checked, banner_eyebrow: $('sBannerEyebrow').value.trim(),
        banner_title: $('sBannerTitle').value.trim(), banner_text: $('sBannerText').value.trim(),
        banner_price_top: $('sBpTop').value.trim(), banner_price_main: $('sBpMain').value.trim(),
        banner_price_bottom: $('sBpBottom').value.trim(),
        updated_at: new Date().toISOString()
      };
      ['cupcake_price', 'promo_price'].forEach(function (k) { if (!(data[k] >= 0)) problem = 'Vérifiez les prix (nombre positif).'; });
      ['cupcake_min', 'promo_size', 'custom_min', 'custom_max', 'tle_min_per_flavor'].forEach(function (k) { if (!(data[k] >= 1)) problem = 'Vérifiez les nombres de pièces (1 minimum).'; });
      if (data.custom_max < data.custom_min) problem = 'Bouquet sur mesure : le maximum doit être supérieur au minimum.';
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      var r = await sb.from('settings').update(data).eq('id', 1).select().single();
      if (r.error) { err.textContent = T.errText(r.error); err.hidden = false; return; }
      settings = r.data;
      fillPrices();
      toast('Prix enregistrés · la carte est à jour');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  PHOTOS DE LA CARTE                                                */
  /* ------------------------------------------------------------------ */
  var MEDIA = {
    tle:     { image: 'tle_image_url',     video: 'tle_video_url',     mode: 'tle_media' },
    cupcake: { image: 'cupcake_image_url', video: 'cupcake_video_url', mode: 'cupcake_media' }
  };
  var VIDEO_MAX = 50 * 1024 * 1024;

  function renderSlots() {
    document.querySelectorAll('[data-media]').forEach(function (slot) {
      var m = MEDIA[slot.getAttribute('data-media')];
      var img = settings[m.image], vid = settings[m.video], mode = settings[m.mode];
      slot.querySelector('[data-prev="image"]').innerHTML = img
        ? '<img src="' + esc(img) + '" alt="Aperçu de la photo">' : 'Pas de photo';
      slot.querySelector('[data-prev="video"]').innerHTML = vid
        ? '<video src="' + esc(vid) + '" muted loop playsinline autoplay aria-label="Aperçu de la vidéo"></video>' : 'Pas de vidéo';
      slot.querySelector('[data-remove="image"]').hidden = !img;
      slot.querySelector('[data-remove="video"]').hidden = !vid;
      slot.querySelectorAll('input[type=radio]').forEach(function (r) { r.checked = r.value === mode; });
      // Ce qui est réellement affiché sur la carte (repli si le fichier choisi manque)
      var shown = (mode === 'video' && vid) || (!img && vid) ? 'video' : (img ? 'image' : null);
      slot.querySelector('[data-prev="image"]').classList.toggle('is-shown', shown === 'image');
      slot.querySelector('[data-prev="video"]').classList.toggle('is-shown', shown === 'video');
    });
  }

  async function saveSettings(patch) {
    var r = await sb.from('settings').update(patch).eq('id', 1).select().single();
    if (r.error) throw r.error;
    settings = r.data;
    renderSlots();
  }

  /** Envoi direct vers Supabase Storage avec suivi de progression */
  async function uploadWithProgress(path, blob, onProgress) {
    var cfg = window.TLE_CONFIG, sess = (await sb.auth.getSession()).data.session;
    if (!sess) throw new Error('Session expirée : reconnectez-vous.');
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', cfg.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + path);
      xhr.setRequestHeader('Authorization', 'Bearer ' + sess.access_token);
      xhr.setRequestHeader('apikey', cfg.SUPABASE_KEY);
      xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          var msg = 'Envoi refusé (' + xhr.status + ')';
          try { var j = JSON.parse(xhr.responseText); if (j.message) msg += ' : ' + j.message; } catch (e) {}
          if (xhr.status === 413) msg = 'Vidéo trop lourde pour l\u2019envoi (50 Mo maximum).';
          reject(new Error(msg));
        }
      };
      xhr.onerror = function () { reject(new Error('Connexion interrompue pendant l\u2019envoi. Réessayez en Wi-Fi si possible.')); };
      xhr.send(blob);
      uploadWithProgress.current = xhr;
    });
  }

  /** Allège la vidéo, l'envoie avec une barre de progression et renvoie son adresse (null si annulé) */
  async function uploadVideo(file) {
    if (!/^video\//.test(file.type)) throw new Error('Ce fichier n\u2019est pas une vidéo.');
    var modal = T.studio.progressModal('Vidéo de la carte');
    try {
      modal.set('Lecture de la vidéo…', 2);
      var res = await T.studio.optimizeVideo(file, modal);
      if (!res || modal.cancelled) return null;
      var blob = res.blob;
      if (blob.size > VIDEO_MAX) throw new Error('Vidéo trop lourde (' + Math.round(blob.size / 1048576) + ' Mo). Maximum 50 Mo : raccourcissez-la à 10-15 secondes.');
      var type = (blob.type || file.type || 'video/mp4').split(';')[0];
      var ext = type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4';
      var path = 'carte/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      var mo = (blob.size / 1048576).toFixed(1).replace('.', ',');
      modal.onCancel = function () { if (uploadWithProgress.current) uploadWithProgress.current.abort(); };
      await uploadWithProgress(path, new Blob([blob], { type: type }), function (f) {
        modal.set('Envoi de la vidéo (' + mo + ' Mo)… ' + Math.round(f * 100) + ' %', 60 + f * 40);
      });
      if (modal.cancelled) return null;
      modal.set('Vidéo envoyée', 100);
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } finally {
      modal.close();
    }
  }

  function bindSlots() {
    document.querySelectorAll('[data-media]').forEach(function (slot) {
      var m = MEDIA[slot.getAttribute('data-media')];
      slot.querySelectorAll('input[type=radio]').forEach(function (r) {
        r.addEventListener('change', async function () {
          if (!r.checked) return;
          var key = r.value === 'video' ? m.video : m.image;
          try {
            var patch = {}; patch[m.mode] = r.value;
            await saveSettings(patch);
            toast(settings[key] ? 'La carte affiche maintenant la ' + (r.value === 'video' ? 'vidéo' : 'photo')
              : 'Choix enregistré : ajoutez une ' + (r.value === 'video' ? 'vidéo' : 'photo') + ' pour qu\u2019elle s\u2019affiche');
          } catch (err) { fail(err); }
        });
      });
      slot.querySelectorAll('[data-file]').forEach(function (input) {
        input.addEventListener('change', async function (e) {
          var file = e.target.files && e.target.files[0], kind = input.getAttribute('data-file');
          e.target.value = '';
          if (!file) return;
          try {
            var key = kind === 'video' ? m.video : m.image, old = settings[key], url;
            if (kind === 'video') {
              url = await uploadVideo(file);
              if (!url) return;
            } else {
              url = await uploadPhoto(file, 'carte', 'bandeau');
              if (!url) return;
            }
            var patch = {}; patch[key] = url;
            await saveSettings(patch);
            if (old) await deletePhoto(old);
            toast(kind === 'video' ? 'Vidéo enregistrée' : 'Photo enregistrée');
          } catch (err) { fail(err); }
        });
      });
      slot.querySelectorAll('[data-remove]').forEach(function (btn) {
        btn.onclick = async function () {
          var key = btn.getAttribute('data-remove') === 'video' ? m.video : m.image, old = settings[key];
          try {
            var patch = {}; patch[key] = null;
            await saveSettings(patch);
            await deletePhoto(old);
            toast(btn.getAttribute('data-remove') === 'video' ? 'Vidéo retirée' : 'Photo retirée');
          } catch (err) { fail(err); }
        };
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Démarrage                                                         */
  /* ------------------------------------------------------------------ */
  async function start() {
    if (!T.configured) { show('viewSetup'); return; }
    if (!sb) {
      show('viewSetup');
      document.querySelector('#viewSetup h1').textContent = 'Connexion à Supabase impossible';
      document.querySelector('#viewSetup p').textContent = 'Le module Supabase n’a pas pu être chargé. Vérifiez votre connexion Internet puis rechargez la page.';
      return;
    }
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { switchTab(b.getAttribute('data-tab')); };
    });
    bindAuth(); bindOrders(); bindProducts(); bindPrices(); bindSlots(); bindSales();
    var isRecovery = /type=recovery/.test(location.hash);
    var s = await sb.auth.getSession();
    if (isRecovery) { show('viewReset'); return; }
    afterLogin(s.data.session);
  }
  start();
})();
