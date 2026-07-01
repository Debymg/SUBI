import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Flujo completo — no necesita Make:
//   Botón → Edge Function
//     → scoring básico (sexo / edad / dental)
//     → GPT-4o-mini compara señas + vestimenta
//     → upsert match_candidates con ai_notes
//     → retorna resultado al frontend

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Pesos ─────────────────────────────────────────────────────────────────────
const W_AGE    = 60;   // solapamiento de rangos etarios   (max 60 pts)
const W_DENTAL = 25;   // ambos tienen registros dentales  (25 pts fijo)
const W_AI     = 15;   // GPT compara señas + vestimenta   (max 15 pts)
//                                                Total max = 100 pts

const MIN_SCORE_BASIC = 5; // umbral mínimo para considerar candidato

// ── Score básico (sin IA) ─────────────────────────────────────────────────────
function basicScore(
  report: Record<string, unknown>,
  record: Record<string, unknown>,
): number {
  // Sexo: filtro duro
  const rSex   = report.sex as string;
  const recSex = record.sex  as string;
  if (rSex !== 'unknown' && recSex !== 'unknown' && rSex !== recSex) return 0;

  let score = 0;

  // Edad (60 pts)
  const rMin   = (report.approx_age_min  as number | null) ?? null;
  const rMax   = (report.approx_age_max  as number | null) ?? rMin;
  const recMin = (record.approx_age_min  as number | null) ?? null;
  const recMax = (record.approx_age_max  as number | null) ?? recMin;
  if (rMin !== null && recMin !== null) {
    const lo = Math.max(rMin, recMin);
    const hi = Math.min(rMax ?? rMin, recMax ?? recMin);
    if (hi >= lo) {
      const overlapSpan = hi - lo + 1;
      const minSpan = Math.min((rMax ?? rMin) - rMin + 1, (recMax ?? recMin) - recMin + 1);
      score += Math.round((overlapSpan / (minSpan || 1)) * W_AGE);
    }
  }

  // Dental (25 pts)
  if (report.has_dental_records && record.has_dental_chart) score += W_DENTAL;

  return Math.min(score, W_AGE + W_DENTAL);
}

// ── Comparación con GPT-4o-mini ─────────────────────────────────────
async function aiMarksScore(
  reportDesc: string,
  recordDesc: string,
): Promise<{ points: number; reason: string }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { points: 0, reason: '' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      max_tokens:  120,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Eres un experto forense. Compara los datos físicos del DESAPARECIDO y el EXPEDIENTE FORENSE. ' +
            'Responde SOLO con JSON válido: {"score": 0-100, "razon": "oración explicativa en español"}. ' +
            'REGLAS DE EVALUACIÓN: ' +
            '1) Tolerancia en medidas: La estatura y peso suelen ser estimados. Diferencias de hasta 5 cm (ej. 1.62m vs 165cm) o 5 kg se consideran una COINCIDENCIA POSITIVA. Menciona que son muy similares para animar al usuario. ' +
            '2) Tatuajes y señas: Si el expediente forense describe un tatuaje o rasgo muy específico que NO fue reportado en el desaparecido, debes considerarlo una DISCREPANCIA (resta puntos y menciónalo en la razón). ' +
            '3) Razón: Sé directo y útil. Ej: "Estatura muy similar (1.62m y 165cm), pero el forense reporta un tatuaje de dragón no descrito por la familia." ' +
            'Sé analítico para ayudar al perito a tomar la decisión.',
        },
        {
          role: 'user',
          content:
            `DESAPARECIDO:\n${reportDesc}\n\n` +
            `EXPEDIENTE FORENSE:\n${recordDesc}`,
        },
      ],
    }),
  });

  if (!res.ok) return { points: 0, reason: '' };

  const data   = await res.json();
  const text   = (data.choices?.[0]?.message?.content as string | undefined)?.trim() ?? '';
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as { score: number; razon: string };

  const points = Math.round((Math.max(0, Math.min(100, Number(parsed.score))) / 100) * W_AI);
  return { points, reason: parsed.razon ?? '' };
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 1. Obtener datos activos de la BD
    const [reportsRes, recordsRes] = await Promise.all([
      supabase
        .from('missing_reports')
        .select('id, full_name, sex, approx_age_min, approx_age_max, distinguishing_marks, has_dental_records')
        .eq('status', 'open'),
      supabase
        .from('unidentified_records')
        .select('id, case_code, sex, approx_age_min, approx_age_max, distinguishing_marks, clothing, has_dental_chart, height_cm')
        .eq('status', 'unidentified'),
    ]);

    if (reportsRes.error) throw new Error(`Reports error: ${reportsRes.error.message}`);
    if (recordsRes.error) throw new Error(`Records error: ${recordsRes.error.message}`);

    const reports = reportsRes.data;
    const records = recordsRes.data;

    if (!reports?.length || !records?.length) {
      return new Response(
        JSON.stringify({ analyzed: 0, candidates_found: 0, reports_count: reports?.length, records_count: records?.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Calcular score por cada par
    const upserts: object[] = [];

    for (const report of reports) {
      for (const record of records) {
        // Score básico primero (rápido, sin coste de API)
        const base = basicScore(
          report as Record<string, unknown>,
          record as Record<string, unknown>,
        );
        if (base < MIN_SCORE_BASIC) continue;

        let finalScore = base;
        let aiNotes: string | null = null;

        // Score IA solo si alguno tiene señas, vestimenta, o altura
        const reportMarks  = (report.distinguishing_marks as string | null)?.trim() ?? '';
        const recordMarks  = (record.distinguishing_marks as string | null)?.trim() ?? '';
        const recordCloth  = (record.clothing             as string | null)?.trim() ?? '';
        const recordHeight = (record.height_cm            as number | null);

        if (reportMarks || recordMarks || recordCloth || recordHeight) {
          const reportDesc = [
            `Sexo: ${report.sex}`,
            `Edad aprox: ${report.approx_age_min ?? '?'} - ${report.approx_age_max ?? '?'}`,
            reportMarks && `Señas particulares: ${reportMarks}`
          ].filter(Boolean).join(' | ');

          const recordDesc = [
            `Sexo: ${record.sex}`,
            `Edad aprox: ${record.approx_age_min ?? '?'} - ${record.approx_age_max ?? '?'}`,
            recordHeight && `Estatura estimada: ${recordHeight} cm`,
            recordCloth && `Vestimenta: ${recordCloth}`,
            recordMarks && `Señas particulares: ${recordMarks}`
          ].filter(Boolean).join(' | ');

          try {
            const ai = await aiMarksScore(reportDesc, recordDesc);
            finalScore = Math.min(finalScore + ai.points, 100);
            if (ai.reason) aiNotes = ai.reason;
          } catch {
            // Si la IA falla, conservar score básico
          }
        }

        upserts.push({
          report_id:        report.id,
          record_id:        record.id,
          match_percentage: finalScore,
          status:           'pending',
          ai_notes:         aiNotes,
        });
      }
    }

    // 3. Guardar en BD (actualizar score si ya existe el par)
    let aiEnhanced = 0;
    if (upserts.length > 0) {
      for (const u of upserts) {
        const up = u as Record<string, unknown>;
        if (up.ai_notes) aiEnhanced++;
        // Upsert individual para poder actualizar match_percentage y ai_notes
        await supabase
          .from('match_candidates')
          .upsert(up, { onConflict: 'report_id,record_id' });
      }
    }

    return new Response(
      JSON.stringify({
        analyzed:         reports.length * records.length,
        candidates_found: upserts.length,
        ai_enhanced:      aiEnhanced,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
