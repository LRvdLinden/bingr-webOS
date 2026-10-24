#!/usr/bin/env python3
"""Controleert een .ipk van ares-package: ar-archief met debian-binary, control.tar.gz en data.tar.gz; in data de app
onder usr/palm/applications/<id>/ met appinfo.json (id, versie, type web, main) en index.html; niet groter dan 99 MB
(de inbox weigert boven 100 MB). Gebruik: python3 tools/check_ipk.py <pakket.ipk> <appinfo.json>"""
import io, json, os, sys, tarfile


def ar_members(data):
    if data[:8] != b'!<arch>\n':
        raise SystemExit('geen ar-archief')
    pos, out = 8, {}
    while pos + 60 <= len(data):
        hdr = data[pos:pos + 60]
        name = hdr[:16].decode().strip().rstrip('/')
        size = int(hdr[48:58].decode().strip())
        out[name] = data[pos + 60:pos + 60 + size]
        pos += 60 + size + (size % 2)
    return out


def main():
    ipk, info_path = sys.argv[1], sys.argv[2]
    want = json.load(open(info_path, encoding='utf-8'))
    size = os.path.getsize(ipk)
    err = []
    if size > 99 * 1024 * 1024:
        err.append('pakket is %d bytes (max. 99 MB)' % size)
    m = ar_members(open(ipk, 'rb').read())
    for k in ('debian-binary', 'control.tar.gz', 'data.tar.gz'):
        if k not in m:
            err.append('%s ontbreekt in de .ipk' % k)
    if err:
        raise SystemExit('\n'.join(err))
    control = tarfile.open(fileobj=io.BytesIO(m['control.tar.gz']))
    ctl = [x for x in control.getmembers() if x.name.lstrip('./') == 'control']
    ctext = control.extractfile(ctl[0]).read().decode() if ctl else ''
    data = tarfile.open(fileobj=io.BytesIO(m['data.tar.gz']))
    names = [x.name.lstrip('./') for x in data.getmembers()]
    base = 'usr/palm/applications/%s/' % want['id']
    if base + 'appinfo.json' not in names:
        raise SystemExit('appinfo.json niet gevonden onder %s' % base)
    got = json.load(data.extractfile('./' + base + 'appinfo.json' if './' + base + 'appinfo.json' in [x.name for x in data.getmembers()] else base + 'appinfo.json'))
    for k in ('id', 'version', 'type', 'main'):
        if got.get(k) != want.get(k):
            err.append('appinfo.json %s = %r, verwacht %r' % (k, got.get(k), want.get(k)))
    for f in (want['main'], 'icon.png', 'largeIcon.png', 'js/bingr.min.js', 'js/lib/mpegts.js'):
        if base + f not in names:
            err.append('%s ontbreekt in het pakket' % f)
    if 'Version: %s' % want['version'] not in ctext:
        err.append('control: versie %s niet gevonden' % want['version'])
    bad = [n for n in names if n.endswith(('.ipk', '.wgt', '.apk', '.map')) or '/test/' in n or '/.git/' in n]
    if bad:
        err.append('hoort niet in het pakket: %s' % ', '.join(bad[:5]))
    if err:
        raise SystemExit('\n'.join(err))
    print('ipk in orde: %s %s, %d bestanden, %.1f MB' % (want['id'], want['version'], len([n for n in names if n.startswith(base) and not n.endswith('/')]), size / 1048576.0))


if __name__ == '__main__':
    main()
