#!/usr/bin/env node
// Unittests van de webOS-platformlogica (platform/webos-logic.js): toetsen, systeeminfo, user agent, netwerk,
// spelerkeuze (eigen video / mpegts.js), Magic Remote en de supportterugval. Draait zonder tv: node test/platform_test.js
'use strict';
var path = require('path');
var fs = require('fs');
var W = require(path.join(__dirname, '..', 'platform', 'webos-logic.js'));

var checks = 0, failures = 0;
function eq(name, got, want) {
  checks++;
  var a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { failures++; console.log('FOUT ' + name + ': kreeg <' + a + '>, verwacht <' + b + '>'); }
}

// toetsen (moeten gelijk zijn aan wat ui.js van de gedeelde code verwacht)
eq('Terug = 461', W.KEYS[461], 'back');
eq('afspelen 415', W.KEYS[415], 'play');
eq('pauze 19', W.KEYS[19], 'pause');
eq('stop 413', W.KEYS[413], 'stop');
eq('terugspoelen 412', W.KEYS[412], 'rw');
eq('doorspoelen 417', W.KEYS[417], 'ff');
eq('kleuren', [W.KEYS[403], W.KEYS[404], W.KEYS[405], W.KEYS[406]], ['red', 'green', 'yellow', 'blue']);
// de gedeelde toetsentabel kent dezelfde codes (ui.js in .upstream, als die er is)
var ui = path.join(__dirname, '..', '.upstream', 'tizen', 'js', 'ui.js');
if (fs.existsSync(ui)) {
  var src = fs.readFileSync(ui, 'utf8');
  var m = /var KEYS = \{([\s\S]*?)\};/.exec(src);
  var shared = {};
  (m ? m[1] : '').replace(/(\d+):\s*'(\w+)'/g, function (_, c, n) { shared[c] = n; });
  Object.keys(W.KEYS).forEach(function (c) { eq('gedeelde toets ' + c, shared[c], W.KEYS[c]); });
}

// webOS herkennen
eq('PalmSystem', W.isWebOS({ PalmSystem: {}, navigator: { userAgent: '' } }), true);
eq('webOSSystem', W.isWebOS({ webOSSystem: {}, navigator: { userAgent: '' } }), true);
eq('UA Web0S', W.isWebOS({ navigator: { userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/79.0' } }), true);
eq('gewone browser', W.isWebOS({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux) Chrome/141.0' } }), false);

// deviceInfo en getSystemInfo
eq('deviceInfo', W.parseDeviceInfo('{"modelName":"OLED55C36LC","platformVersion":"23.20.55","screenWidth":1920}'), { modelName: 'OLED55C36LC', platformVersion: '23.20.55' });
eq('deviceInfo major/minor', W.parseDeviceInfo({ modelName: '43UM7400', platformVersionMajor: 4, platformVersionMinor: 4 }), { modelName: '43UM7400', platformVersion: '4.4.0' });
eq('deviceInfo onzin', W.parseDeviceInfo('{kapot'), {});
eq('getSystemInfo', W.parseSystemInfo({ returnValue: true, modelName: 'OLED65G2', sdkVersion: '7.3.0', firmwareVersion: '03.30.70' }), { modelName: 'OLED65G2', sdkVersion: '7.3.0', firmwareVersion: '03.30.70' });
eq('getSystemInfo fout', W.parseSystemInfo({ returnValue: false, errorText: 'x' }), {});
eq('model opgeschoond', W.cleanModel(' OLED55<script>C3 '), 'OLED55scriptC3');

// versie
var UA6 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
eq('UA webOS 6', W.versionFromUA(UA6), '6.0');
eq('UA webOS 4', W.versionFromUA('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/53.0.2785.34 Safari/537.36 WebAppManager'), '4.0');
eq('UA webOS 23', W.versionFromUA('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/94.0.4606.128 Safari/537.36 WebAppManager'), '23');
eq('UA webOS 25', W.versionFromUA('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/120.0.6099.270 Safari/537.36 WebAppManager'), '25');
eq('UA geen webOS', W.versionFromUA('Mozilla/5.0 Chrome/141.0'), null);
eq('osVersion uit sdkVersion', W.osVersion({ sdkVersion: '6.3.0', platformVersion: '6.3.1' }, UA6), '6.3');
eq('osVersion uit deviceInfo', W.osVersion({ platformVersion: '23.20.55' }, UA6), '23.20');
eq('osVersion uit UA', W.osVersion({}, UA6), '6.0');
eq('osLabel', W.osLabel({ sdkVersion: '6.3.0' }, ''), 'webOS 6.3');
eq('osLabel onbekend', W.osLabel({}, 'curl'), 'webOS');
eq('osLabel max. 40 tekens', W.osLabel({ sdkVersion: '123456.7' }, '').length <= 40, true);

// apparaat
eq('naam met model', W.deviceName('OLED55C36LC'), 'LG TV (OLED55C36LC)');
eq('naam zonder model', W.deviceName(''), 'LG TV');
eq('platform webos', W.isWebOSPlatform('webos'), true);
eq('platform LG TV', W.isWebOSPlatform('LG TV'), true);
eq('platform tizen', W.isWebOSPlatform('tizen'), false);

// netwerk
eq('bekabeld', W.networkType({ returnValue: true, isInternetConnectionAvailable: true, wired: { state: 'connected' }, wifi: { state: 'disconnected' } }), 'ethernet');
eq('wifi', W.networkType({ returnValue: true, isInternetConnectionAvailable: true, wired: { state: 'disconnected' }, wifi: { state: 'connected' } }), 'wifi');
eq('geen internet', W.networkType({ returnValue: true, isInternetConnectionAvailable: false, wired: { state: 'disconnected' }, wifi: { state: 'disconnected' } }), 'none');
eq('anders', W.networkType({ returnValue: true, isInternetConnectionAvailable: true }), 'other');
eq('geen antwoord', W.networkType(null), 'unknown');

// speler
eq('HLS is geen TS', W.isTS('http://x.test/live/u/p/1.m3u8'), false);
eq('.ts', W.isTS('http://x.test/live/u/p/1.ts'), true);
eq('.ts met query', W.isTS('http://x.test/a.ts?token=1'), true);
eq('Xtream zonder extensie', W.isTS('http://x.test/live/u/p/123'), true);
eq('MP4', W.isTS('http://x.test/movie/u/p/5.mp4'), false);
eq('mkv', W.isTS('http://x.test/movie/u/p/5.mkv'), false);
eq('HLS: eigen video', W.pickEngine('http://x/a.m3u8', { mse: true, canPlayTS: '' }), 'native');
eq('TS, tv kent mp2t: eigen video', W.pickEngine('http://x/a.ts', { mse: true, canPlayTS: 'maybe' }), 'native');
eq('TS, tv kent mp2t niet: mpegts', W.pickEngine('http://x/a.ts', { mse: true, canPlayTS: '' }), 'mpegts');
eq('TS, eerder mislukt: mpegts', W.pickEngine('http://x/a.ts', { mse: true, canPlayTS: 'maybe', tsNative: false }), 'mpegts');
eq('TS zonder MSE: eigen video', W.pickEngine('http://x/a.ts', { mse: false, canPlayTS: '' }), 'native');
eq('na fout TS: mpegts proberen', W.retryWithMpegts('http://x/a.ts', { mse: true }), true);
eq('na fout HLS: niet', W.retryWithMpegts('http://x/a.m3u8', { mse: true }), false);

// Magic Remote
function node(cls, parent) {
  var set = cls ? cls.split(' ') : [];
  return { parentNode: parent || null, classList: { contains: function (c) { return set.indexOf(c) >= 0; } } };
}
var layer = node('layer');
var card = node('card f', node('row-track', layer));
var inner = node('poster', card);
var other = node('layer');
var hidden = node('btn f', other);
var off = node('btn f disabled', layer);
eq('kind van een kaart → kaart', W.pointerTarget(inner, layer) === card, true);
eq('kaart zelf', W.pointerTarget(card, layer) === card, true);
eq('andere laag: niets', W.pointerTarget(hidden, layer), null);
eq('uitgeschakeld: niets', W.pointerTarget(off, layer), null);
eq('achtergrond: niets', W.pointerTarget(layer, layer), null);
eq('wiel omlaag', W.wheelKey(120), 40);
eq('wiel omhoog', W.wheelKey(-53), 38);
eq('wiel bijna stil', W.wheelKey(2), null);

// support: tijdelijke terugval zonder platform
var body = { action: 'app_create', subject: 's', message: 'mmmmmmmmmmmm', platform: 'webos', diagnostics: { kind: 'app' }, device_id: 'd' };
eq('bad_platform → zonder platform/bijlage', W.supportRetryBody(body, { status: 400, json: { error: 'bad_platform', field: 'platform' } }), { action: 'app_create', subject: 's', message: 'mmmmmmmmmmmm', device_id: 'd' });
eq('bad_diagnostics app.platform', !!W.supportRetryBody(body, { status: 400, json: { error: 'bad_diagnostics', field: 'app.platform' } }), true);
eq('andere fout: niet opnieuw', W.supportRetryBody(body, { status: 400, json: { error: 'subject_short' } }), null);
eq('gelukt: niet opnieuw', W.supportRetryBody(body, { status: 200, json: { ok: true } }), null);
eq('app_list: niet opnieuw', W.supportRetryBody({ action: 'app_list' }, { status: 400, json: { error: 'bad_platform' } }), null);
eq('al zonder platform: niet nog eens', W.supportRetryBody({ action: 'app_reply', number: 1, message: 'x' }, { status: 400, json: { error: 'bad_platform' } }), null);

// appinfo.json en versie
var info = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'appinfo.json'), 'utf8'));
var props = {};
fs.readFileSync(path.join(__dirname, '..', 'version.properties'), 'utf8').split('\n').forEach(function (l) { var m2 = /^(\w+)=(.*)$/.exec(l.trim()); if (m2) props[m2[1]] = m2[2]; });
eq('appinfo id', info.id, 'nl.lrvdlinden.bingr');
eq('appinfo type/main', [info.type, info.main], ['web', 'index.html']);
eq('appinfo versie = 1.0.<build>', info.version, props.BINGR_VERSION.split('.').slice(0, 2).join('.') + '.' + parseInt(props.BINGR_BUILD, 10));
eq('Terug naar de app (disableBackHistoryAPI)', info.disableBackHistoryAPI, true);
eq('ACG voor Luna (systeeminfo, netwerk)', info.requiredACG, ['systemconfig.query', 'network.query']);
eq('resolutie', info.resolution, '1920x1080');

console.log(checks + ' controles, ' + failures + ' fout');
process.exit(failures ? 1 : 0);
