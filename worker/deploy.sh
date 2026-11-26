#!/usr/bin/env bash
# Deploy Worker + isi secret, semuanya dari terminal Codespace.
# Token dan key hanya diketik di terminal; tidak disimpan di file maupun riwayat git.
set -e
cd "$(dirname "$0")"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  read -rsp "Tempel API Token Cloudflare (template 'Edit Cloudflare Workers'): " CLOUDFLARE_API_TOKEN
  echo
  export CLOUDFLARE_API_TOKEN
fi

echo "== Deploy Worker =="
npx --yes wrangler@4 deploy

echo
echo "== Isi secret (kosongkan lalu Enter untuk melewati) =="
for NAME in GROQ_API_KEY GEMINI_API_KEY TAVILY_API_KEY SERPER_API_KEY SUPABASE_URL SUPABASE_SERVICE_KEY ALERT_WEBHOOK_URL; do
  read -rsp "Tempel $NAME: " VALUE
  echo
  if [ -n "$VALUE" ]; then
    printf %s "$VALUE" | npx --yes wrangler@4 secret put "$NAME"
  fi
done

echo
echo "Selesai. Uji dengan: curl -i https://dme-ai.calvfinka.workers.dev"
echo "(jawaban 403 'Origin tidak diizinkan' berarti Worker hidup dan aman)"
