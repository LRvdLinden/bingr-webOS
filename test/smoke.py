#!/usr/bin/env python3
"""Rooktest van de gebouwde webOS-app in headless Chromium met een neppe backend.

Hergebruikt de testopzet van de Samsung TV-app (bingr-android/tizen/test/screenshots.py en fake_backend.py uit
.upstream, dezelfde commit als de app): Supabase (device-auth, support), een Xtream-server en posters. In plaats van de
Samsung-stub (window.tizen/webapis) krijgt de pagina een LG-stub: PalmSystem.deviceInfo, PalmServiceBridge (Luna:
getSystemInfo, connectionmanager getStatus) en window.close.

  python3 test/smoke.py <uitvoermap> [appmap]      (standaard build/app; eerst python3 tools/build_app.py)
Vereist: playwright (Chromium) en Pillow. Exitcode 1 bij een mislukte controle of een fout in de console.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'smoke'))
APP = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'build', 'app'))
UPTEST = os.path.join(ROOT, '.upstream', 'tizen', 'test')
import shutil  # noqa: E402
if not shutil.which('ffmpeg'):
    raise SystemExit('ffmpeg ontbreekt: nodig voor het testfilmpje van de neppe backend')
if not os.path.exists(os.path.join(APP, 'index.html')):
    raise SystemExit('geen app in %s: eerst python3 tools/build_app.py' % APP)
os.environ['BINGR_TIZEN_DIR'] = APP
sys.argv = [sys.argv[0], OUT]
sys.path.insert(0, UPTEST)
import screenshots as T  # noqa: E402  (testopzet van de Samsung TV-app)
fb = T.fb

T.STUB = """
window.PalmSystem = { deviceInfo: JSON.stringify({ modelName: 'OLED55C36LC', platformVersion: '6.3.0', screenWidth: 1920, screenHeight: 1080 }),
  activate: function () { window.__activated = true; }, platformBack: function () { window.__platformBack = true; } };
window.__luna = [];
window.PalmServiceBridge = function () {
  var self = this;
  this.call = function (uri, params) {
    window.__luna.push(uri);
    setTimeout(function () {
      var r = { returnValue: false, errorText: 'unknown' };
      if (uri.indexOf('systemproperty/getSystemInfo') > 0) r = { returnValue: true, modelName: 'OLED55C36LC', sdkVersion: '6.3.0', firmwareVersion: '03.30.70' };
      if (uri.indexOf('connectionmanager/getStatus') > 0) r = { returnValue: true, isInternetConnectionAvailable: true, wired: { state: 'connected' }, wifi: { state: 'disconnected' } };
      if (self.onservicecallback) self.onservicecallback(JSON.stringify(r));
    }, 20);
  };
};
window.close = function () { window.__closed = true; };
"""

TOP = 'B.ui.stack.length'
# muis/Magic Remote: gebeurtenis op een element (bubbelt naar de luisteraars op document)
HOVER = ('(function () { var el = %s; if (!el) return "geen element"; el.dispatchEvent(new MouseEvent("mousemove", '
         '{bubbles: true, clientX: Math.random() * 1000, clientY: Math.random() * 1000})); return B.ui.focused === el; })()')
CLICK = '(function () { var el = %s; if (!el) return "geen element"; el.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true})); return 1; })()'
CARD = 'Array.prototype.filter.call(B.ui.top().el.querySelectorAll(".row-track .f"), function (x) { return x.offsetWidth > 0; })[2]'

steps = [
    ('wait', 2500), ('shot', 'webos-01-profiles'),
    ('expect', 'B.config.platform === "webos" && B.platform.id === "webos" && B.platform.maker === "LG"', 'B.platform webos (LG)'),
    ('expect', '(function () { var a = B.L(B.platform.texts.unsupportedServer), b = B.L(B.platform.texts.multiviewOnePlayer); return a.indexOf("LG") >= 0 && b.indexOf("LG") >= 0 && !/Samsung/.test(a + b) && (B.lang === "en" || a !== B.platform.texts.unsupportedServer); })()', 'merkteksten vertaald met LG'),
    ('expect', 'B.config.build === "%s"' % open(os.path.join(ROOT, 'version.properties')).read().split('BINGR_BUILD=')[1].split()[0], 'buildnummer uit version.properties'),
    ('key', 'Enter', 400), ('wait', 4000), ('shot', 'webos-02-home'),
    ('expect', 'B.account.deviceDisplayName() === "LG TV (OLED55C36LC)"', 'apparaatnaam LG TV (model)'),
    ('expect', 'B.account.osVersion() === "webOS 6.3"', 'systeemversie webOS 6.3 (Luna getSystemInfo)'),
    ('expect', 'window.__luna.some(function (u) { return u.indexOf("com.webos.service.tv.systemproperty/getSystemInfo") > 0; })', 'Luna getSystemInfo aangeroepen'),
    ('expect', 'B.account.platformLabel("webos") === "LG TV" && B.ui.platformIcon("webos") === "tv" && B.account.platformLabel("tizen") === B.L("Samsung TV")', 'platformlabel en icoon'),
    ('expect', '!document.querySelector("object") && getComputedStyle(document.getElementById("av-player")).display === "none"', 'geen AVPlay-plugin'),
    ('walk', 'ArrowDown ArrowRight ArrowRight ArrowUp ArrowDown', 'Home: rondlopen met de pijltjes'),
    # Magic Remote: aanwijzen = focus, klikken = OK, wiel = omlaag
    ('expect', HOVER % CARD, 'cursor op een kaart = focus'),
    ('eval', 'window.__n = %s; 1' % TOP),
    ('eval', CLICK % 'B.ui.focused'), ('wait', 2500), ('shot', 'webos-03-details-click'),
    ('expect', '%s > window.__n' % TOP, 'klik op de kaart opent hem'),
    ('walk', 'ArrowDown ArrowUp', 'details: rondlopen'),
    ('tv', '461', 500),
    ('expect', '%s === window.__n' % TOP, 'Terug (461) sluit de details'),
    ('eval', 'window.__f = B.ui.focused; document.dispatchEvent(new WheelEvent("wheel", {deltaY: 120, bubbles: true, cancelable: true})); 1'), ('wait', 400),
    ('expect', 'B.ui.focused && B.ui.focused !== window.__f', 'scrollwiel = omlaag'),
    # diagnose
    ('eval', 'B.diag.app().then(function (d) { window.__diag = d; return 1; })'), ('wait', 1500),
    ('expect', 'window.__diag && window.__diag.app.platform === "webos"', 'diagnose: app.platform webos'),
    ('expect', 'window.__diag.device.manufacturer === "LG" && window.__diag.device.os === "webOS" && window.__diag.device.osVersion === "6.3" && window.__diag.device.model === "OLED55C36LC" && window.__diag.device.type === "tv"', 'diagnose: LG, webOS 6.3, model'),
    ('expect', 'window.__diag.state.network.type === "ethernet"', 'diagnose: netwerk via connectionmanager'),
    ('expect', 'window.__diag.schema >= 2 && !!window.__diag.start && Array.isArray(window.__diag.fetch) && window.__diag.network && window.__diag.network.type === "ethernet" && !!window.__diag.storage', 'diagnose-schema 2+ (start, fetch, network, storage)'),
    ('eval', 'JSON.stringify(window.__diag.app) + " " + JSON.stringify(window.__diag.device)', 'diagnose'),
    ('eval', 'B.ui.top().show("settings", true) || 1'), ('wait', 800),
    ('eval', 'var t = Array.prototype.filter.call(document.querySelectorAll(".st-tab"), function (x) { return x._tab === "diagnose"; })[0]; window.__tab = t; 1'),
    ('expect', HOVER % 'window.__tab', 'cursor op de tab Diagnose = focus'),
    ('eval', CLICK % 'window.__tab'), ('wait', 1200), ('shot', 'webos-04-diagnose'),
    ('expect', '(function () { var t = document.querySelector(".page.settings").textContent; return t.indexOf("LG OLED55C36LC") >= 0 && t.indexOf("webOS 6.3") >= 0 && t.indexOf("Tizen") < 0 && t.indexOf("Samsung") < 0; })()', 'Diagnose-tab: LG-model en webOS 6.3, geen Tizen/Samsung'),
    ('eval', 'var t = Array.prototype.filter.call(document.querySelectorAll(".st-tab"), function (x) { return x._tab === "about"; })[0]; B.ui.focus(t, true); 1'),
    ('key', 'Enter', 800), ('shot', 'webos-04b-about'),
    ('expect', 'document.querySelector(".page.settings").textContent.indexOf("LG TV · webOS") >= 0 && document.body.textContent.indexOf("Samsung") < 0', 'Over: LG TV · webOS, nergens Samsung'),
    ('eval', 'B.support.create("Test vanaf LG", "apps", "Dit is een testbericht van de rooktest.", null).then(function (r) { window.__ticket = r; return 1; })'), ('wait', 1500),
    ('expect', '!!(window.__ticket && window.__ticket.number)', 'support: nieuw ticket'),
    # speler: eigen video (HLS/MP4/TS); mpegts.js te laden voor TS
    ('eval', 'B.ui.popTo(B.ui.stack[0]) || 1'),
    ('eval', 'B.screens.openItem("channel", B.lib.lib.channels[0]) || 1'), ('wait', 3000), ('shot', 'webos-05-player'),
    ('expect', '!!B.player.current && (document.getElementById("html-video").currentSrc || "").indexOf("xtream.test") >= 0', 'live kijken met de eigen video'),
    ('expect', 'B.webos.engineName() === "html5"', 'engine html5'),
    ('expect', 'getComputedStyle(document.querySelector(".pl-error")).display === "none"', 'speler zonder foutscherm (testfilmpje speelt)'),
    ('tv', '19', 400), ('expect', 'document.getElementById("html-video").paused', 'pauze (19)'),
    ('tv', '415', 400), ('expect', '!document.getElementById("html-video").paused', 'afspelen (415)'),
    ('tv', '413', 800), ('expect', '!B.player.current', 'stop (413) sluit de speler'),
    # Chromium van Playwright heeft geen H.264, dus isSupported() is hier onwaar; op de tv wel (MSE + H.264)
    ('eval', 'B.webos.loadMpegts().then(function (m) { window.__mp = !!(m && m.createPlayer && m.Events); return 1; })'), ('wait', 1500),
    ('expect', 'window.__mp === true', 'mpegts.js laadt (js/lib/mpegts.js)'),
    ('eval', 'String(window.mpegts && window.mpegts.isSupported())', 'mpegts.isSupported() in deze Chromium'),
    ('eval', 'B.webos.exit() || 1'), ('wait', 2000),
    ('expect', 'window.__closed === true', 'afsluiten via window.close'),
]

T.run(T.SIGNED_IN, 'normal', steps)
reqs = []
rp = os.path.join(OUT, 'requests.jsonl')
if os.path.exists(rp):
    reqs = [json.loads(l) for l in open(rp).read().splitlines() if l.strip()]
hb = [r for r in reqs if r.get('action') in ('heartbeat', 'register_device')]
T.RESULTS.append(('heartbeat/register_device met os_version webOS', any(str(r.get('os_version', '')).startswith('webOS') for r in hb), str(hb[:2])))
T.RESULTS.append(('support app_create (platform webos)', any(r.get('support') == 'app_create' for r in reqs), str([r for r in reqs if 'support' in r][:4])))

print('\n== Samenvatting (webOS) ==')
for name, ok, detail in T.RESULTS:
    print(('OK   ' if ok else 'FOUT ') + name + ('' if ok else '  (' + detail + ')'))
bad = [r for r in T.RESULTS if not r[1]]
print('%d controles, %d fout, %d consolefouten' % (len(T.RESULTS), len(bad), len(T.PAGEERRORS)))
sys.exit(1 if bad or T.PAGEERRORS else 0)
