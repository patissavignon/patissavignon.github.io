/* =====================================================================
   Bouton « Installer l'appli » : sur Android (Chrome, Samsung Internet,
   Edge) il ouvre directement la fenêtre d'installation ; sur iPhone il
   explique la marche à suivre (Apple n'autorise pas mieux).
   ===================================================================== */
(function () {
  'use strict';

  var bar = document.getElementById('installBar');
  if (!bar) return;
  var btn = document.getElementById('installBtn');
  var hint = document.getElementById('installHint');
  var DISMISS_KEY = 'tle-install-ferme';
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i.test(ua);
  var installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var deferred = null;
  var mode = '';

  function dismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 3 * 24 * 3600 * 1000; } catch (e) { return false; }
  }
  function show(m, text, label) {
    mode = m;
    if (text) hint.textContent = text;
    btn.textContent = label || 'Installer';
    bar.hidden = false;
  }
  function hide() { bar.hidden = true; }

  if (installed) return;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (dismissedRecently()) return;
    show('prompt', 'Commandez en 2 clics depuis votre écran d’accueil', 'Installer');
  });
  window.addEventListener('appinstalled', function () { deferred = null; hide(); });

  btn.onclick = async function () {
    if (mode === 'prompt' && deferred) {
      deferred.prompt();
      var choice = await deferred.userChoice;
      deferred = null;
      if (choice && choice.outcome === 'accepted') hide();
      return;
    }
    if (mode === 'ios') {
      alert('Pour installer l’appli sur iPhone :\n\n1. Touchez le bouton Partager (carré avec une flèche vers le haut)\n2. Choisissez « Sur l’écran d’accueil »\n3. Touchez « Ajouter »');
      return;
    }
    if (mode === 'inapp') {
      alert('Pour installer l’appli :\n\n1. Touchez les 3 points ⋮ en haut à droite\n2. Choisissez « Ouvrir dans Chrome » (ou « Ouvrir dans le navigateur »)\n3. Touchez ensuite « Installer » sur la page');
      return;
    }
    alert('Pour installer l’appli :\n\n1. Touchez les 3 points ⋮ en haut à droite\n2. Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil »');
  };

  document.getElementById('installClose').onclick = function () {
    hide();
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* navigation privée */ }
  };

  if (dismissedRecently()) {
    // L'utilisateur a fermé le bandeau : on ne le remontre pas pendant 3 jours
    return;
  }

  if (isIOS) {
    show('ios', 'Ajoutez-la à votre écran d’accueil en 3 gestes', 'Comment ?');
  } else if (inApp) {
    show('inapp', 'Ouvrez cette page dans Chrome pour l’installer', 'Comment ?');
  } else if (isAndroid) {
    // Si Chrome n'a pas proposé l'installation après quelques secondes, on explique la marche à suivre
    setTimeout(function () {
      if (!deferred && bar.hidden) show('manual', 'Ajoutez-la à votre écran d’accueil', 'Comment ?');
    }, 3500);
  }
})();
