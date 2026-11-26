// Dipanggil setelah training selesai/gagal (dari pipeline CI/CD atau curl). Memperbarui training_runs.
// status "failed" mengembalikan contoh ke antrean. Opsional: PIPELINE_WEBHOOK_URL dipanggil saat status "done".
// Deploy:  supabase functions deploy training-complete --no-verify-jwt
// Pakai:   curl -X POST -H "x-admin-key: $KEY" -H "content-type: application/json" \
//            -d '{"run_id":"<uuid>","status":"done","model_name":"ft:gpt-4o-mini:dme:v1"}' \
//            https://<ref>.supabase.co/functions/v1/training-complete
import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeEqual, isUuid, RUN_STATUS } from '../_shared/format.js';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Gunakan POST', { status: 405 });
  if (!safeEqual(req.headers.get('x-admin-key') ?? '', Deno.env.get('TRAINING_ADMIN_KEY') ?? '')) {
    return new Response('Tidak diizinkan', { status: 401 });
  }

  let b: any;
  try { b = await req.json(); } catch { return new Response('JSON tidak valid', { status: 400 }); }
  if (!isUuid(b?.run_id) || !RUN_STATUS.includes(b?.status)) return new Response('run_id/status tidak valid', { status: 400 });
  const model = typeof b.model_name === 'string' ? b.model_name.slice(0, 200) : null;
  const note = typeof b.note === 'string' ? b.note.slice(0, 500) : null;

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await sb.rpc('finish_training_run', { p_run_id: b.run_id, p_status: b.status, p_model: model, p_note: note });
  if (error) return new Response('Gagal: ' + error.message, { status: 400 });

  // Picu pipeline berikutnya (mis. GitHub Actions repository_dispatch / deploy hook). Kegagalan webhook tidak membatalkan pembaruan.
  let webhook: string | null = null;
  const hook = Deno.env.get('PIPELINE_WEBHOOK_URL');
  if (hook && b.status === 'done') {
    try {
      const r = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run_id: b.run_id, model_name: model }) });
      webhook = r.ok ? 'ok' : 'gagal ' + r.status;
    } catch { webhook = 'gagal'; }
  }
  return Response.json({ ok: true, run_id: b.run_id, status: b.status, webhook });
});
