/* =====================================================================
   « Studio photo » du tableau de bord.
   Chaque photo envoyée passe par ici avant d'être enregistrée :
     1. Format identique pour toutes : carré 1000×1000 pour les produits,
        paysage 1600×1000 pour les photos de la carte.
     2. Cadrage : on fait glisser la photo et on règle le zoom.
     3. Harmonisation : la même retouche est appliquée à toutes les photos
        (balance des blancs, lumière, contraste, touche chaude).
        Les photos semblent ainsi venir du même shooting.
   Utilisation : TLE.studio.open(fichier, 'carre' | 'bandeau')
                 → Promise<Blob JPEG | null si annulé>
   ===================================================================== */
(function () {
  'use strict';

  var FORMATS = {
    carre:   { w: 1000, h: 1000, label: 'Photo produit · format carré' },
    bandeau: { w: 1600, h: 1000, label: 'Photo de la carte · format paysage' }
  };

  /* Réglages de la « signature » visuelle, communs à toutes les photos */
  var LOOK = {
    whiteBalance: 0.85,  // force de la correction des blancs (0 à 1)
    targetLight: 0.56,   // luminosité moyenne visée (0 = noir, 1 = blanc)
    blackPoint: 8,       // noir le plus profond (0 à 255)
    whitePoint: 249,     // blanc le plus clair (0 à 255)
    warmth: 0.025,       // touche chaude « pâtisserie »
    saturation: 1.05     // couleurs un peu plus gourmandes
  };

  /* ------------------------------------------------------------------ */
  /*  Harmonisation des couleurs (sur les pixels d'un canvas)           */
  /* ------------------------------------------------------------------ */
  function harmonize(ctx, w, h) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data, n = d.length / 4, i;
    var hist = new Uint32Array(256);
    for (i = 0; i < d.length; i += 4) hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
    function pct(p) { var t = n * p, s = 0; for (var k = 0; k < 256; k++) { s += hist[k]; if (s >= t) return k; } return 255; }
    var lo = pct(0.01), hi = pct(0.99), top = pct(0.96);
    if (hi - lo < 40) { lo = Math.max(0, lo - 20); hi = Math.min(255, hi + 20); }

    // Balance des blancs : on rend neutres les zones les plus claires
    // (assiette, fond, nappe), si elles sont déjà presque blanches.
    var sr = 0, sg = 0, sb = 0, c = 0;
    for (i = 0; i < d.length; i += 4) {
      var l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (l >= top) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; c++; }
    }
    var gr = 1, gg = 1, gb = 1;
    if (c > 50) {
      sr /= c; sg /= c; sb /= c;
      var avg = (sr + sg + sb) / 3, spread = Math.max(sr, sg, sb) - Math.min(sr, sg, sb);
      if (spread < 70 && avg > 120) {
        var k = LOOK.whiteBalance;
        gr = 1 + (avg / sr - 1) * k; gg = 1 + (avg / sg - 1) * k; gb = 1 + (avg / sb - 1) * k;
      }
    }

    // Lumière : on ramène la luminosité moyenne vers la même valeur pour toutes
    var mean = 0;
    for (var v = 0; v < 256; v++) mean += hist[v] * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    mean = Math.min(0.95, Math.max(0.05, mean / n));
    var gamma = Math.min(1.6, Math.max(0.6, Math.log(LOOK.targetLight) / Math.log(mean)));

    function curve(x) {
      var y = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
      return LOOK.blackPoint + Math.pow(y, gamma) * (LOOK.whitePoint - LOOK.blackPoint);
    }
    var lr = new Float32Array(256), lg = new Float32Array(256), lb = new Float32Array(256);
    for (v = 0; v < 256; v++) {
      lr[v] = curve(Math.min(255, v * gr)) * (1 + LOOK.warmth);
      lg[v] = curve(Math.min(255, v * gg));
      lb[v] = curve(Math.min(255, v * gb)) * (1 - LOOK.warmth);
    }
    var s = LOOK.saturation;
    for (i = 0; i < d.length; i += 4) {
      var r = lr[d[i]], g = lg[d[i + 1]], b = lb[d[i + 2]];
      var L = r * 0.299 + g * 0.587 + b * 0.114;
      d[i] = L + (r - L) * s; d[i + 1] = L + (g - L) * s; d[i + 2] = L + (b - L) * s;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ------------------------------------------------------------------ */
  /*  Fenêtre de cadrage                                                */
  /* ------------------------------------------------------------------ */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error('Ce fichier n’est pas une image.')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image illisible (format non pris en charge ?).')); };
      img.src = url;
    });
  }

  function open(file, formatName) {
    var F = FORMATS[formatName] || FORMATS.carre;
    return loadImage(file).then(function (loaded) {
      return new Promise(function (resolve) {
        var img = loaded.img, iw = img.naturalWidth, ih = img.naturalHeight;
        var cover = Math.max(F.w / iw, F.h / ih);           // zoom minimum : la photo remplit le cadre
        var st = { zoom: 1, cx: iw / 2, cy: ih / 2, harmonize: true };

        var wrap = document.createElement('div');
        wrap.className = 'studio-wrap';
        wrap.innerHTML =
          '<div class="studio" role="dialog" aria-modal="true" aria-labelledby="studioTitle">' +
          '<h3 id="studioTitle">' + F.label + '</h3>' +
          '<p class="muted small">Faites glisser la photo pour la cadrer. Toutes vos photos auront ce même format.</p>' +
          '<div class="studio-frame" style="aspect-ratio:' + F.w + '/' + F.h + '"><canvas></canvas><div class="studio-grid" aria-hidden="true"></div></div>' +
          '<label class="studio-zoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value="1" aria-label="Zoom"></label>' +
          '<label class="check-line"><input type="checkbox" checked> Harmoniser les couleurs (recommandé)</label>' +
          '<div class="studio-actions"><button class="btn" type="button" data-cancel>Annuler</button>' +
          '<button class="btn btn-dark" type="button" data-ok>Valider la photo</button></div></div>';
        document.body.appendChild(wrap);

        var frame = wrap.querySelector('.studio-frame'), canvas = wrap.querySelector('canvas');
        var zoom = wrap.querySelector('input[type=range]'), harm = wrap.querySelector('input[type=checkbox]');
        var pw = 0, ph = 0, raf = 0;

        function srcRect() {
          var k = cover * st.zoom, sw = F.w / k, sh = F.h / k;
          st.cx = Math.min(iw - sw / 2, Math.max(sw / 2, st.cx));
          st.cy = Math.min(ih - sh / 2, Math.max(sh / 2, st.cy));
          return { x: st.cx - sw / 2, y: st.cy - sh / 2, w: sw, h: sh };
        }
        function draw(cv, w, h) {
          var r = srcRect(), ctx = cv.getContext('2d', { willReadFrequently: true });
          cv.width = w; cv.height = h;
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h);
          if (st.harmonize) harmonize(ctx, w, h);
        }
        function render() {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(function () {
            var box = frame.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
            pw = box.width; ph = box.height;
            draw(canvas, Math.round(pw * dpr), Math.round(ph * dpr));
          });
        }

        // Glisser pour cadrer (souris et doigt)
        var drag = null;
        frame.addEventListener('pointerdown', function (e) {
          drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy };
          frame.setPointerCapture(e.pointerId);
        });
        frame.addEventListener('pointermove', function (e) {
          if (!drag) return;
          var r = srcRect(), kx = r.w / pw, ky = r.h / ph;
          st.cx = drag.cx - (e.clientX - drag.x) * kx;
          st.cy = drag.cy - (e.clientY - drag.y) * ky;
          render();
        });
        frame.addEventListener('pointerup', function () { drag = null; });
        frame.addEventListener('pointercancel', function () { drag = null; });
        frame.addEventListener('wheel', function (e) {
          e.preventDefault();
          st.zoom = Math.min(3, Math.max(1, st.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
          zoom.value = st.zoom; render();
        }, { passive: false });
        zoom.addEventListener('input', function () { st.zoom = Number(zoom.value); render(); });
        harm.addEventListener('change', function () { st.harmonize = harm.checked; render(); });
        window.addEventListener('resize', render);

        function close(result) {
          window.removeEventListener('resize', render);
          URL.revokeObjectURL(loaded.url);
          wrap.remove();
          resolve(result);
        }
        wrap.querySelector('[data-cancel]').onclick = function () { close(null); };
        wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(null); });
        wrap.querySelector('[data-ok]').onclick = function () {
          var out = document.createElement('canvas');
          draw(out, F.w, F.h);
          out.toBlob(function (b) { close(b); }, 'image/jpeg', 0.88);
        };

        render();
        wrap.querySelector('[data-ok]').focus();
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Vidéos : fenêtre de progression + allègement automatique          */
  /* ------------------------------------------------------------------ */
  var VIDEO = { w: 1280, h: 800, fps: 30, maxSeconds: 20, bitrate: 3000000 };

  /** Petite fenêtre avec aperçu, barre de progression et bouton Annuler */
  function progressModal(title) {
    var wrap = document.createElement('div');
    wrap.className = 'studio-wrap';
    wrap.innerHTML =
      '<div class="studio" role="dialog" aria-modal="true" aria-labelledby="vpTitle">' +
      '<h3 id="vpTitle"></h3>' +
      '<div class="studio-frame vp-frame" style="aspect-ratio:' + VIDEO.w + '/' + VIDEO.h + '"></div>' +
      '<div class="vp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="vp-fill"></div></div>' +
      '<p class="vp-text" aria-live="polite"></p>' +
      '<p class="muted small">Gardez cette page ouverte et l\u2019écran allumé pendant l\u2019opération.</p>' +
      '<div class="studio-actions"><button class="btn" type="button" data-cancel>Annuler</button></div></div>';
    wrap.querySelector('#vpTitle').textContent = title;
    document.body.appendChild(wrap);
    var api = {
      cancelled: false,
      onCancel: null,
      frame: wrap.querySelector('.vp-frame'),
      set: function (text, pct) {
        wrap.querySelector('.vp-text').textContent = text;
        if (pct != null) {
          var v = Math.max(0, Math.min(100, Math.round(pct)));
          wrap.querySelector('.vp-fill').style.width = v + '%';
          wrap.querySelector('.vp-bar').setAttribute('aria-valuenow', v);
        }
      },
      close: function () { wrap.remove(); }
    };
    wrap.querySelector('[data-cancel]').onclick = function () {
      api.cancelled = true;
      if (api.onCancel) api.onCancel();
      api.close();
    };
    return api;
  }

  function pickMime() {
    var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return null;
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  }

  /**
   * Réenregistre la vidéo au format de la carte (1280×800, sans son, 20 s max).
   * Renvoie un Blob léger, ou le fichier d'origine si le navigateur ne sait pas le faire.
   */
  function optimizeVideo(file, modal) {
    return new Promise(function (resolve, reject) {
      var mime = pickMime();
      var canvas = document.createElement('canvas');
      if (!mime || !canvas.captureStream) { resolve({ blob: file, optimized: false }); return; }
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.preload = 'auto'; v.src = url;
      canvas.width = VIDEO.w; canvas.height = VIDEO.h;
      canvas.style.width = '100%'; canvas.style.height = '100%';
      modal.frame.appendChild(canvas);
      var ctx = canvas.getContext('2d');
      var rec, chunks = [], done = false, raf = 0;

      function cleanup() { cancelAnimationFrame(raf); try { v.pause(); } catch (e) {} URL.revokeObjectURL(url); }
      modal.onCancel = function () { done = true; try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {} cleanup(); resolve(null); };

      v.onerror = function () { cleanup(); reject(new Error('Vidéo illisible sur cet appareil. Essayez une vidéo MP4.')); };
      v.onloadedmetadata = function () {
        var iw = v.videoWidth, ih = v.videoHeight;
        if (!iw || !ih) { cleanup(); reject(new Error('Vidéo illisible.')); return; }
        var dur = Math.min(isFinite(v.duration) && v.duration > 0 ? v.duration : VIDEO.maxSeconds, VIDEO.maxSeconds);
        var k = Math.max(VIDEO.w / iw, VIDEO.h / ih), sw = VIDEO.w / k, sh = VIDEO.h / k;
        var sx = (iw - sw) / 2, sy = (ih - sh) / 2;
        function draw() { ctx.drawImage(v, sx, sy, sw, sh, 0, 0, VIDEO.w, VIDEO.h); }
        var stream = canvas.captureStream(VIDEO.fps);
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO.bitrate });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          cleanup();
          if (modal.cancelled) return;
          resolve({ blob: new Blob(chunks, { type: mime.split(';')[0] }), optimized: true });
        };
        function loop() {
          if (done) return;
          draw();
          modal.set('Préparation de la vidéo… ' + Math.round(v.currentTime) + ' / ' + Math.round(dur) + ' s', v.currentTime / dur * 60);
          if (v.currentTime >= dur || v.ended) { done = true; draw(); setTimeout(function () { rec.stop(); }, 120); return; }
          raf = requestAnimationFrame(loop);
        }
        v.onended = function () { if (!done) { done = true; rec.stop(); } };
        draw();
        rec.start(500);
        var p = v.play();
        if (p && p.catch) p.catch(function () { cleanup(); resolve({ blob: file, optimized: false }); });
        loop();
      };
    });
  }

  window.TLE = window.TLE || {};
  window.TLE.studio = {
    open: open, harmonize: harmonize, FORMATS: FORMATS, LOOK: LOOK,
    VIDEO: VIDEO, progressModal: progressModal, optimizeVideo: optimizeVideo
  };
})();
