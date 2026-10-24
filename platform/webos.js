/*
 * Bingr voor LG webOS TV: de platformlaag. Staat in index.html direct vóór js/app.js, dus na alle gedeelde modules
 * uit bingr-android/tizen (op de vaste commit uit upstream.properties). Hier alleen wat op een LG-tv anders is:
 * - apparaat: naam "LG TV (<model>)", platform "webos", systeemversie "webOS <versie>" (register_device, heartbeat);
 * - systeeminfo via de Luna-service (PalmServiceBridge): model, webOS-versie en firmware
 *   (com.webos.service.tv.systemproperty getSystemInfo) en het netwerk (com.palm.connectionmanager getStatus);
 *   LG's webOSTV.js wordt niet gebruikt (niet nodig, en geen bibliotheek met onduidelijke licentie in de app);
 * - Magic Remote: cursor erboven = focus, klikken = OK, scrollwiel = omhoog/omlaag;
 * - speler: de eigen <video> van de tv (HLS, MP4, vaak ook TS); kan die een TS-stream niet spelen, dan mpegts.js (MSE);
 * - afsluiten (window.close), opnieuw starten vanuit de launcher (webOSRelaunch);
 * - support: tijdelijke terugval zolang de server "webos" nog niet kent.
 * De toetscodes (Terug 461, afspelen 415, pauze 19, stop 413, terugspoelen 412, doorspoelen 417, kleuren 403–406)
 * kent de gedeelde code al (ui.js); met disableBackHistoryAPI in appinfo.json komt Terug als toets bij de app.
 * Geschreven voor Chromium 53 (webOS 4.x): ES5, geen ?. ?? of spread.
 */
(function () {
  'use strict';
  var B = window.B;
  var U = B.ui, A = B.account, DG = B.diag, W = B.webosLogic;
  var WO = B.webos = {};
  var noop = function () {};

  // MARK: systeeminfo

  var info = B.store.get('webos.info', null) || {};
  function merge(o) {
    var changed = false;
    for (var k in o) if (o.hasOwnProperty(k) && o[k] && info[k] !== o[k]) { info[k] = o[k]; changed = true; }
    if (changed) B.store.set('webos.info', info);
  }
  try {
    var ps = window.webOSSystem || window.PalmSystem;
    if (ps && ps.deviceInfo) merge(W.parseDeviceInfo(ps.deviceInfo));
  } catch (e) { /* buiten de tv */ }

  var bridges = []; // houd de bridge vast tot het antwoord er is (anders ruimt de garbage collector hem op)
  /** Luna-aanroep via PalmServiceBridge; Promise met het antwoord, of null (geen tv, fout of na ms geen antwoord). */
  WO.luna = function (uri, params, ms) {
    return new Promise(function (resolve) {
      var Bridge = window.PalmServiceBridge;
      if (!Bridge) { resolve(null); return; }
      var done = false, br;
      function finish(v) {
        if (done) return;
        done = true;
        var i = bridges.indexOf(br);
        if (i >= 0) bridges.splice(i, 1);
        resolve(v);
      }
      try {
        br = new Bridge();
        bridges.push(br);
        br.onservicecallback = function (msg) {
          var r = null;
          try { r = typeof msg === 'string' ? JSON.parse(msg) : msg; } catch (e) { r = null; }
          finish(r);
        };
        br.call(uri, JSON.stringify(params || {}));
      } catch (e) { finish(null); return; }
      setTimeout(function () { finish(null); }, ms || 4000);
    });
  };
  WO.ready = WO.luna('luna://com.webos.service.tv.systemproperty/getSystemInfo',
    { keys: ['modelName', 'firmwareVersion', 'sdkVersion'] }).then(function (r) { merge(W.parseSystemInfo(r)); return info; });
  WO.info = function () { return info; };
  WO.model = function () { return info.modelName || ''; };
  WO.networkType = function () {
    return WO.luna('luna://com.palm.connectionmanager/getStatus', {}, 3000).then(function (r) { return W.networkType(r); });
  };
  function ua() { return (navigator && navigator.userAgent) || ''; }

  // MARK: apparaat (account.js)

  A.model = function () { return WO.model(); };
  A.deviceName = function () { return 'LG TV'; };
  A.deviceDisplayName = function () { return W.deviceName(WO.model()); };
  A.osVersion = function () { return W.osLabel(info, ua()); };
  var platformLabel = A.platformLabel;
  A.platformLabel = function (p) { return W.isWebOSPlatform(p) ? 'LG TV' : platformLabel(p); };
  var platformIcon = U.platformIcon;
  U.platformIcon = function (p) { return W.isWebOSPlatform(p) ? 'tv' : platformIcon(p); };

  // MARK: diagnose (support.js)

  DG.osVersion = function () { return W.osVersion(info, ua()); };
  var network = DG.network;
  DG.network = function () {
    return Promise.all([network(), WO.networkType()]).then(function (r) {
      var n = r[0];
      if (n && r[1] && r[1] !== 'unknown') {
        n.type = r[1];
        n.online = navigator.onLine !== false && r[1] !== 'none';
      }
      return n;
    });
  };
  WO.engineName = function () { return WO.lastEngine || 'html5'; };

  // MARK: support: tijdelijk zonder platform als de server "webos" nog niet kent

  var support = A.support;
  A.support = function (body) {
    return support(body).then(function (r) {
      var again = W.supportRetryBody(body, r);
      if (!again) return r;
      B.log('support: server kent webos nog niet; zonder platform/bijlage opnieuw');
      return support(again);
    });
  };

  // MARK: afsluiten en opnieuw starten

  WO.exit = function () {
    try { window.close(); } catch (e) { /* stil */ }
    // oudere webOS: PalmSystem.platformBack() gaat naar de launcher als window.close() niets deed
    setTimeout(function () { try { var p = window.webOSSystem || window.PalmSystem; if (p && p.platformBack) p.platformBack(); } catch (e) { /* stil */ } }, 300);
  };
  // handlesRelaunch: de app draaide al en wordt vanuit de launcher opnieuw geopend → naar de voorgrond
  document.addEventListener('webOSRelaunch', function () {
    try { var p = window.webOSSystem || window.PalmSystem; if (p && p.activate) p.activate(); } catch (e) { /* stil */ }
  });

  // MARK: Magic Remote (cursor erboven = focus, klik = OK, wiel = omhoog/omlaag)

  WO.pointer = { lastX: -1, lastY: -1, wheelAt: 0 };
  function fakeKey(code, target) {
    return { keyCode: code, repeat: false, target: target || document.body, preventDefault: noop, stopPropagation: noop };
  }
  document.addEventListener('mousemove', function (e) {
    var P = WO.pointer;
    if (e.clientX === P.lastX && e.clientY === P.lastY) return;
    P.lastX = e.clientX; P.lastY = e.clientY;
    var el = W.pointerTarget(e.target, U.layer());
    if (el && el !== U.focused) U.focus(el);
  }, true);
  document.addEventListener('click', function (e) {
    var el = W.pointerTarget(e.target, U.layer());
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    if (el !== U.focused) U.focus(el);
    // als OK op de afstandsbediening (indrukken en loslaten), zodat schermen met een eigen onKey het ook zien
    U.onKeyDown(fakeKey(13, el));
    U.onKeyUp(fakeKey(13, el));
  }, true);
  document.addEventListener('wheel', function (e) {
    var code = W.wheelKey(e.deltaY);
    if (!code) return;
    e.preventDefault();
    var now = Date.now();
    if (now - WO.pointer.wheelAt < 120) return;
    WO.pointer.wheelAt = now;
    U.onKeyDown(fakeKey(code));
  }, { capture: true, passive: false });

  // MARK: speler: eigen video van de tv, met mpegts.js als terugval voor TS

  var H = B.engines.HTML;
  var hOpen = H.prototype.open, hStop = H.prototype.stop;
  WO.tsNative = B.store.get('webos.tsNative', null); // false = deze tv speelt TS niet zelf (onthouden)
  function mseOK() { return !!(window.MediaSource && window.MediaSource.isTypeSupported); }
  function canPlayTS(v) { try { return v.canPlayType('video/mp2t'); } catch (e) { return ''; } }
  WO.loadMpegts = function () {
    if (window.mpegts) return Promise.resolve(window.mpegts);
    return B.loadScript('js/lib/mpegts.js').then(function () { return window.mpegts; });
  };
  H.prototype.killTS = function () {
    var p = this.ts;
    this.ts = null;
    if (!p) return;
    try { p.pause(); } catch (e) { /* stil */ }
    try { p.unload(); } catch (e) { /* stil */ }
    try { p.detachMediaElement(); } catch (e) { /* stil */ }
    try { p.destroy(); } catch (e) { /* stil */ }
  };
  H.prototype.openTS = function (url, opts) {
    var self = this, v = this.v;
    v._engine = self;
    v.style.display = 'block';
    self.stopped = false;
    return WO.loadMpegts().then(function (mpegts) {
      if (!mpegts || !mpegts.isSupported || !mpegts.isSupported()) throw new Error('MSE');
      if (self.stopped || !self.mine()) throw new Error('stopped');
      return new Promise(function (resolve, reject) {
        var done = false;
        var p = self.ts = mpegts.createPlayer({ type: 'mpegts', isLive: !!opts.live, url: url },
          { enableWorker: false, lazyLoad: false, liveBufferLatencyChasing: !!opts.live, autoCleanupSourceBuffer: true });
        p.on(mpegts.Events.ERROR, function (type, detail) {
          if (!self.mine() || self.ts !== p) return;
          if (!done) { done = true; reject(new Error('MPEGTS_' + type + (detail ? ':' + detail : ''))); return; }
          if (!self.stopped) self.ev.error('MPEGTS_' + type);
        });
        v.oncanplay = function () {
          if (done || !self.mine()) return; done = true;
          WO.lastEngine = 'mpegts';
          if (opts.mark) opts.mark('prepared');
          if (opts.onReady) { try { opts.onReady(); } catch (e) { B.log('onReady', e); } }
          if (opts.start && opts.start > 5 && !opts.live) { try { v.currentTime = opts.start; } catch (e) { /* stil */ } }
          var pr = v.play();
          if (pr && pr.then) pr.then(resolve, function () { resolve(); }); else resolve();
        };
        v.onerror = function () {
          if (!self.mine()) return;
          if (!done) { done = true; reject(new Error('MEDIA_ERR')); return; }
          if (!self.stopped) self.ev.error('MEDIA_ERR_' + ((v.error && v.error.code) || 0));
        };
        p.attachMediaElement(v);
        p.load();
      });
    });
  };
  H.prototype.open = function (url, opts) {
    var self = this;
    opts = opts || {};
    self.killTS();
    var how = W.pickEngine(url, { mse: mseOK(), tsNative: WO.tsNative, canPlayTS: canPlayTS(self.v) });
    if (how === 'mpegts') return self.openTS(url, opts);
    return hOpen.call(self, url, opts).then(function (r) {
      WO.lastEngine = 'html5';
      if (W.isTS(url) && WO.tsNative !== true) { WO.tsNative = true; B.store.set('webos.tsNative', true); }
      return r;
    }, function (e) {
      if (self.stopped || !self.mine() || !W.retryWithMpegts(url, { mse: mseOK() })) throw e;
      B.log('webos: TS niet met de eigen video; mpegts.js');
      return self.openTS(url, opts).then(function (r) {
        if (WO.tsNative !== true) { WO.tsNative = false; B.store.set('webos.tsNative', false); }
        return r;
      });
    });
  };
  H.prototype.stop = function () {
    this.killTS();
    return hStop.apply(this, arguments);
  };
})();
