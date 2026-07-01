import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import TabForense from './tabs/TabForense';
import TabTrazabilidad from './tabs/TabTrazabilidad';
import './DashboardPage.css';

const SEX_LABEL = { male: 'Masculino', female: 'Femenino', unknown: 'Desconocido' };

// ── Lightbox con Portal (evita problemas con transform/animation de ancestros) ─
function MatchLightbox({ urls, idx: initialIdx, onClose }) {
  const [idx, setIdx] = useState(initialIdx);
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowRight')  setIdx(i => Math.min(i + 1, urls.length - 1));
      if (e.key === 'ArrowLeft')   setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, urls.length]);
  return createPortal(
    <div className="lb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lb-close" onClick={onClose} aria-label="Cerrar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <button className="lb-nav lb-nav--prev" onClick={() => setIdx(i => i - 1)} disabled={idx === 0} aria-label="Anterior">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <img src={urls[idx]} alt={`Fotografía ${idx + 1}`} className="lb-img" />
      <button className="lb-nav lb-nav--next" onClick={() => setIdx(i => i + 1)} disabled={idx === urls.length - 1} aria-label="Siguiente">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      {urls.length > 1 && <p className="lb-counter">{idx + 1} / {urls.length}</p>}
    </div>,
    document.body
  );
}

function ScoreBadge({ pct }) {
  const color = pct >= 70 ? 'green' : pct >= 40 ? 'amber' : 'red';
  return <span className={`score-badge score-badge--${color}`}>{pct}%</span>;
}

// ── Normaliza texto para comparación sin tildes ni puntuación ─────────────────
function normalizeWords(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/\W+/).filter(w => w.length > 3);
}

/**
 * Calcula un puntaje de coincidencia [0-100] entre un reporte y un expediente.
 *
 * Pesos:
 *   Sexo:    filtro duro — si ambos son conocidos y difieren → 0
 *   Edad:    45 pts según el ratio de solapamiento de rangos etarios
 *   Dental:  20 pts si ambos tienen registros dentales (pendiente de lab)
 *   Marcas:  35 pts según solapamiento de palabras clave en señas particulares
 *
 * Umbral mínimo para crear candidato: 25 pts
 */
function computeMatchScore(report, record) {
  const breakdown = { sex: false, age: false, dental: false, marks: false, ageOverlapPct: 0 };

  // Sexo: filtro duro
  const rSex   = report.sex;
  const recSex = record.sex;
  const sexKnown = rSex !== 'unknown' && recSex !== 'unknown';
  if (sexKnown && rSex !== recSex) return { score: 0, breakdown };
  breakdown.sex = !sexKnown || rSex === recSex;

  let score = 0;

  // Edad: solapamiento de rangos (45 pts)
  const rMin  = report.approx_age_min  ?? null;
  const rMax  = report.approx_age_max  ?? rMin;
  const recMin = record.approx_age_min ?? null;
  const recMax = record.approx_age_max ?? recMin;
  if (rMin !== null && recMin !== null) {
    const loOverlap = Math.max(rMin, recMin);
    const hiOverlap = Math.min(rMax ?? rMin, recMax ?? recMin);
    if (hiOverlap >= loOverlap) {
      const loUnion = Math.min(rMin, recMin);
      const hiUnion = Math.max(rMax ?? rMin, recMax ?? recMin);
      const ratio = (hiOverlap - loOverlap + 1) / (hiUnion - loUnion + 1 || 1);
      score += Math.round(Math.min(ratio, 1) * 45);
      breakdown.age = true;
      breakdown.ageOverlapPct = Math.round(ratio * 100);
    }
  }

  // Dental: potencial para verificación de laboratorio (20 pts)
  if (report.has_dental_records && record.has_dental_chart) {
    score += 20;
    breakdown.dental = true;
  }

  // Marcas distintivas: coincidencia de palabras clave (35 pts)
  if (report.distinguishing_marks && record.distinguishing_marks) {
    const rWords  = normalizeWords(report.distinguishing_marks);
    const recSet  = new Set(normalizeWords(record.distinguishing_marks));
    if (rWords.length > 0 && recSet.size > 0) {
      const matched = rWords.filter(w => recSet.has(w)).length;
      const ratio   = matched / Math.max(rWords.length, recSet.size);
      const marksScore = Math.round(Math.min(ratio, 1) * 35);
      if (marksScore > 0) {
        score += marksScore;
        breakdown.marks = true;
      }
    }
  }

  return { score: Math.min(score, 100), breakdown };
}

// Helpers para los indicadores visuales de la tarjeta de coincidencia
function ageOverlapsUI(report, record) {
  const rMin  = report?.approx_age_min ?? null;
  const rMax  = report?.approx_age_max ?? rMin;
  const recMin = record?.approx_age_min ?? null;
  const recMax = record?.approx_age_max ?? recMin;
  if (rMin === null || recMin === null) return null;
  return Math.min(rMax ?? rMin, recMax ?? recMin) >= Math.max(rMin, recMin);
}

function marksOverlapUI(report, record) {
  if (!report?.distinguishing_marks || !record?.distinguishing_marks) return false;
  const rWords = normalizeWords(report.distinguishing_marks);
  const recSet = new Set(normalizeWords(record.distinguishing_marks));
  return rWords.some(w => recSet.has(w));
}

// ─── TAB: RESUMEN ────────────────────────────────────────────────────────────
function TabResumen({ stats, onGoTo }) {
  return (
    <div className="tab-section">
      {stats.pendingMatches > 0 && (
        <div className="alert-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Hay <strong>{stats.pendingMatches}</strong> coincidencias pendientes de revisión.</span>
          <button className="alert-banner__btn" onClick={() => onGoTo('busqueda')}>Revisar ahora →</button>
        </div>
      )}
      <div className="workflow-guide" style={{ marginTop: 'var(--space-lg)' }}>
        <p className="workflow-guide__title">Flujo del Sistema</p>
        <div className="pipeline-steps">
          <div className="pipeline-card">
            <div className="pipeline-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p className="pipeline-title">1. Ingreso de Datos</p>
            <p className="pipeline-desc">Forenses registran hallazgos y familiares reportan desaparecidos.</p>
          </div>
          <div className="pipeline-card">
            <div className="pipeline-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            </div>
            <p className="pipeline-title">2. Cruce Automático</p>
            <p className="pipeline-desc">El algoritmo compara perfiles y genera un % de similitud al instante.</p>
          </div>
          <div className="pipeline-card">
            <div className="pipeline-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <p className="pipeline-title">3. Revisión y Cierre</p>
            <p className="pipeline-desc">El perito valida el match positivo y el sistema notifica a la familia.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: BÚSQUEDA DE COINCIDENCIAS (MANUAL) ─────────────────────────────────
function TabBusqueda({ userId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [reviewingId, setReviewingId] = useState(null);
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({});
  // forensePhotos: { [matchId]: 'loading' | 'none' | string[] }
  const [forensePhotos, setForensePhotos] = useState({});
  // lightbox: { urls: string[], idx: number } | null
  const [lightbox, setLightbox] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(lb => lb && lb.idx < lb.urls.length - 1 ? { ...lb, idx: lb.idx + 1 } : lb);
      if (e.key === 'ArrowLeft')  setLightbox(lb => lb && lb.idx > 0 ? { ...lb, idx: lb.idx - 1 } : lb);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const fetchReportPhoto = useCallback(async (reportId, key) => {
    const { data } = await supabase
      .from('media')
      .select('storage_path')
      .eq('owner_table', 'missing_report')
      .eq('owner_id', reportId)
      .eq('kind', 'face')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.storage_path) {
      const { data: s } = await supabase.storage.from('evidence').createSignedUrl(data.storage_path, 3600);
      if (s?.signedUrl) setPhotoUrls(p => ({ ...p, [key]: s.signedUrl }));
    }
  }, []);

  const revealForensePhotos = async (matchId, recordId) => {
    setForensePhotos(prev => ({ ...prev, [matchId]: 'loading' }));
    const { data } = await supabase
      .from('media')
      .select('storage_path')
      .eq('owner_table', 'unidentified_record')
      .eq('owner_id', recordId)
      .eq('kind', 'evidence')
      .order('created_at', { ascending: true });

    if (!data || data.length === 0) {
      setForensePhotos(prev => ({ ...prev, [matchId]: 'none' }));
      return;
    }
    const urls = await Promise.all(
      data.map(async (item) => {
        const { data: s } = await supabase.storage.from('evidence').createSignedUrl(item.storage_path, 3600);
        return s?.signedUrl || null;
      })
    );
    setForensePhotos(prev => ({ ...prev, [matchId]: urls.filter(Boolean) }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setPhotoUrls({});
    setForensePhotos({});
    const { data } = await supabase
      .from('match_candidates')
      .select(`
        id, match_percentage, status, reviewer_notes, ai_notes, created_at,
        report:missing_reports!report_id (
          id, full_name, national_id, sex, approx_age_min, approx_age_max,
          distinguishing_marks, has_dental_records,
          contacts:report_contacts(contact_name, contact_email, contact_phone, relationship)
        ),
        record:unidentified_records!record_id (
          id, case_code, sex, approx_age_min, approx_age_max,
          distinguishing_marks, has_dental_chart, found_at, found_location
        )
      `)
      .eq('status', filter)
      .order('match_percentage', { ascending: false })
      .limit(50);

    setMatches(data || []);
    setLoading(false);

    for (const m of (data || [])) {
      if (m.report?.id) fetchReportPhoto(m.report.id, `${m.id}_r`);
    }
  }, [filter, fetchReportPhoto]);

  useEffect(() => { load(); }, [load]);

  const act = async (match, action) => {
    setActing(true);
    await supabase.from('match_candidates').update({
      status: action,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: notes.trim() || null,
    }).eq('id', match.id);

    if (action === 'confirmed') {
      await Promise.all([
        supabase.from('missing_reports').update({ status: 'matched' }).eq('id', match.report.id),
        supabase.from('unidentified_records').update({ status: 'tentative' }).eq('id', match.record.id),
      ]);
    }
    setReviewingId(null);
    setNotes('');
    setActing(false);
    load();
  };

  const FILTERS = [
    { key: 'pending',   label: 'Pendientes' },
    { key: 'confirmed', label: 'Confirmados' },
    { key: 'rejected',  label: 'Rechazados' },
  ];

  const handleAnalizar = async () => {
    setLoading(true);
    setAnalysisStatus('Calculando candidatos...');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error('Variables de entorno de Supabase no configuradas');

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-match`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey':         anonKey,
        },
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Error ${res.status}`);

      // La Edge Function ya guardó los candidatos y notificó a Make.
      // Make llama a la IA en segundo plano y actualiza ai_notes.
      const msg = result.candidates_found > 0
        ? `✅ ${result.candidates_found} candidatos analizados · ${result.ai_enhanced ?? 0} potenciados con IA`
        : 'Sin nuevos candidatos';
      setAnalysisStatus(msg);
      setTimeout(() => { setAnalysisStatus(null); load(); }, 4000);
    } catch (err) {
      console.error('Error en análisis:', err);
      setAnalysisStatus(`Error: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="tab-section">
      {/* ── Lightbox visor de fotos forenses ── */}
      {lightbox && (
        <MatchLightbox
          urls={lightbox.urls}
          idx={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="analysis-panel">
        <div className="analysis-panel__left">
          <svg className="analysis-panel__glyph" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <div className="analysis-panel__copy">
            <span className="analysis-panel__label">Cruce automático de datos</span>
            <h2 className="analysis-panel__title">Búsqueda de coincidencias</h2>
          </div>
        </div>
        <div className="analysis-panel__right">
          {analysisStatus && (
            <span className="analysis-status">{analysisStatus}</span>
          )}
          <button className="analysis-panel__btn" onClick={handleAnalizar} disabled={loading}>
            {loading ? (
              <><span className="spinner-sm" /><span>{analysisStatus || 'Procesando'}</span></>
            ) : (
              <>
                <span>Iniciar análisis IA</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="tab-toolbar">
        {FILTERS.map(f => (
          <button key={f.key}
            className={`filter-btn ${filter === f.key ? 'filter-btn--active' : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state"><span className="spinner-sm" /> Cargando...</div>
      ) : matches.length === 0 ? (
        <div className="empty-module">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>No hay candidatos {filter === 'pending' ? 'pendientes' : filter === 'confirmed' ? 'confirmados' : 'rechazados'}.</p>
        </div>
      ) : (
        <div className="match-list">
          {matches.map(m => (
            <div key={m.id} className="match-card">
              {/* Header */}
              <div className="match-card__header">
                <ScoreBadge pct={m.match_percentage} />
                <span className="match-card__meta">
                  Generado {new Date(m.created_at).toLocaleDateString('es-VE')}
                </span>
                {filter !== 'pending' && (
                  <span className={`status-pill status-pill--${filter}`}>
                    {filter === 'confirmed' ? '✓ Confirmado' : '✗ Rechazado'}
                  </span>
                )}
              </div>

              {/* Comparison */}
              <div className="match-body">
                {/* Left: missing report */}
                <div className="match-side">
                  <p className="match-side__tag">Desaparecido/a</p>
                  <div className="match-photo">
                    {photoUrls[`${m.id}_r`]
                      ? <img src={photoUrls[`${m.id}_r`]} alt="foto reporte" />
                      : <div className="match-photo__empty">Sin foto</div>}
                  </div>
                  <p className="match-name">{m.report?.full_name || <em>Sin nombre</em>}</p>
                  <p className="match-detail">CI: {m.report?.national_id || '—'}</p>
                  <p className="match-detail">{SEX_LABEL[m.report?.sex]} · {m.report?.approx_age_min ?? '?'} años</p>
                  {m.report?.distinguishing_marks && <p className="match-marks">{m.report.distinguishing_marks}</p>}
                  {m.report?.has_dental_records && <span className="dental-tag">🦷 Dental</span>}
                </div>

                {/* Center: indicators */}
                <div className="match-center">
                  <div className="match-indicators">
                    {/* Sexo */}
                    {(() => {
                      const rSex   = m.report?.sex;
                      const recSex = m.record?.sex;
                      const known  = rSex !== 'unknown' && recSex !== 'unknown';
                      const ok     = !known || rSex === recSex;
                      return (
                        <span className={ok ? 'ind ind--ok' : 'ind ind--no'}>
                          {ok ? '✓' : '✗'} Sexo
                        </span>
                      );
                    })()}

                    {/* Edad */}
                    {(() => {
                      const overlap = ageOverlapsUI(m.report, m.record);
                      if (overlap === null) return (
                        <span className="ind ind--na">— Edad</span>
                      );
                      return (
                        <span className={overlap ? 'ind ind--ok' : 'ind ind--no'}>
                          {overlap ? '✓' : '✗'} Edad
                        </span>
                      );
                    })()}

                    {/* Dental */}
                    {(m.report?.has_dental_records || m.record?.has_dental_chart) && (
                      <span className={
                        m.report?.has_dental_records && m.record?.has_dental_chart
                          ? 'ind ind--ok' : 'ind ind--no'
                      }>
                        {m.report?.has_dental_records && m.record?.has_dental_chart ? '✓' : '✗'} Dental
                      </span>
                    )}

                    {/* Marcas */}
                    {(m.report?.distinguishing_marks || m.record?.distinguishing_marks) && (
                      <span className={marksOverlapUI(m.report, m.record) ? 'ind ind--ok' : 'ind ind--no'}>
                        {marksOverlapUI(m.report, m.record) ? '✓' : '✗'} Marcas
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: forensic record */}
                <div className="match-side">
                  <p className="match-side__tag">Registro Forense</p>
                  {/* Fotos forenses: ocultas por defecto, contenido potencialmente sensible */}
                  {forensePhotos[m.id] === 'loading' ? (
                    <div className="match-photo"><div className="match-photo__empty"><span className="spinner-sm" /></div></div>
                  ) : forensePhotos[m.id] === 'none' ? (
                    <div className="match-photo"><div className="match-photo__empty">Sin foto</div></div>
                  ) : Array.isArray(forensePhotos[m.id]) ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button
                        type="button"
                        onClick={() => setForensePhotos(prev => ({ ...prev, [m.id]: undefined }))}
                        style={{
                          position: 'absolute', top: '-8px', right: '-8px', width: '22px', height: '22px',
                          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-primary)',
                          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', zIndex: 5, color: 'var(--color-text-secondary)', fontSize: '10px'
                        }}
                        title="Ocultar fotos"
                      >
                        ✕
                      </button>
                      <div className="match-forense-photos">
                        {forensePhotos[m.id].map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`foto forense ${i + 1}`}
                            className="match-forense-photo"
                            onClick={() => setLightbox({ urls: forensePhotos[m.id], idx: i })}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="match-photo">
                      <button
                        type="button"
                        className="match-photo__reveal"
                        onClick={() => revealForensePhotos(m.id, m.record.id)}
                        title="Las fotos pueden contener contenido sensible"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Ver fotos
                      </button>
                    </div>
                  )}
                  <p className="match-name">{m.record?.case_code}</p>
                  <p className="match-detail">{SEX_LABEL[m.record?.sex]} · {m.record?.approx_age_min ?? '?'}–{m.record?.approx_age_max ?? '?'} años</p>
                  <p className="match-detail">📍 {m.record?.found_location || 'Ubicación desconocida'}</p>
                  {m.record?.found_at && <p className="match-detail">📅 {new Date(m.record.found_at + 'T12:00:00').toLocaleDateString('es-VE')}</p>}
                  {m.record?.distinguishing_marks && <p className="match-marks">{m.record.distinguishing_marks}</p>}
                  {m.record?.has_dental_chart && <span className="dental-tag">🦷 Odontograma</span>}
                </div>
              </div>

              {/* Contacts */}
              {m.report?.contacts?.length > 0 && (
                <div className="match-contacts">
                  <span className="match-contacts__label">Contactos:</span>
                  {m.report.contacts.map((c, i) => (
                    <span key={i} className="contact-chip">
                      {c.relationship && <strong>{c.relationship}:</strong>} {c.contact_name}
                      {c.contact_email && <> · <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a></>}
                      {c.contact_phone && <> · <a href={`tel:${c.contact_phone}`}>{c.contact_phone}</a></>}
                    </span>
                  ))}
                </div>
              )}

              {/* AI analysis notes */}
              {m.ai_notes && (
                <div className="ai-notes">🤖 <strong>Análisis IA:</strong> {m.ai_notes}</div>
              )}

              {/* Reviewer notes */}
              {m.reviewer_notes && (
                <div className="reviewer-notes">📝 {m.reviewer_notes}</div>
              )}

              {/* Actions */}
              {filter === 'pending' && (
                <div className="match-actions">
                  {reviewingId === m.id ? (
                    <div className="review-panel">
                      <textarea
                        className="review-notes"
                        placeholder="Notas del revisor (opcional)..."
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                      />
                      <div className="review-btns">
                        <button className="btn-confirm" disabled={acting} onClick={() => act(m, 'confirmed')}>
                          ✓ Confirmar match
                        </button>
                        <button className="btn-reject" disabled={acting} onClick={() => act(m, 'rejected')}>
                          ✗ Rechazar
                        </button>
                        <button className="btn-cancel" onClick={() => { setReviewingId(null); setNotes(''); }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn-review" onClick={() => setReviewingId(m.id)}>
                      Revisar este candidato
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TAB: REPORTES ───────────────────────────────────────────────────────────
function TabReportes() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    supabase
      .from('missing_reports')
      .select(`id, full_name, national_id, sex, approx_age_min, status,
               has_dental_records, created_at,
               contacts:report_contacts(contact_name, contact_email, contact_phone, relationship)`)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => { setReports(data || []); setLoading(false); });
  }, []);

  const handleToggleStatus = async (reportId, currentStatus) => {
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';
    const { error } = await supabase.from('missing_reports').update({ status: newStatus }).eq('id', reportId);
    if (!error) {
      setReports(reports.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
    }
  };

  const STATUS = {
    open:      { label: 'Activo',    cls: 'open' },
    matched:   { label: 'Match',     cls: 'matched' },
    closed:    { label: 'Cerrado',   cls: 'closed' },
    withdrawn: { label: 'Retirado',  cls: 'closed' },
  };

  return (
    <div className="tab-section">
      {loading ? (
        <div className="loading-state"><span className="spinner-sm" /> Cargando...</div>
      ) : (
        <div className="reports-wrap">
          <p className="reports-count">{reports.length} reportes</p>
          <table className="reports-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula</th>
                <th>Sexo</th>
                <th>Edad</th>
                <th>Dental</th>
                <th>Estado</th>
                <th>Contactos</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <Fragment key={r.id}>
                  <tr
                    className={`report-row ${r.contacts?.length ? 'report-row--clickable' : ''}`}
                    onClick={() => r.contacts?.length && setExpanded(expanded === r.id ? null : r.id)}>
                    <td>{r.full_name || <em className="muted">Sin nombre</em>}</td>
                    <td className="mono">{r.national_id || '—'}</td>
                    <td>{SEX_LABEL[r.sex] || '—'}</td>
                    <td>{r.approx_age_min ?? '—'}</td>
                    <td>{r.has_dental_records ? '🦷' : '—'}</td>
                    <td>
                      <span 
                        className={`status-pill status-pill--${STATUS[r.status]?.cls}`}
                        title="Doble clic para cambiar estado (Activo/Inactivo)"
                        style={{ cursor: 'pointer' }}
                        onDoubleClick={(e) => {
                          e.stopPropagation(); // Evitar expandir fila
                          handleToggleStatus(r.id, r.status);
                        }}
                      >
                        {STATUS[r.status]?.label}
                      </span>
                    </td>
                    <td>{r.contacts?.length || 0}</td>
                    <td>{new Date(r.created_at).toLocaleDateString('es-VE')}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="contacts-expanded">
                      <td colSpan={8}>
                        <div className="contacts-expanded__inner">
                          {r.contacts.map((c, i) => (
                            <div key={i} className="contact-row">
                              <span className="contact-rel">{c.relationship || '—'}</span>
                              <span>{c.contact_name || '—'}</span>
                              {c.contact_email && <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>}
                              {c.contact_phone && <a href={`tel:${c.contact_phone}`}>{c.contact_phone}</a>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('resumen');
  const [stats, setStats] = useState({ openReports: 0, resolved: 0, pendingMatches: 0, unidentified: 0 });

  useEffect(() => {
    async function loadStats() {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('missing_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('missing_reports').select('id', { count: 'exact', head: true }).in('status', ['matched', 'closed']),
        supabase.from('match_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('unidentified_records').select('id', { count: 'exact', head: true }).eq('status', 'unidentified'),
      ]);
      setStats({
        openReports:    r1.count ?? 0,
        resolved:       r2.count ?? 0,
        pendingMatches: r3.count ?? 0,
        unidentified:   r4.count ?? 0,
      });
    }
    loadStats();
  }, [activeTab]);

  const TABS = [
    { key: 'resumen',      label: 'Panel' },
    { key: 'busqueda',     label: `Coincidencias${stats.pendingMatches > 0 ? ` (${stats.pendingMatches})` : ''}` },
    { key: 'forense',      label: 'Registrar hallazgo' },
    { key: 'trazabilidad', label: 'Trazabilidad' },
    { key: 'reportes',     label: 'Archivo' },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <span className="dashboard__title">
            SUBI <span className="dashboard__role-badge dashboard__role-badge--admin">Administrador</span>
          </span>
        </div>
        <div className="dashboard__actions">
          <button className="dashboard__theme-btn" onClick={toggleTheme} aria-label="Cambiar tema">
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>
          <button className="btn-logout" onClick={() => { logout(); navigate('/admin'); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Salir
          </button>
        </div>
      </header>

      <main className="dashboard__content">
        <div className="dash-topbar">
          <div>
            <h1 className="dash-title">Panel de control</h1>
            <p className="dash-sub">{user?.email}</p>
          </div>
        </div>

        <div className="stats-strip">
          {[
            { value: stats.openReports,    label: 'Reportes activos',    accent: 'blue' },
            { value: stats.resolved,       label: 'Casos resueltos',     accent: 'green' },
            { value: stats.pendingMatches, label: 'Matches pendientes',  accent: 'amber' },
            { value: stats.unidentified,   label: 'Sin identificar',     accent: 'purple' },
          ].map((s, i) => (
            <div key={i} className="stat-item">
              <span className={`stat-item__num stat-item__num--${s.accent}`}>{s.value}</span>
              <span className="stat-item__label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav">
          {TABS.map(t => (
            <button key={t.key}
              className={`tab-btn ${activeTab === t.key ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'resumen'       && <TabResumen stats={stats} onGoTo={setActiveTab} />}
        {activeTab === 'forense'       && <TabForense userId={user?.id} />}
        {activeTab === 'trazabilidad'  && <TabTrazabilidad userId={user?.id} />}
        {activeTab === 'busqueda'      && <TabBusqueda userId={user?.id} />}
        {activeTab === 'reportes'      && <TabReportes />}
      </main>
    </div>
  );
}
