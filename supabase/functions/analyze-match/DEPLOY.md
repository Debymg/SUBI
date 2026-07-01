# Deploy — analyze-match Edge Function

## Arquitectura final (sin Make)

```
Botón "Iniciar análisis IA"
  ↓
Supabase Edge Function (analyze-match)
  ├─ scoring básico: sexo (filtro duro) + edad (60 pts) + dental (25 pts)
  ├─ si pasa 20 pts → GPT-4o-mini compara señas + vestimenta (hasta 15 pts)
  └─ upsert match_candidates con ai_notes
  ↓
Frontend recarga coincidencias
```

**Make ya no es necesario.**

---

## Paso 1 — Instalar Supabase CLI (si no lo tienes)

```powershell
winget install Supabase.CLI
# o
npm install -g supabase
```

## Paso 2 — Login y vincular proyecto

```powershell
supabase login
supabase link --project-ref tkfcrowlnwvfdyzlrsjv
```

## Paso 3 — Agregar secretos

```powershell
supabase secrets set OPENAI_API_KEY=sk-proj-TU_CLAVE_AQUI
```

> La clave de OpenAI va SOLO aquí, nunca en el .env del frontend.
> Consíguela en: https://platform.openai.com/api-keys

## Paso 4 — SQL en Supabase Dashboard (si no existe)

En el SQL Editor de tu proyecto:

```sql
-- Columna para notas de la IA
ALTER TABLE match_candidates
  ADD COLUMN IF NOT EXISTS ai_notes text;

-- Restricción única necesaria para el upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_candidates_report_record_unique'
  ) THEN
    ALTER TABLE match_candidates
      ADD CONSTRAINT match_candidates_report_record_unique
      UNIQUE (report_id, record_id);
  END IF;
END $$;
```

## Paso 5 — Deploy

```powershell
supabase functions deploy analyze-match --no-verify-jwt
```

## Paso 6 — Verificar

En Supabase Dashboard → Edge Functions → analyze-match → Logs

Respuesta exitosa:
```json
{
  "analyzed": 6,
  "candidates_found": 2
}
```

---

## Scoring explicado

| Factor | Puntos | Quién lo calcula |
|--------|--------|-----------------|
| Sexo incompatible | 0 (descarta el par) | Edge Function |
| Edad (solapamiento de rangos) | 0–60 pts | Edge Function |
| Dental (ambos tienen registros) | 25 pts | Edge Function |
| Señas + vestimenta | 0–15 pts | GPT-4o-mini |
| **Total máximo** | **100 pts** | |

Umbral mínimo para crear candidato: **20 pts básicos**.
Solo se llama a la IA si el par ya pasó los 20 pts básicos.
