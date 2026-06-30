import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import DentalChart from '../components/DentalChart';
import './DashboardPage.css';

const SEX_LABEL = { male: 'Masculino', female: 'Femenino', unknown: 'Desconocido' };

function ScoreBadge({ pct }) {
  const color = pct >= 70 ? 'green' : pct >= 40 ? 'amber' : 'red';
  return <span className={`score-badge score-badge--${color}`}>{pct}%</span>;
}

// ─── TAB: RESUMEN ────────────────────────────────────────────────────────────
function TabResumen({ stats, onGoTo }) {
  return (
    <div className="tab-section">
      {stats.pendingMatches > 0 && (
        <div className="alert-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Hay <strong>{stats.pendingMatches}</strong> candidatos pendientes de revisión.</span>
          <button className="alert-banner__btn" onClick={() => onGoTo('candidatos')}>Revisar ahora →</button>
        </div>
      )}
      <div className="empty-module">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <p>Usa las pestañas para gestionar el sistema.</p>
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

  const fetchPhoto = useCallback(async (ownerTable, ownerId, key) => {
    const { data } = await supabase
      .from('media')
      .select('storage_path')
      .eq('owner_table', ownerTable)
      .eq('owner_id', ownerId)
      .eq('kind', 'face')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.storage_path) {
      const { data: s } = await supabase.storage.from('evidence').createSignedUrl(data.storage_path, 3600);
      if (s?.signedUrl) setPhotoUrls(p => ({ ...p, [key]: s.signedUrl }));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setPhotoUrls({});
    const { data } = await supabase
      .from('match_candidates')
      .select(`
        id, match_percentage, status, reviewer_notes, created_at,
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
      if (m.report?.id)  fetchPhoto('missing_report', m.report.id, `${m.id}_r`);
      if (m.record?.id) fetchPhoto('unidentified_record', m.record.id, `${m.id}_u`);
    }
  }, [filter, fetchPhoto]);

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
    // Simular un escaneo por ahora, luego se conectará a la BD
    setTimeout(() => {
      load();
    }, 1500);
  };

  return (
    <div className="tab-section">
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
        <button className="analysis-panel__btn" onClick={handleAnalizar} disabled={loading}>
          {loading ? (
            <><span className="spinner-sm" /><span>Procesando</span></>
          ) : (
            <>
              <span>Iniciar análisis</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </>
          )}
        </button>
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
                    <span className={m.report?.sex === m.record?.sex ? 'ind ind--ok' : 'ind ind--no'}>
                      {m.report?.sex === m.record?.sex ? '✓' : '✗'} Sexo
                    </span>
                    <span className="ind ind--ok">✓ Edad</span>
                    {m.report?.has_dental_records && m.record?.has_dental_chart && (
                      <span className="ind ind--ok">✓ Dental</span>
                    )}
                  </div>
                </div>

                {/* Right: forensic record */}
                <div className="match-side">
                  <p className="match-side__tag">Registro Forense</p>
                  <div className="match-photo">
                    {photoUrls[`${m.id}_u`]
                      ? <img src={photoUrls[`${m.id}_u`]} alt="foto forense" />
                      : <div className="match-photo__empty">Sin foto</div>}
                  </div>
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

// ─── TAB: REGISTRO FORENSE ───────────────────────────────────────────────────
function TabForense({ userId }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    sex: 'unknown', approx_age_min: '', approx_age_max: '',
    distinguishing_marks: '', found_location: '', found_at: '', notes: '',
  });
  const [dentalData, setDentalData] = useState({});
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedCode, setSavedCode] = useState(null);
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handlePhoto = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErrors(p => ({ ...p, photo: 'Máximo 5 MB' })); return; }
    setPhoto(f);
    const r = new FileReader();
    r.onloadend = () => setPhotoPreview(r.result);
    r.readAsDataURL(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.found_location.trim()) errs.found_location = 'Ingrese la ubicación';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setSavedCode(null);
    try {
      const hasDental = Object.keys(dentalData).length > 0;
      const { data: rec, error } = await supabase
        .from('unidentified_records')
        .insert({
          created_by: userId,
          sex: form.sex,
          approx_age_min: form.approx_age_min ? parseInt(form.approx_age_min) : null,
          approx_age_max: form.approx_age_max ? parseInt(form.approx_age_max) : null,
          distinguishing_marks: form.distinguishing_marks.trim() || null,
          found_location: form.found_location.trim(),
          found_at: form.found_at || null,
          notes: form.notes.trim() || null,
          dental_chart: hasDental ? dentalData : null,
          has_dental_chart: hasDental,
        })
        .select('id, case_code')
        .single();
      if (error) throw error;

      if (photo) {
        const ext = photo.name.split('.').pop();
        const path = `forensic/${Date.now()}_${rec.case_code}.${ext}`;
        const { error: upErr } = await supabase.storage.from('evidence').upload(path, photo);
        if (!upErr) {
          await supabase.from('media').insert({
            owner_table: 'unidentified_record', owner_id: rec.id,
            storage_path: path, kind: 'face',
          });
        }
      }

      // await supabase.rpc('rebuild_candidates_for_record', { p_record_id: rec.id }); // Desactivado para estructura manual

      setSavedCode(rec.case_code);
      setForm({ sex: 'unknown', approx_age_min: '', approx_age_max: '', distinguishing_marks: '', found_location: '', found_at: '', notes: '' });
      setDentalData({});
      setPhoto(null); setPhotoPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setErrors({ general: err.message });
    }
    setSaving(false);
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h2 className="section-title">Registrar hallazgo</h2>
        <p className="section-desc">Complete los datos disponibles. El sistema cruzará automáticamente con todos los reportes activos.</p>
      </div>

      {savedCode && (
        <div className="success-banner">
          ✓ Registro guardado en archivo: <strong>{savedCode}</strong>.
        </div>
      )}
      {errors.general && <div className="error-banner">{errors.general}</div>}

      <form className="forense-form" onSubmit={handleSubmit} noValidate>
        <div className="form-row-3">
          <div className="fgroup">
            <label>Sexo</label>
            <select value={form.sex} onChange={e => set('sex', e.target.value)}>
              <option value="unknown">Desconocido</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </div>
          <div className="fgroup">
            <label>Edad estimada mín.</label>
            <input type="number" min="0" max="120" placeholder="—"
              value={form.approx_age_min} onChange={e => set('approx_age_min', e.target.value)} />
          </div>
          <div className="fgroup">
            <label>Edad estimada máx.</label>
            <input type="number" min="0" max="120" placeholder="—"
              value={form.approx_age_max} onChange={e => set('approx_age_max', e.target.value)} />
          </div>
        </div>

        <div className="form-row-2">
          <div className="fgroup fgroup--grow">
            <label>Lugar del hallazgo <span className="req">*</span></label>
            <input type="text" placeholder="Ej: Sector El Silencio, Caracas"
              value={form.found_location}
              className={errors.found_location ? 'input--error' : ''}
              onChange={e => { set('found_location', e.target.value); setErrors(p => ({ ...p, found_location: '' })); }} />
            {errors.found_location && <span className="field-error">{errors.found_location}</span>}
          </div>
          <div className="fgroup">
            <label>Fecha del hallazgo</label>
            <input type="date" value={form.found_at} onChange={e => set('found_at', e.target.value)} />
          </div>
        </div>

        <div className="fgroup">
          <label>Señas / descripción física</label>
          <textarea rows={3} placeholder="Ropa, tatuajes, cicatrices, complexión, color de cabello..."
            value={form.distinguishing_marks} onChange={e => set('distinguishing_marks', e.target.value)} />
        </div>

        <div className="fgroup">
          <label>Fotografía</label>
          {errors.photo && <span className="field-error">{errors.photo}</span>}
          {photoPreview ? (
            <div className="photo-preview-sm">
              <img src={photoPreview} alt="preview" />
              <button type="button" className="photo-remove-sm" onClick={() => { setPhoto(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>✕</button>
            </div>
          ) : (
            <label className="file-upload-label">
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Clic para subir foto
            </label>
          )}
        </div>

        <div className="fgroup">
          <label>Odontograma <span className="optional-tag">(mejora la identificación)</span></label>
          <DentalChart value={dentalData} onChange={setDentalData} />
        </div>

        <div className="fgroup">
          <label>Notas internas del perito</label>
          <textarea rows={2} placeholder="Observaciones, condiciones del hallazgo..."
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <><span className="spinner-sm" /> Guardando...</> : 'Guardar Registro Forense'}
        </button>
      </form>
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
    { key: 'resumen',    label: 'Resumen' },
    { key: 'forense',    label: 'Registro Forense' },
    { key: 'busqueda',   label: `Búsqueda de Coincidencias${stats.pendingMatches > 0 ? ` (${stats.pendingMatches})` : ''}` },
    { key: 'reportes',   label: 'Archivo' },
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
        {activeTab === 'resumen'    && <TabResumen stats={stats} onGoTo={setActiveTab} />}
        {activeTab === 'forense'    && <TabForense userId={user?.id} />}
        {activeTab === 'busqueda'   && <TabBusqueda userId={user?.id} />}
        {activeTab === 'reportes'   && <TabReportes />}
      </main>
    </div>
  );
}
