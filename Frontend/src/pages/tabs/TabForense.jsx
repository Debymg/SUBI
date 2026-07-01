import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import DentalChart from '../../components/DentalChart';

const SEX_LABEL = { male: 'Masculino', female: 'Femenino', unknown: 'Desconocido' };

const STATUS_CFG = {
  unidentified: { label: 'Sin identificar', cls: 'open' },
  tentative:    { label: 'Tentativo',       cls: 'matched' },
  identified:   { label: 'Identificado',    cls: 'matched' },
  closed:       { label: 'Cerrado',         cls: 'closed' },
};

const EMPTY_FORM = {
  sex: 'unknown', approx_age_min: '', approx_age_max: '', height_cm: '',
  has_tattoos: false, tattoos_loc: '', tattoos_desc: '',
  has_scars: false,   scars_loc: '',   scars_desc: '',
  has_prosthesis: false, prosthesis_loc: '', prosthesis_desc: '',
  clothing: '', distinguishing_marks: '', found_location: '', found_at: '', notes: '',
};

function parseMarks(marks = '') {
  const tattoo    = marks.match(/Tatuaje en ([^:]+): ([^.]+)/);
  const scar      = marks.match(/Cicatriz en ([^:]+): ([^.]+)/);
  const prosthesis = marks.match(/Prótesis en ([^:]+): ([^.]+)/);
  let remaining = marks;
  if (tattoo)     remaining = remaining.replace(tattoo[0], '');
  if (scar)       remaining = remaining.replace(scar[0], '');
  if (prosthesis) remaining = remaining.replace(prosthesis[0], '');
  remaining = remaining.replace(/\.\s*/g, ' ').trim();
  const clean = (s) => (!s || s === 'sin descripción' || s === 'ubicación no especificada') ? '' : s.trim();
  return {
    has_tattoos:    !!tattoo,
    tattoos_loc:    clean(tattoo?.[1]),
    tattoos_desc:   clean(tattoo?.[2]),
    has_scars:      !!scar,
    scars_loc:      clean(scar?.[1]),
    scars_desc:     clean(scar?.[2]),
    has_prosthesis: !!prosthesis,
    prosthesis_loc:  clean(prosthesis?.[1]),
    prosthesis_desc: clean(prosthesis?.[2]),
    distinguishing_marks: remaining,
  };
}

// ── LIGHTBOX con navegación (Portal → evita problemas con transform/animation) ─
function Lightbox({ urls, idx: initialIdx, onClose }) {
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
      {urls.length > 1 && (
        <p className="lb-counter">{idx + 1} / {urls.length}</p>
      )}
    </div>,
    document.body
  );
}

// ── LISTA DE EXPEDIENTES ──────────────────────────────────────────────────────
function ForenseList({ onNew, onEdit }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('unidentified_records')
      .select('id, case_code, sex, approx_age_min, approx_age_max, found_location, found_at, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setRecords(data || []); setLoading(false); });
  }, []);

  return (
    <div className="tab-section">
      <div className="forense-list-header">
        <div>
          <h2 className="section-title">Expedientes forenses</h2>
          <p className="section-desc">Haga clic en un expediente para editarlo o agregar fotografías.</p>
        </div>
        <button className="btn-primary" onClick={onNew}>+ Nuevo registro</button>
      </div>

      {loading ? (
        <div className="loading-state"><span className="spinner-sm" /> Cargando...</div>
      ) : records.length === 0 ? (
        <div className="empty-module">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p>No hay expedientes registrados.</p>
          <button className="btn-primary" onClick={onNew} style={{ marginTop: 8 }}>Crear primer registro</button>
        </div>
      ) : (
        <div className="forense-list">
          {records.map(r => (
            <div key={r.id} className="forense-list-item" onClick={() => onEdit(r)}>
              <div className="forense-list-item__info">
                <span className="forense-list-item__code">{r.case_code}</span>
                <span className="forense-list-item__meta">
                  {SEX_LABEL[r.sex] || '—'} · {r.approx_age_min ?? '?'}–{r.approx_age_max ?? '?'} años
                </span>
                <span className="forense-list-item__meta">📍 {r.found_location || '—'}</span>
                {r.found_at && (
                  <span className="forense-list-item__meta">
                    📅 {new Date(r.found_at + 'T12:00:00').toLocaleDateString('es-VE')}
                  </span>
                )}
              </div>
              <div className="forense-list-item__right">
                <span className={`status-pill status-pill--${STATUS_CFG[r.status]?.cls || 'open'}`}>
                  {STATUS_CFG[r.status]?.label || r.status}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FORMULARIO (NUEVO / EDITAR) ───────────────────────────────────────────────
export default function TabForense({ userId }) {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('list'); // 'list' | 'new' | 'edit'
  const [editingRecord, setEditingRecord] = useState(null); // {id, case_code}

  const [form, setForm] = useState(EMPTY_FORM);
  const [dentalData, setDentalData] = useState({});

  // Fotos nuevas a subir
  const [newPhotos, setNewPhotos] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);

  // Fotos ya guardadas en DB
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [photosLoaded, setPhotosLoaded] = useState(false);

  // Lightbox: { urls: string[], idx: number } | null
  const [lightbox, setLightbox] = useState(null);

  const [saving, setSaving] = useState(false);
  const [savedCode, setSavedCode] = useState(null);
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Cargar fotos existentes de un expediente ──
  const loadExistingPhotos = useCallback(async (recordId) => {
    setLoadingPhotos(true);
    const { data } = await supabase
      .from('media')
      .select('id, storage_path, kind, created_at')
      .eq('owner_table', 'unidentified_record')
      .eq('owner_id', recordId)
      .order('created_at', { ascending: true });

    if (!data?.length) { setExistingPhotos([]); setLoadingPhotos(false); return; }

    const withUrls = await Promise.all(data.map(async (m) => {
      const { data: s } = await supabase.storage.from('evidence').createSignedUrl(m.storage_path, 3600);
      return { ...m, signedUrl: s?.signedUrl || null };
    }));
    setExistingPhotos(withUrls.filter(p => p.signedUrl));
    setLoadingPhotos(false);
  }, []);

  // ── Abrir edición de un expediente ──
  const openEdit = async (record) => {
    const { data } = await supabase
      .from('unidentified_records')
      .select('*')
      .eq('id', record.id)
      .single();
    if (!data) return;

    const parsed = parseMarks(data.distinguishing_marks || '');
    setForm({
      sex: data.sex || 'unknown',
      approx_age_min: data.approx_age_min ?? '',
      approx_age_max: data.approx_age_max ?? '',
      height_cm: data.height_cm ?? '',
      ...parsed,
      clothing: data.clothing || '',
      found_location: data.found_location || '',
      found_at: data.found_at || '',
      notes: data.notes || '',
    });
    setDentalData(data.dental_chart || {});
    setNewPhotos([]);
    setNewPreviews([]);
    setSavedCode(null);
    setErrors({});
    setEditingRecord({ id: data.id, case_code: data.case_code });
    setExistingPhotos([]);
    setShowPhotos(false);
    setPhotosLoaded(false);
    setMode('edit');
  };

  // ── Modo nuevo ──
  const openNew = () => {
    setForm(EMPTY_FORM);
    setDentalData({});
    setNewPhotos([]);
    setNewPreviews([]);
    setExistingPhotos([]);
    setShowPhotos(false);
    setPhotosLoaded(false);
    setSavedCode(null);
    setErrors({});
    setEditingRecord(null);
    setMode('new');
  };

  // ── Ver fotografías (carga perezosa, solo cuando el usuario lo pide) ──
  const handleShowPhotos = async () => {
    if (!photosLoaded) {
      await loadExistingPhotos(editingRecord.id);
      setPhotosLoaded(true);
    }
    setShowPhotos(true);
  };

  // ── Manejo de fotos nuevas ──
  const handleNewPhotos = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        setErrors(p => ({ ...p, photos: 'Máximo 5 MB por foto' }));
        return;
      }
    }
    setErrors(p => ({ ...p, photos: '' }));
    setNewPhotos(p => [...p, ...files]);
    files.forEach(f => {
      const r = new FileReader();
      r.onloadend = () => setNewPreviews(p => [...p, r.result]);
      r.readAsDataURL(f);
    });
  };

  const removeNewPhoto = (i) => {
    setNewPhotos(p => p.filter((_, idx) => idx !== i));
    setNewPreviews(p => p.filter((_, idx) => idx !== i));
  };

  // ── Construir el objeto de marks ──
  const buildMarks = () => {
    const parts = [];
    if (form.has_tattoos)
      parts.push(`Tatuaje en ${form.tattoos_loc.trim() || 'ubicación no especificada'}: ${form.tattoos_desc.trim() || 'sin descripción'}`);
    if (form.has_scars)
      parts.push(`Cicatriz en ${form.scars_loc.trim() || 'ubicación no especificada'}: ${form.scars_desc.trim() || 'sin descripción'}`);
    if (form.has_prosthesis)
      parts.push(`Prótesis en ${form.prosthesis_loc.trim() || 'ubicación no especificada'}: ${form.prosthesis_desc.trim() || 'sin descripción'}`);
    if (form.distinguishing_marks.trim()) parts.push(form.distinguishing_marks.trim());
    return parts.length ? parts.join('. ') : null;
  };

  // ── Subir fotos nuevas ──
  const uploadPhotos = async (recordId, caseCode) => {
    for (let i = 0; i < newPhotos.length; i++) {
      const file = newPhotos[i];
      const ext = file.name.split('.').pop();
      const path = `forensic/${Date.now()}_${caseCode}_ev${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evidence').upload(path, file);
      if (!upErr) {
        await supabase.from('media').insert({
          owner_table: 'unidentified_record', owner_id: recordId,
          storage_path: path, kind: 'evidence',
        });
      }
    }
  };

  // ── Guardar (nuevo o edición) ──
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
      const payload = {
        sex: form.sex,
        approx_age_min: form.approx_age_min ? parseInt(form.approx_age_min) : null,
        approx_age_max: form.approx_age_max ? parseInt(form.approx_age_max) : null,
        height_cm: form.height_cm ? parseInt(form.height_cm) : null,
        distinguishing_marks: buildMarks(),
        clothing: form.clothing.trim() || null,
        found_location: form.found_location.trim(),
        found_at: form.found_at || null,
        notes: form.notes.trim() || null,
        dental_chart: hasDental ? dentalData : null,
        has_dental_chart: hasDental,
      };

      if (mode === 'edit' && editingRecord) {
        // UPDATE
        const { error } = await supabase
          .from('unidentified_records')
          .update(payload)
          .eq('id', editingRecord.id);
        if (error) throw error;
        await uploadPhotos(editingRecord.id, editingRecord.case_code);
        await supabase.rpc('rebuild_candidates_for_record', { p_record_id: editingRecord.id });
        await loadExistingPhotos(editingRecord.id);
        setNewPhotos([]);
        setNewPreviews([]);
        if (fileRef.current) fileRef.current.value = '';
        setSavedCode(editingRecord.case_code);
      } else {
        // INSERT
        const { data: rec, error } = await supabase
          .from('unidentified_records')
          .insert({ created_by: userId, ...payload })
          .select('id, case_code')
          .single();
        if (error) throw error;
        await uploadPhotos(rec.id, rec.case_code);
        await supabase.rpc('rebuild_candidates_for_record', { p_record_id: rec.id });
        setSavedCode(rec.case_code);
        setForm(EMPTY_FORM);
        setDentalData({});
        setNewPhotos([]);
        setNewPreviews([]);
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch (err) {
      setErrors({ general: err.message });
    }
    setSaving(false);
  };

  // ── MODO LISTA ──
  if (mode === 'list') {
    return <ForenseList onNew={openNew} onEdit={openEdit} />;
  }

  // ── MODO FORMULARIO (nuevo / edición) ──
  const isEdit = mode === 'edit';

  return (
    <div className="tab-section">
      {lightbox && (
        <Lightbox urls={lightbox.urls} idx={lightbox.idx} onClose={() => setLightbox(null)} />
      )}

      <div className="forense-form-wrap">
      {/* Encabezado con botón volver */}
      <div className="forense-form-header">
        <button className="btn-back" onClick={() => setMode('list')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Volver a expedientes
        </button>
        <div>
          <h2 className="section-title">
            {isEdit ? `Editando expediente — ${editingRecord?.case_code}` : 'Nuevo registro forense'}
          </h2>
          <p className="section-desc">
            {isEdit
              ? 'Actualice los datos o agregue nuevas fotografías al expediente.'
              : 'Complete los datos disponibles. El sistema cruzará automáticamente con los reportes activos.'}
          </p>
        </div>
      </div>

      {savedCode && (
        <div className="success-banner">
          ✓ {isEdit ? 'Expediente actualizado:' : 'Expediente guardado:'} <strong>{savedCode}</strong>
        </div>
      )}
      {errors.general && <div className="error-banner">{errors.general}</div>}

      {/* ── Fotos existentes (solo en edición, ocultas por defecto) ── */}
      {isEdit && (
        <div className="existing-photos">
          <p className="existing-photos__title">Fotografías del expediente</p>

          {!showPhotos ? (
            <div className="photos-warning">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p className="photos-warning__text">
                  Las fotografías de este expediente pueden contener imágenes de carácter sensible. Solo visualícelas si es necesario para la evaluación del caso.
                </p>
                <button type="button" className="btn-secondary" onClick={handleShowPhotos} disabled={loadingPhotos}>
                  {loadingPhotos
                    ? <><span className="spinner-sm" /> Cargando...</>
                    : 'Ver fotografías del expediente'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {existingPhotos.length === 0 ? (
                <p className="existing-photos__empty">No hay fotografías registradas en este expediente.</p>
              ) : (
                <div className="existing-photos__grid">
                  {existingPhotos.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      className="existing-photo"
                      onClick={() => setLightbox({ urls: existingPhotos.map(x => x.signedUrl), idx: i })}
                      title="Clic para ver en grande"
                    >
                      <img src={p.signedUrl} alt="foto del expediente" />
                      <span className="existing-photo__zoom">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="btn-back" style={{ marginTop: 12 }} onClick={() => setShowPhotos(false)}>
                Ocultar fotografías
              </button>
            </>
          )}
        </div>
      )}

      <form className="forense-form" onSubmit={handleSubmit} noValidate>
        {/* ── Descripción ── */}
        <div className="form-row-3">
          <div className="fgroup">
            <label>Sexo estimado</label>
            <select value={form.sex} onChange={e => set('sex', e.target.value)}>
              <option value="unknown">Desconocido</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </div>
          <div className="fgroup">
            <label>Edad mín.</label>
            <input type="number" min="0" max="120" placeholder="—"
              value={form.approx_age_min} onChange={e => set('approx_age_min', e.target.value)} />
          </div>
          <div className="fgroup">
            <label>Edad máx.</label>
            <input type="number" min="0" max="120" placeholder="—"
              value={form.approx_age_max} onChange={e => set('approx_age_max', e.target.value)} />
          </div>
        </div>

        <div className="form-row-2">
          <div className="fgroup">
            <label>Estatura estimada (cm)</label>
            <input type="number" min="30" max="250" placeholder="—"
              value={form.height_cm} onChange={e => set('height_cm', e.target.value)} />
          </div>
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

        {/* ── Rasgos Distintivos ── */}
        <div className="form-fieldset-inline">
          <label className="form-fieldset-inline__title">Rasgos distintivos</label>

          {[
            { key: 'tattoos', label: 'Tatuajes', has: 'has_tattoos', loc: 'tattoos_loc', desc: 'tattoos_desc' },
            { key: 'scars',   label: 'Cicatrices', has: 'has_scars', loc: 'scars_loc',   desc: 'scars_desc'   },
            { key: 'prosth',  label: 'Prótesis',   has: 'has_prosthesis', loc: 'prosthesis_loc', desc: 'prosthesis_desc' },
          ].map(({ key, label, has, loc, desc }) => (
            <div key={key} className="toggle-row" style={{ flexWrap: 'wrap' }}>
              <span className="toggle-row__label">{label}</span>
              <div className="toggle-group">
                <button type="button"
                  className={'toggle-opt' + (!form[has] ? ' toggle-opt--active' : '')}
                  onClick={() => { set(has, false); set(loc, ''); set(desc, ''); }}>No</button>
                <button type="button"
                  className={'toggle-opt' + (form[has] ? ' toggle-opt--active' : '')}
                  onClick={() => set(has, true)}>Sí</button>
              </div>
              {form[has] && (
                <div className="trait-inputs">
                  <input type="text" placeholder="Ubicación" style={{ flex: 1, minWidth: 80 }}
                    value={form[loc]} onChange={e => set(loc, e.target.value)} />
                  <input type="text" placeholder="Descripción" style={{ flex: 2, minWidth: 120 }}
                    value={form[desc]} onChange={e => set(desc, e.target.value)} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Vestimenta ── */}
        <div className="fgroup">
          <label>Vestimenta</label>
          <textarea rows={2} placeholder="Descripción breve de la ropa: color, tipo, estado..."
            value={form.clothing} onChange={e => set('clothing', e.target.value)} />
        </div>

        <div className="fgroup">
          <label>Señas / descripción física adicional</label>
          <textarea rows={2} placeholder="Complexión, color de cabello, otros rasgos..."
            value={form.distinguishing_marks} onChange={e => set('distinguishing_marks', e.target.value)} />
        </div>

        {/* ── Agregar fotografías ── */}
        <div className="fgroup">
          <label>{isEdit ? 'Agregar nuevas fotografías' : 'Fotografías del caso'}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
            {newPreviews.map((src, i) => (
              <div key={i} className="photo-preview-sm" style={{ position: 'relative' }}>
                <img src={src} alt="nueva foto"
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                <button type="button" className="photo-remove-sm" onClick={() => removeNewPhoto(i)}>✕</button>
              </div>
            ))}
            <label className="file-upload-label file-upload-label--compact"
              style={{ width: 'auto', padding: '12px 16px', flexDirection: 'column' }}>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleNewPhotos} />
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 4 }}>
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              {newPreviews.length > 0 ? 'Añadir más' : 'Subir fotos'}
            </label>
          </div>
          {errors.photos && <span className="field-error">{errors.photos}</span>}
        </div>

        {/* ── Odontograma ── */}
        <div className="fgroup">
          <label>Odontograma <span className="optional-tag">(mejora la identificación)</span></label>
          <DentalChart value={dentalData} onChange={setDentalData} />
        </div>

        <div className="fgroup">
          <label>Notas internas del perito</label>
          <textarea rows={2} placeholder="Observaciones, condiciones del hallazgo..."
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving
              ? <><span className="spinner-sm" /> Guardando...</>
              : isEdit ? 'Actualizar expediente' : 'Guardar registro forense'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setMode('list')}>
            Cancelar
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
