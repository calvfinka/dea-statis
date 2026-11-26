#!/usr/bin/env bash
# Terapkan patch streaming + timeout ke repo dea-statis. Jalankan dari ROOT repo:
#   bash /tmp/dea-patch-stream/apply.sh
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f js/app.js ] || [ ! -f worker/worker.js ]; then
  echo "Jalankan dari root repo (folder yang berisi js/ dan worker/)."; exit 1
fi
cp "$SRC/js/app.js" js/app.js
cp "$SRC/worker/worker.js" worker/worker.js
node --check js/app.js && echo "js/app.js OK"
cp worker/worker.js /tmp/_w_check.mjs && node --check /tmp/_w_check.mjs && echo "worker/worker.js OK"
echo; git diff --stat 2>/dev/null || true
echo; echo "Selesai. Lanjut: git commit + push (situs), lalu deploy Worker. Batalkan: git checkout -- js/app.js worker/worker.js"
