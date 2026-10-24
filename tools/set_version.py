#!/usr/bin/env python3
"""Zet BINGR_VERSION en BINGR_BUILD uit version.properties in appinfo.json en package.json.

webOS-versie = <major>.<minor>.<build> (bijv. 1.0.1 build 147 -> 1.0.147), net als de Samsung TV-app (1.0.<build>):
elk deel is een getal en een update moet een hogere versie hebben, dus het buildnummer staat in het laatste deel.
Gebruik: python3 tools/set_version.py [--check]   (--check: alleen controleren, exitcode 1 als iets niet klopt)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def props(path):
    out = {}
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip()
    return out


def webos_version(version, build):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise SystemExit('BINGR_VERSION moet x.y.z zijn, niet %r' % version)
    if not re.fullmatch(r'\d{1,5}', build):
        raise SystemExit('BINGR_BUILD moet een getal zijn, niet %r' % build)
    major, minor, _ = version.split('.')
    return '%s.%s.%s' % (major, minor, int(build))


def main():
    check = '--check' in sys.argv
    p = props(os.path.join(ROOT, 'version.properties'))
    want = webos_version(p['BINGR_VERSION'], p['BINGR_BUILD'])
    bad = []
    for name in ('appinfo.json', 'package.json'):
        path = os.path.join(ROOT, name)
        text = open(path, encoding='utf-8').read()
        data = json.loads(text)
        if data.get('version') == want:
            continue
        if check:
            bad.append('%s: versie %s, verwacht %s' % (name, data.get('version'), want))
            continue
        text, n = re.subn(r'("version"\s*:\s*")[^"]*(")', lambda m: m.group(1) + want + m.group(2), text, count=1)
        assert n == 1, name
        open(path, 'w', encoding='utf-8').write(text)
        print('%s -> %s' % (name, want))
    lock = os.path.join(ROOT, 'package-lock.json')
    if os.path.exists(lock):
        data = json.load(open(lock, encoding='utf-8'))
        if data.get('version') != want or data.get('packages', {}).get('', {}).get('version') != want:
            if check:
                bad.append('package-lock.json: versie %s, verwacht %s' % (data.get('version'), want))
            else:
                data['version'] = want
                data.setdefault('packages', {}).setdefault('', {})['version'] = want
                with open(lock, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.write('\n')
                print('package-lock.json -> %s' % want)
    if bad:
        print('\n'.join(bad))
        print('Draai python3 tools/set_version.py')
        sys.exit(1)
    if check:
        print('Versie klopt: %s (Bingr %s, build %s)' % (want, p['BINGR_VERSION'], p['BINGR_BUILD']))


if __name__ == '__main__':
    main()
