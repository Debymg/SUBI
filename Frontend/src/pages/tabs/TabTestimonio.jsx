import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const SEX_LABEL = { male: 'Masculino', female: 'Femenino', unknown: 'Desconocido' };

export default function TabTestimonio({ userId, initialCode, onCodeUsed }) {
  const [caseCode, setCaseCode] = useState('');
  const [record, setRecord] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [testimonies, setTestimonies] = useState([]);
  const [form, setForm] = useState({
    informant_name: '',
    relationship: '',
    phone: '',
    comment: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [recentRecords, setRecentRecords] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadTestimonies = async (recordId) => {
    const { data } = await supabase
      .from('testimonies')
      .select('id, informant_name, relationship, phone, comment, created_at')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });
    setTestimonies(data || []);
  };

  const doSearch = async (code) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) { setSearchError('Ingrese un código de expediente'); return; }
    setSearching(true);
    setSearchError('');
    setRecord(null);
    setTestimonies([]);
    setSaved(false);
    setShowRecent(false);

    const { data, error } = await supabase
      .from('unidentified_records')
      .select('id, case_code, sex, approx_age_min, approx_age_max, found_location, found_at, status')
      .eq('case_code', normalized)
      .maybeSingle();

    if (error || !data) {
      setSearchError('No se encontró ningún expediente con ese código.');
    } else {
      setRecord(data);
      await loadTestimonies(data.id);
    }
    setSearching(false);
  };

  const searchRecord = () => doSearch(caseCode);

  // Auto-seleccionar cuando se llega desde Registro Forense
  useEffect(() => {
    if (!initialCode) return;
    setCaseCode(initialCode);
    doSearch(initialCode);
    onCodeUsed?.();
  }, [initialCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecentRecords = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('unidentified_records')
      .select('id, case_code, sex, approx_age_min, approx_age_max, found_location, found_at, status')
      .order('created_at', { ascending: false })
      .limit(15);
    setRecentRecords(data || []);
    setShowRecent(true);
    setLoadingRecent(false);
  };

  const selectRecentRecord = (rec) => {
    setRecord(rec);
    setCaseCode(rec.case_code);
    setShowRecent(false);
    setSearchError('');
    setSaved(false);
    loadTestimonies(rec.id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.informant_name.trim()) errs.informant_name = 'Ingrese el nombre';
    if (!form.comment.trim()) errs.comment = 'El comentario es obligatorio';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from('testimonies').insert({
      record_id: record.id,
      informant_name: form.informant_name.trim(),
      relationship: form.relationship || null,
      phone: form.phone.trim() || null,
      comment: form.comment.trim(),
      created_by: userId,
    });

    if (error) {
      setErrors({ general: error.message });
    } else {
      setSaved(true);
      setForm({ informant_name: '', relationship: '', phone: '', comment: '' });
      await loadTestimonies(record.id);
    }
    setSaving(false);
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h2 className="section-title">Registrar testimonio</h2>
        <p className="section-desc">Vincule un testimonio a un expediente forense. El comentario libre suele ser la información más valiosa.</p>
      </div>

      {/* Barra de búsqueda */}
      <div className="code-search">
        <div className="code-search__field">
          <input
            type="text"
            placeholder="Código de expediente"
            value={caseCode}
            onChange={e => { setCaseCode(e.target.value); setSearchError(''); }}
            onKeyDown={e => e.key === 'Enter' && searchRecord()}
          />
          <button className="code-search__btn" onClick={searchRecord} disabled={searching}>
            {searching ? <span className="spinner-sm" /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            )}
          </button>
        </div>
        {searchError && <span className="field-error">{searchError}</span>}
      </div>

      {/* Expediente encontrado */}
      {record && (
        <>
          <div className="record-info-card">
            <div className="record-info-card__header">
              <span className="record-info-card__code">{record.case_code}</span>
              <span className={'status-pill status-pill--' + (record.status === 'unidentified' ? 'open' : record.status)}>
                {record.status === 'unidentified' ? 'Sin identificar' : record.status}
              </span>
            </div>
            <div className="record-info-card__body">
              <span>{SEX_LABEL[record.sex] || '—'}</span>
              <span>Edad: {record.approx_age_min ?? '?'}–{record.approx_age_max ?? '?'}</span>
              <span>📍 {record.found_location || '—'}</span>
              {record.found_at && <span>📅 {new Date(record.found_at + 'T12:00:00').toLocaleDateString('es-VE')}</span>}
            </div>
          </div>

          {saved && <div className="success-banner">✓ Testimonio guardado correctamente.</div>}
          {errors.general && <div className="error-banner">{errors.general}</div>}

          <form className="forense-form" onSubmit={handleSubmit} noValidate>
            <div className="form-row-3">
              <div className="fgroup" style={{ flex: 2 }}>
                <label>Nombre del informante <span className="req">*</span></label>
                <input type="text" placeholder="Nombre completo"
                  value={form.informant_name}
                  className={errors.informant_name ? 'input--error' : ''}
                  onChange={e => { set('informant_name', e.target.value); setErrors(p => ({ ...p, informant_name: '' })); }} />
                {errors.informant_name && <span className="field-error">{errors.informant_name}</span>}
              </div>
              <div className="fgroup">
                <label>Relación</label>
                <select value={form.relationship} onChange={e => set('relationship', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  <option value="Familiar">Familiar</option>
                  <option value="Vecino">Vecino</option>
                  <option value="Testigo">Testigo</option>
                  <option value="Rescatista">Rescatista</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="fgroup" style={{ maxWidth: 300 }}>
              <label>Teléfono</label>
              <input type="tel" placeholder="+58 412 000 0000"
                value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="fgroup">
              <label>Comentario <span className="req">*</span></label>
              <textarea rows={5} placeholder="Escriba aquí todo lo que el informante pueda aportar: qué vio, cuándo, dónde, cualquier detalle relevante..."
                value={form.comment}
                className={errors.comment ? 'input--error' : ''}
                onChange={e => { set('comment', e.target.value); setErrors(p => ({ ...p, comment: '' })); }} />
              {errors.comment && <span className="field-error">{errors.comment}</span>}
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><span className="spinner-sm" /> Guardando...</> : 'Guardar testimonio'}
            </button>
          </form>

          {testimonies.length > 0 && (
            <div className="testimonies-list">
              <h3 className="testimonies-list__title">Testimonios registrados ({testimonies.length})</h3>
              {testimonies.map(t => (
                <div key={t.id} className="testimony-card">
                  <div className="testimony-card__header">
                    <strong>{t.informant_name}</strong>
                    {t.relationship && <span className="testimony-card__rel">{t.relationship}</span>}
                    {t.phone && <span className="testimony-card__phone">📞 {t.phone}</span>}
                    <span className="testimony-card__date">
                      {new Date(t.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="testimony-card__comment">{t.comment}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Estado vacío: guía de pasos */}
      {!record && !searching && (
        <div className="workflow-guide">
          <p className="workflow-guide__title">¿Cómo agregar un testimonio?</p>
          <div className="workflow-steps">
            <div className="workflow-step">
              <span className="workflow-step__num">1</span>
              <div>
                <p className="workflow-step__title">Registre el hallazgo forense</p>
                <p className="workflow-step__desc">Si el expediente aún no existe, vaya a la pestaña <strong>Registro Forense</strong> e ingrese los datos del hallazgo. El sistema generará un código automáticamente.</p>
              </div>
            </div>
            <div className="workflow-step">
              <span className="workflow-step__num">2</span>
              <div>
                <p className="workflow-step__title">Seleccione el expediente</p>
                <p className="workflow-step__desc">Escriba el código de expediente en el campo de arriba, o use el botón de abajo para ver los expedientes registrados recientemente.</p>
              </div>
            </div>
            <div className="workflow-step">
              <span className="workflow-step__num">3</span>
              <div>
                <p className="workflow-step__title">Complete el testimonio</p>
                <p className="workflow-step__desc">Ingrese el nombre del informante y su relato. El comentario libre suele ser la información más valiosa para la identificación.</p>
              </div>
            </div>
          </div>

          <button className="btn-secondary" onClick={loadRecentRecords} disabled={loadingRecent}>
            {loadingRecent
              ? <><span className="spinner-sm" /> Cargando...</>
              : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Ver expedientes recientes
                </>
            }
          </button>

          {showRecent && recentRecords.length === 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-md)' }}>
              No hay expedientes forenses registrados aún.
            </p>
          )}

          {showRecent && recentRecords.length > 0 && (
            <div className="recent-records">
              <p className="recent-records__title">Expedientes recientes — haga clic para seleccionar</p>
              {recentRecords.map(r => (
                <div key={r.id} className="recent-record-item" onClick={() => selectRecentRecord(r)}>
                  <span className="recent-record-item__code">{r.case_code}</span>
                  <span className="recent-record-item__info">
                    {SEX_LABEL[r.sex] || '—'} · {r.approx_age_min ?? '?'}–{r.approx_age_max ?? '?'} años · 📍 {r.found_location || '—'}
                  </span>
                  <svg className="recent-record-item__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
