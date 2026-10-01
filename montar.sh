#!/usr/bin/env bash
# Monta a UI do Filminho (mesmo bundle do APK) + boot do Discord, empacota e
# cifra com age. Uso: bash montar.sh   (depois: git add/commit/push)
set -eo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
export APP="$HOME/movie-muse"

echo "== 1) build do app (bundle do APK) =="
cd "$APP"
npm run build:capacitor -- --base=./ 2>&1 | tail -1
cd dist
rm -f filminho.apk filminho-kotlin.apk
mv capacitor-index.html index.html
rm -f boot-*.js preloads.js

echo "== 2) fontes locais (CSP do Discord bloqueia Google Fonts) =="
python3 - <<'PYEOF'
import re, urllib.request, os, pathlib
ua = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
css_url = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
css = urllib.request.urlopen(urllib.request.Request(css_url, headers=ua)).read().decode()
os.makedirs("fontes", exist_ok=True)
def baixar(m):
    url = m.group(1)
    nome = url.split("/")[-1]
    alvo = pathlib.Path("fontes") / nome
    if not alvo.exists():
        alvo.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=ua)).read())
    return f"url(./fontes/{nome})"
css = re.sub(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", baixar, css)
html = open("index.html").read()
html = re.sub(r'<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>\s*', "", html)
html = re.sub(r'<link href="https://fonts\.googleapis\.com/css2[^"]*"[^>]*>', f"<style>{css}</style>", html)
open("index.html", "w").write(html)
print("fontes locais ok")
PYEOF

echo "== 3) preloads dos chunks (transição de abas sem latência) =="
python3 - <<'PYEOF'
import os, json, pathlib
assets = sorted(p.name for p in pathlib.Path("assets").glob("*.js"))
urls = [f"./assets/{a}" for a in assets]
open("preloads.js", "w").write(
    "try{(" + (lambda: None).__class__.__name__ + ")&&0}catch(e){};"
    if False else
    "(function(){try{var l=%s;window.__FILMINHO_PRELOADS=l;"
    "(window.requestIdleCallback||function(f){setTimeout(f,200);})(function(){l.forEach(function(u){var e=document.createElement('link');"
    "e.rel='modulepreload';e.href=u;document.head.appendChild(e);});});}catch(e){}})();"
    % json.dumps(urls)
)
print("chunks:", len(urls))
PYEOF

echo "== 4) boot (versão nova a cada build — cache impossível) =="
cd "$BASE"
npx esbuild activity/discord-boot.mjs --bundle --format=esm --minify --outfile=/tmp/boot.js 2>&1 | tail -1
VER=$(sha1sum /tmp/boot.js | cut -c1-8)
BOOT="boot-$VER.js"
cp /tmp/boot.js "$APP/dist/$BOOT"

echo "== 5) injeta boot + preloads ANTES do app =="
BOOT="$BOOT" APP="$APP" python3 - <<'PYEOF'
import os
p = os.path.join(os.environ["APP"], "dist", "index.html")
h = open(p).read()
boot = os.environ["BOOT"]
tags = f'<script src="./preloads.js"></script>\n    <script type="module" src="./{boot}"></script>'
alvo = '<script type="module" crossorigin src="./assets/'
if boot not in h:
    h = h.replace(alvo, tags + "\n    " + alvo, 1)
open(p, "w").write(h)
print("injetado:", boot, "| antes do app:", h.index(boot) < h.index(alvo))
PYEOF

echo "== 6) empacota + cifra =="
PUB=$(cat "$BASE/age-public-key.txt")
tar -czf /tmp/filminho-ui.tar.gz -C "$APP/dist" .
age -r "$PUB" -o "$BASE/filminho-ui.tar.gz.age" /tmp/filminho-ui.tar.gz
ls -la "$BASE/filminho-ui.tar.gz.age"
echo "montado! (boot: $BOOT) Agora: git add/commit/push em $BASE"
