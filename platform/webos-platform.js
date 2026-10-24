/*
 * Bingr voor LG webOS TV: B.platform (build 147). Staat in index.html vóór js/core.js; core.js neemt
 * window.BINGR_PLATFORM over als B.platform (id, naam, merk, systeem, merkteksten, model(), osVersion(), exit()).
 * Daarnaast de systeeminfo van de tv: PalmSystem/webOSSystem.deviceInfo (meteen) en de Luna-service via
 * PalmServiceBridge (com.webos.service.tv.systemproperty getSystemInfo; com.palm.connectionmanager getStatus).
 * LG's webOSTV.js wordt niet gebruikt. Pure logica in webos-logic.js (B.webosLogic, staat hiervoor).
 * Geschreven voor Chromium 53 (webOS 4.x): ES5, geen ?. ?? of spread.
 */
(function () {
  'use strict';
  var W = window.B.webosLogic;
  var KEY = 'bingr.webos.info';
  var info = {};
  try { info = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { info = {}; }
  function merge(o) {
    var changed = false;
    for (var k in o) if (o.hasOwnProperty(k) && o[k] && info[k] !== o[k]) { info[k] = o[k]; changed = true; }
    if (changed) { try { localStorage.setItem(KEY, JSON.stringify(info)); } catch (e) { /* stil */ } }
  }
  function system() { return window.webOSSystem || window.PalmSystem || null; }
  try { var ps = system(); if (ps && ps.deviceInfo) merge(W.parseDeviceInfo(ps.deviceInfo)); } catch (e) { /* buiten de tv */ }

  var bridges = []; // bridge vasthouden tot het antwoord er is (anders ruimt de garbage collector hem op)
  /** Luna-aanroep; Promise met het antwoord, of null (geen tv, fout of na ms geen antwoord). */
  function luna(uri, params, ms) {
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
  }
  function ua() { return (window.navigator && navigator.userAgent) || ''; }

  window.BINGR_PLATFORM = {
    id: 'webos',
    name: 'LG TV',
    maker: 'LG',
    os: 'webOS',
    // Engelse sleutels; webos.js vertaalt ze met de bestaande Samsung-vertalingen ("Samsung" → "LG")
    texts: {
      unsupportedServer: 'This kind of server is not supported on LG TV yet.',
      multiviewOnePlayer: 'An LG TV has one full video player: the tile with sound uses it, the other tiles play muted where the TV can.'
    },
    /** Modelcode ("OLED55C36LC") of ''. */
    model: function () { return info.modelName || ''; },
    /** webOS-versie ("6.3", "23.20") of ''. */
    osVersion: function () { return W.osVersion(info, ua()); },
    /** De app sluiten; oudere webOS: naar de launcher als window.close() niets deed. */
    exit: function () {
      try { window.close(); } catch (e) { /* stil */ }
      setTimeout(function () { try { var p = system(); if (p && p.platformBack) p.platformBack(); } catch (e) { /* stil */ } }, 300);
    },
    // webOS-extra's (niet in de Tizen-laag)
    info: function () { return info; },
    luna: luna,
    /** Soort verbinding: 'ethernet' | 'wifi' | 'none' | 'other' | 'unknown'. */
    networkType: function () {
      return luna('luna://com.palm.connectionmanager/getStatus', {}, 3000).then(function (r) { return W.networkType(r); });
    },
    ready: luna('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName', 'firmwareVersion', 'sdkVersion'] })
      .then(function (r) { merge(W.parseSystemInfo(r)); return info; })
  };
})();
