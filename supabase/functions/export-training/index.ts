// Ekspor data latihan (hanya yang approved + 👍 + belum diekspor) sebagai JSONL siap fine-tune.
// Deploy:  supabase functions deploy export-training --no-verify-jwt
// Secret:  supabase secrets set TRAINING_ADMIN_KEY=<kunci-panjang-acak>
// Pakai:   curl -H "x-admin-key: $KEY" "https://<ref>.supabase.co/functions/v1/export-training?limit=500&mode=ngobrol" -o train.jsonl
//          (header respons x-run-id = id run; simpan untuk training-complete)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { toChatJsonl, safeEqual, clampInt, MODES } from '../_shared/format.js';

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Gunakan GET atau POST', { status: 405 });
  if (!safeEqual(req.headers.get('x-admin-key') ?? '', Deno.env.get('TRAINING_ADMIN_KEY') ?? '')) {
    return new Response('Tidak diizinkan', { status: 401 });
  }

  const q = new URL(req.url).searchParams;
  const limit = clampInt(q.get('limit'), 1, 5000, 500);
  const mode = q.get('mode');
  if (mode && !MODES.includes(mode)) return new Response('mode tidak valid', { status: 400 });
  const format = q.get('format') === 'json' ? 'json' : 'jsonl';

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await sb.rpc('claim_training_batch', { p_limit: limit, p_mode: mode });
  if (error || !data) return new Response('Gagal mengambil data: ' + (error?.message ?? 'kosong'), { status: 500 });

  const headers: Record<string, string> = { 'x-run-id': data.run_id, 'x-example-count': String(data.rows.length) };
  if (format === 'json') return Response.json(data, { headers });
  return new Response(toChatJsonl(data.rows), {
    headers: { ...headers, 'content-type': 'application/jsonl; charset=utf-8', 'content-disposition': `attachment; filename="train-${data.run_id}.jsonl"` },
  });
});
