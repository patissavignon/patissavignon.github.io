/* =====================================================================
   Espace commercial : un commercial voit uniquement ses propres chiffres
   grâce à son lien privé (commercial.html?k=CLE).
   ===================================================================== */
(function () {
  'use strict';

  var T = window.TLE;
  var $ = function (id) { return document.getElementById(id); };
  var esc = T.esc, money = T.money;
  var STATUS = { nouvelle: 'Nouvelle', confirmee: 'Confirmée', livree: 'Livrée', annulee: 'Annulée' };
  var SITE_URL = new URL('./', location.href).href;
  var token = new URLSearchParams(location.search).get('k') || '';
  var data = null;

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function showError(msg) {
    $('cmLoading').hidden = true;
    $('cmBody').hidden = true;
    $('cmError').textContent = msg;
    $('cmError').hidden = false;
  }
  function monthLabel(iso) {
    var d = new Date(iso + 'T12:00:00');
    var s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  function myLink() { return SITE_URL + '?ref=' + encodeURIComponent(data.code); }

  async function load(month) {
    if (!T.sb) { showError('Connexion impossible. Vérifiez votre connexion Internet puis rechargez la page.'); return; }
    var args = { p_token: token };
    if (month) args.p_month = month;
    var r = await T.sb.rpc('commercial_dashboard', args);
    if (r.error) { showError(T.errText(r.error)); return; }
    data = r.data;
    render();
  }

  function render() {
    $('cmLoading').hidden = true;
    $('cmBody').hidden = false;
    $('cmName').textContent = data.name;
    var av = $('cmAvatar');
    av.innerHTML = data.photo_url
      ? '<img src="' + esc(data.photo_url) + '" alt="">'
      : '<span>' + esc(String(data.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('')) + '</span>';
    $('cmRate').textContent = 'Votre commission : ' + money(data.commission_par_piece) + ' par pièce commandée (hors commandes annulées).' +
      (data.active ? '' : ' Votre lien est actuellement désactivé.');

    var months = (data.mois_disponibles || []).slice();
    if (months.indexOf(data.mois) === -1) months.unshift(data.mois);
    months.sort().reverse();
    $('cmMonth').innerHTML = months.map(function (m) {
      return '<option value="' + esc(m) + '"' + (m === data.mois ? ' selected' : '') + '>' + esc(monthLabel(m)) + '</option>';
    }).join('');

    var s = data.stats || {};
    $('cmStats').innerHTML =
      '<div class="stat"><div class="v">' + money(s.commission) + '</div><div class="k">Ma commission</div></div>' +
      '<div class="stat"><div class="v">' + (s.pieces || 0) + '</div><div class="k">Pièces vendues</div></div>' +
      '<div class="stat"><div class="v">' + (s.commandes || 0) + '</div><div class="k">Commandes</div></div>' +
      '<div class="stat"><div class="v">' + money(s.chiffre_affaires) + '</div><div class="k">Chiffre d’affaires</div></div>';

    $('cmLink').textContent = myLink();

    var orders = data.commandes || [];
    $('cmOrders').innerHTML = orders.length ? orders.map(function (o) {
      return '<div class="cm-row"><div><b>' + esc(o.client) + '</b><div class="muted small">' + esc(fmtDate(o.date)) +
        ' · ' + esc(STATUS[o.status] || o.status) + '</div></div><div class="cm-right">' + o.pieces + ' pcs<div class="muted small">' +
        money(o.pieces * data.commission_par_piece) + '</div></div></div>';
    }).join('') : '<p class="muted small">Aucune commande ce mois-ci pour l’instant.</p>';

    var clients = data.clients || [];
    $('cmClients').innerHTML = clients.length ? clients.map(function (c) {
      return '<div class="cm-row"><div><b>' + esc(c.client) + '</b><div class="muted small">Client depuis le ' +
        esc(fmtDate(c.depuis)) + '</div></div><div class="cm-right">' + c.commandes + ' cde(s)</div></div>';
    }).join('') : '<p class="muted small">Pas encore de client. Partagez votre lien pour commencer.</p>';
  }

  function bind() {
    $('cmMonth').onchange = function () { load($('cmMonth').value); };
    $('cmCopy').onclick = async function () {
      try { await navigator.clipboard.writeText(myLink()); toast('Lien copié'); }
      catch (e) { window.prompt('Copiez ce lien :', myLink()); }
    };
    $('cmShare').onclick = function () {
      var text = 'Bonjour, découvrez nos pâtisseries trompe-l’œil au vrai fruit et commandez en ligne : ' + myLink();
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    };
  }

  if (token.length < 32) { showError('Ce lien n’est pas valide. Demandez votre lien personnel à Trompe l’Œil Event.'); return; }
  bind();
  load();
})();
