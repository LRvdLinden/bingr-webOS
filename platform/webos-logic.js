/*
 * Bingr voor LG webOS TV: pure hulpfuncties van de platformlaag (geen DOM, geen netwerk), getest met
 * node test/platform_test.js. In de app staat dit op B.webosLogic; in node via module.exports.
 * Geschreven voor oude Chromium-versies (webOS 4.x = Chromium 53): ES5, geen ?. ?? of spread.
 */
(function (root) {
  'use strict';
  var W = {};

  /** Toetscodes van de LG-afstandsbediening (Magic Remote en de gewone). De gedeelde code (ui.js) kent ze al. */
  W.KEYS = {
    461: 'back', 13: 'enter', 37: 'left', 38: 'up', 39: 'right', 40: 'down',
    415: 'play', 19: 'pause', 413: 'stop', 412: 'rw', 417: 'ff',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 457: 'info', 33: 'chup', 34: 'chdown'
  };

  /** Chromium-versie in de webOS-browser → webOS-versie (LG-tabel "Web engine" per webOS TV-versie). */
  var CHROME_TO_WEBOS = [[120, '25'], [108, '24'], [94, '23'], [87, '22'], [79, '6.0'], [68, '5.0'], [53, '4.0'], [38, '3.0']];

  /** Draait dit op een LG-tv? (PalmSystem/webOSSystem van de WebAppManager, of de user agent). */
  W.isWebOS = function (win) {
    if (!win) return false;
    if (win.webOSSystem || win.PalmSystem) return true;
    var ua = String((win.navigator && win.navigator.userAgent) || '');
    return /Web0S|webOS/i.test(ua);
  };

  /** deviceInfo van PalmSystem/webOSSystem (JSON-tekst) → {modelName, platformVersion, sdkVersion?}; {} bij onzin. */
  W.parseDeviceInfo = function (s) {
    var o = null;
    try { o = typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return {};
    var out = {};
    if (o.modelName) out.modelName = W.cleanModel(o.modelName);
    var v = o.platformVersion || (o.platformVersionMajor != null ? [o.platformVersionMajor, o.platformVersionMinor || 0, o.platformVersionDot || 0].join('.') : null);
    if (v) out.platformVersion = String(v).slice(0, 20);
    return out;
  };

  /** Antwoord van luna://com.webos.service.tv.systemproperty/getSystemInfo → {modelName, sdkVersion, firmwareVersion}. */
  W.parseSystemInfo = function (r) {
    if (!r || typeof r !== 'object' || r.returnValue === false) return {};
    var out = {};
    if (r.modelName) out.modelName = W.cleanModel(r.modelName);
    if (r.sdkVersion) out.sdkVersion = String(r.sdkVersion).slice(0, 20);
    if (r.firmwareVersion) out.firmwareVersion = String(r.firmwareVersion).slice(0, 30);
    return out;
  };

  /** Modelcode zonder rommel ("OLED55C36LC"), max. 80 tekens; geen serienummers of namen (die geeft de API niet). */
  W.cleanModel = function (m) {
    return String(m == null ? '' : m).replace(/[^A-Za-z0-9 ._+\-\/()]/g, '').trim().slice(0, 80);
  };

  /** webOS-versie uit de user agent: Chrome-versie → webOS ("6.0", "23"); null als het geen webOS is. */
  W.versionFromUA = function (ua) {
    ua = String(ua || '');
    if (!/Web0S|webOS/i.test(ua)) return null;
    var m = /Chrome\/(\d+)/.exec(ua);
    if (!m) return /Safari\/538/.test(ua) ? '2.0' : null;
    var c = parseInt(m[1], 10);
    for (var i = 0; i < CHROME_TO_WEBOS.length; i++) if (c >= CHROME_TO_WEBOS[i][0]) return CHROME_TO_WEBOS[i][1];
    return null;
  };

  /** "6.3.0" → "6.3"; "23.20.55" → "23.20"; anders null. */
  W.shortVersion = function (v) {
    var m = /^(\d+)(?:\.(\d+))?/.exec(String(v || ''));
    if (!m) return null;
    return m[1] + '.' + (m[2] || '0');
  };

  /**
   * Systeemversie voor de beheerder en de diagnose ("6.3", zonder "webOS"): sdkVersion (systemproperty), anders
   * platformVersion (deviceInfo), anders uit de user agent. '' als onbekend.
   */
  W.osVersion = function (info, ua) {
    info = info || {};
    return W.shortVersion(info.sdkVersion) || W.shortVersion(info.platformVersion) || W.versionFromUA(ua) || '';
  };
  /** "webOS 6.3" (os_version bij register_device/heartbeat, max. 40 tekens). */
  W.osLabel = function (info, ua) {
    var v = W.osVersion(info, ua);
    return v ? 'webOS ' + v : 'webOS';
  };

  /** Naam in de apparatenlijst: "LG TV (OLED55C36LC)", zonder model "LG TV". */
  W.deviceName = function (model) {
    model = W.cleanModel(model);
    return model ? 'LG TV (' + model + ')' : 'LG TV';
  };

  /**
   * Antwoord van luna://com.palm.connectionmanager/getStatus → 'ethernet' | 'wifi' | 'none' | 'other' | 'unknown'
   * (zelfde waarden als network.type in de diagnose-bijlage).
   */
  W.networkType = function (r) {
    if (!r || typeof r !== 'object' || r.returnValue === false) return 'unknown';
    var wired = r.wired && r.wired.state === 'connected';
    var wifi = r.wifi && r.wifi.state === 'connected';
    if (wired) return 'ethernet';
    if (wifi) return 'wifi';
    if (r.isInternetConnectionAvailable === false) return 'none';
    if (r.isInternetConnectionAvailable === true) return 'other';
    return 'unknown';
  };

  /** HLS of MP4 (speelt de webOS-video zelf, ook zonder MSE). */
  W.isNativeFriendly = function (url) {
    return /\.(m3u8|mp4|m4v|mov|webm)(\?|#|$)/i.test(String(url || ''));
  };
  /**
   * Ziet eruit als MPEG-TS: eindigt op .ts, of een Xtream-livelink zonder extensie (/live/<user>/<pass>/<id>).
   * Zulke streams speelt Bingr eerst met de eigen video van de tv en anders met mpegts.js (MSE).
   */
  W.isTS = function (url) {
    var u = String(url || '');
    if (W.isNativeFriendly(u)) return false;
    if (/\.ts(\?|#|$)/i.test(u)) return true;
    return /\/live\/[^\/?#]+\/[^\/?#]+\/\d+(\?|#|$)/i.test(u);
  };
  /**
   * Speler kiezen voor een URL: 'native' (eigen video van de tv) of 'mpegts'.
   * tsNative = false als de tv eerder een TS-stream niet zelf kon spelen (dan meteen mpegts), canPlayTS = uitkomst
   * van video.canPlayType('video/mp2t') ('' = nee), mse = MediaSource aanwezig.
   */
  W.pickEngine = function (url, opts) {
    opts = opts || {};
    if (!W.isTS(url) || !opts.mse) return 'native';
    if (opts.tsNative === false) return 'mpegts';
    if (opts.canPlayTS === '') return 'mpegts';
    return 'native';
  };
  /** Na een fout van de eigen video vóór het eerste beeld: nog met mpegts.js proberen? */
  W.retryWithMpegts = function (url, opts) {
    opts = opts || {};
    return !!(opts.mse && W.isTS(url) && !opts.triedMpegts);
  };

  /**
   * Magic Remote: het focusbare element (.f, niet .disabled) onder de cursor, als het in de bovenste laag ligt.
   * el = event.target; layer = bovenste scherm. Werkt met alles wat parentNode en classList heeft.
   */
  W.pointerTarget = function (el, layer) {
    var n = el;
    while (n && n.classList) {
      if (n.classList.contains('f')) break;
      if (n === layer) return null;
      n = n.parentNode;
    }
    if (!n || !n.classList || !n.classList.contains('f') || n.classList.contains('disabled')) return null;
    if (layer && layer !== n) {
      var p = n.parentNode;
      while (p && p !== layer) p = p.parentNode;
      if (!p) return null;
    }
    return n;
  };
  /** Scrollwiel van de Magic Remote → toetscode (40 omlaag, 38 omhoog), of null bij te weinig beweging. */
  W.wheelKey = function (deltaY) {
    if (!deltaY || Math.abs(deltaY) < 4) return null;
    return deltaY > 0 ? 40 : 38;
  };

  /**
   * Tijdelijk (tot de server "webos" kent): support weigert app.platform/platform "webos" met 400. Dan nog één keer
   * zonder platform en zonder bijlage versturen (de server haalt het platform dan bij het apparaat). Geeft de nieuwe
   * body, of null als opnieuw proberen niet past.
   */
  W.supportRetryBody = function (body, res) {
    if (!body || !res || res.status !== 400 || !res.json) return null;
    if (body.action !== 'app_create' && body.action !== 'app_reply') return null;
    var e = res.json.error, f = res.json.field;
    var platformErr = e === 'bad_platform' || (e === 'bad_diagnostics' && f === 'app.platform');
    if (!platformErr || (body.platform == null && body.diagnostics == null)) return null;
    var out = {};
    for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k) && k !== 'platform' && k !== 'diagnostics') out[k] = body[k];
    return out;
  };

  /** Platformnaam voor mensen en het icoon (apparatenlijst, Nu aan het kijken). */
  W.isWebOSPlatform = function (p) { return /^(webos|lg ?tv)$/i.test(String(p || '').trim()); };

  root.webosLogic = W;
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
})(typeof window !== 'undefined' ? (window.B = window.B || {}) : {});
