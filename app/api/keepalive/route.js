import { supabase } from '@/lib/supabase';

// Haelt das Supabase-Projekt wach: verhindert, dass es nach 7 Tagen
// Inaktivitaet pausiert. Wird von Vercel per Cron taeglich aufgerufen
// (siehe vercel.json). Macht einfach eine minimale Datenbank-Abfrage.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { error } = await supabase.from('employees').select('id').limit(1);
    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true, pinged: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
