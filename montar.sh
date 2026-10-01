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

echo "== 3) boot-v3 (roteador CSP + diagnóstico + SDK) =="
cd "$BASE"
npx esbuild activity/discord-boot.mjs --bundle --format=esm --minify --outfile="$APP/dist/boot-v3.js" 2>&1 | tail -1
test -s "$APP/dist/boot-v3.js"

echo "== 4) injeta boot ANTES do app =="
python3 - <<'PYEOF'
import os
p = os.path.join(os.environ["APP"], "dist", "index.html")
h = open(p).read()
tag = '<script type="module" src="./boot-v3.js"></script>'
if tag not in h:
    alvo = '<script type="module" crossorigin src="./assets/'
    h = h.replace(alvo, tag + "\n    " + alvo, 1)
open(p, "w").write(h)
print("boot injetado antes do app:", tag in h and h.index(tag) < h.index(alvo))
PYEOF

echo "== 5) empacota + cifra =="
PUB=$(cat "$BASE/age-public-key.txt")
tar -czf /tmp/filminho-ui.tar.gz -C "$APP/dist" .
age -r "$PUB" -o "$BASE/filminho-ui.tar.gz.age" /tmp/filminho-ui.tar.gz
ls -la "$BASE/filminho-ui.tar.gz.age"
echo "montado! Agora: git add/commit/push em $BASE"
