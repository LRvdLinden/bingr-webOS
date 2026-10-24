#!/usr/bin/env python3
"""Bouwt de webOS-app (de map die ares-package inpakt) uit de gedeelde Samsung TV-code en de platformlaag.

  python3 tools/build_app.py [uitvoermap]        (standaard build/app)

Stappen:
1. De gedeelde code ophalen: LRvdLinden/bingr-android op precies UPSTREAM_COMMIT (upstream.properties), anoniem
   (openbare repo, geen token) en alleen tizen/ en Translations.json (sparse checkout) in .upstream/.
   Lokaal kan BINGR_UPSTREAM_SRC naar een clone wijzen (bijv. ../bingr-android); de commit moet er dan in staan.
2. tizen/{index.html,css,js,img,audio} kopiëren en platform/patches.json toepassen (elke vervanging precies zo vaak
   als opgegeven, anders stopt de build).
3. De platformlaag erbij: platform/webos-logic.js en platform/webos.js (js/webos/), platform/webos.css (css/).
4. Versie en build (version.properties) in core.js; teksten per taal en één bundel met de tools van de Tizen-app
   (make_strings.py --split, bundle.js met terser uit node_modules).
5. mpegts.js (Apache-2.0, uit node_modules, met licentie) als js/lib/mpegts.js; pas geladen als een TS-stream het nodig heeft.
6. appinfo.json en de iconen/splash uit assets/.
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UP = os.path.join(ROOT, '.upstream')
SPARSE = ['tizen/', 'app/src/main/assets/Translations.json']


def props(name):
    out = {}
    for line in open(os.path.join(ROOT, name), encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip()
    return out


def git(*args, cwd=UP, capture=False):
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0')
    r = subprocess.run(['git'] + list(args), cwd=cwd, env=env, check=True,
                       stdout=subprocess.PIPE if capture else None, text=True)
    return (r.stdout or '').strip() if capture else None


def fetch_upstream():
    up = props('upstream.properties')
    commit = up['UPSTREAM_COMMIT']
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise SystemExit('UPSTREAM_COMMIT moet een volledige SHA zijn')
    src = os.environ.get('BINGR_UPSTREAM_SRC') or up['UPSTREAM_REPO']
    if os.path.isdir(os.path.join(UP, '.git')):
        try:
            if git('rev-parse', 'HEAD', capture=True) == commit:
                git('checkout', '-q', '--', '.')  # make_strings.py schrijft in de checkout: altijd terug naar de commit
                return commit
        except subprocess.CalledProcessError:
            pass
        shutil.rmtree(UP)
    os.makedirs(UP)
    git('init', '-q')
    git('remote', 'add', 'origin', src)
    git('config', 'core.sparseCheckout', 'true')
    with open(os.path.join(UP, '.git', 'info', 'sparse-checkout'), 'w') as f:
        f.write('\n'.join(SPARSE) + '\n')
    git('fetch', '-q', '--depth', '1', 'origin', commit)
    git('checkout', '-q', 'FETCH_HEAD')
    got = git('rev-parse', 'HEAD', capture=True)
    if got != commit:
        raise SystemExit('upstream: kreeg %s, verwacht %s' % (got, commit))
    return commit


def apply_patches(stage):
    spec = json.load(open(os.path.join(ROOT, 'platform', 'patches.json'), encoding='utf-8'))
    for p in spec['patches']:
        path = os.path.join(stage, p['file'])
        text = open(path, encoding='utf-8').read()
        want = p.get('count', 1)
        n = text.count(p['find'])
        if n != want:
            raise SystemExit('patch %s (%s): %d keer gevonden, verwacht %d. De gedeelde code is veranderd: '
                             'pas platform/patches.json aan.' % (p['file'], p.get('why', ''), n, want))
        open(path, 'w', encoding='utf-8').write(text.replace(p['find'], p['replace']))
    return len(spec['patches'])


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'app'))
    ver = props('version.properties')
    V, Bn = ver['BINGR_VERSION'], ver['BINGR_BUILD']
    appinfo = json.load(open(os.path.join(ROOT, 'appinfo.json'), encoding='utf-8'))
    major, minor = V.split('.')[:2]
    if appinfo['version'] != '%s.%s.%d' % (major, minor, int(Bn)):
        raise SystemExit('appinfo.json heeft versie %s; draai python3 tools/set_version.py' % appinfo['version'])

    commit = fetch_upstream()
    tizen = os.path.join(UP, 'tizen')
    print('gedeelde code: bingr-android@%s (tizen/)' % commit[:12])

    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    # teksten (strings.js) maken zoals tizen/tools/package.sh dat doet
    subprocess.run([sys.executable, os.path.join(tizen, 'tools', 'make_strings.py')], check=True)
    shutil.copy(os.path.join(tizen, 'index.html'), out)
    for d in ('css', 'js', 'img', 'audio'):
        shutil.copytree(os.path.join(tizen, d), os.path.join(out, d))

    n = apply_patches(out)
    print('patches: %d toegepast' % n)

    os.makedirs(os.path.join(out, 'js', 'webos'))
    for f in ('webos-logic.js', 'webos.js'):
        shutil.copy(os.path.join(ROOT, 'platform', f), os.path.join(out, 'js', 'webos', f))
    shutil.copy(os.path.join(ROOT, 'platform', 'webos.css'), os.path.join(out, 'css', 'webos.css'))

    core = os.path.join(out, 'js', 'core.js')
    s = open(core, encoding='utf-8').read()
    for k, v in (('__BINGR_BUILD__', Bn), ('__BINGR_VERSION__', V)):
        if s.count(k) != 1:
            raise SystemExit('%s niet precies één keer in core.js' % k)
        s = s.replace(k, v)
    open(core, 'w', encoding='utf-8').write(s)

    # teksten per taal + één bundel (zelfde als het Samsung TV-pakket); zonder node blijven het losse scripts
    subprocess.run([sys.executable, os.path.join(tizen, 'tools', 'make_strings.py'), '--split', out], check=True)
    node_path = os.path.join(ROOT, 'node_modules')
    env = dict(os.environ, NODE_PATH=node_path)
    if shutil.which('node'):
        subprocess.run(['node', os.path.join(tizen, 'tools', 'bundle.js'), out], check=True, env=env)
    else:
        print('let op: node niet gevonden; scripts worden niet gebundeld')

    mp = os.path.join(node_path, 'mpegts.js', 'dist', 'mpegts.js')
    if not os.path.exists(mp):
        raise SystemExit('mpegts.js ontbreekt (npm ci)')
    shutil.copy(mp, os.path.join(out, 'js', 'lib', 'mpegts.js'))
    os.makedirs(os.path.join(out, 'licenses'))
    shutil.copy(os.path.join(node_path, 'mpegts.js', 'LICENSE'), os.path.join(out, 'licenses', 'mpegts.js-LICENSE.txt'))

    shutil.copy(os.path.join(ROOT, 'appinfo.json'), out)
    for f in ('icon.png', 'largeIcon.png', 'splash.png'):
        shutil.copy(os.path.join(ROOT, 'assets', f), out)
    with open(os.path.join(out, 'js', 'webos', 'upstream.txt'), 'w') as f:
        f.write('bingr-android %s\n' % commit)
    print('app: %s (Bingr %s build %s, webOS-versie %s)' % (out, V, Bn, appinfo['version']))


if __name__ == '__main__':
    main()
