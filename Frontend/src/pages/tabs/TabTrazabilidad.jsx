import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function TabTrazabilidad({ userId }) {
  const [caseCode, setCaseCode] = useState('');
  const [record, setRecord] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({
    custody_from: '',
    location: '',
    organization: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [recentRecords, setRecentRecords] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadRecentRecords = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('unidentified_records')
      .select('id, case_code, sex, found_location, found_at, status')
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
    loadEntries(rec.id);
  };

  const loadEntries = async (recordId) => {
    const { data } = await supabase
      .from('custody_log')
      .select('id, organization, location, custody_from, notes, created_at')
      .eq('record_id', recordId)
      .order('custody_from', { ascending: true });
    setEntries(data || []);
  };

  const searchRecord = async () => {
    const code = caseCode.trim().toUpperCase();
    if (!code) { setSearchError('Ingrese un código de expediente'); return; }
    setSearching(true);
    setSearchError('');
    setRecord(null);
    setEntries([]);
    setSaved(false);

    const { data, error } = await supabase
      .from('unidentified_records')
      .select('id, case_code, sex, found_location, found_at, status')
      .eq('case_code', code)
      .maybeSingle();

    if (error || !data) {
      setSearchError('No se encontró ningún expediente con ese código.');
    } else {
      setRecord(data);
      await loadEntries(data.id);
    }
    setSearching(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.organization.trim()) errs.organization = 'Ingrese el responsable';
    if (!form.location.trim()) errs.location = 'Ingrese el lugar';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from('custody_log').insert({
      record_id: record.id,
      organization: form.organization.trim(),
      location: form.location.trim(),
      custody_from: form.custody_from ? new Date(form.custody_from).toISOString() : new Date().toISOString(),
      recorded_by: userId,
      notes: form.notes.trim() || null,
    });

    if (error) {
      setErrors({ general: error.message });
    } else {
      setSaved(true);
      setForm({ custody_from: '', location: '', organization: '', notes: '' });
      await loadEntries(record.id);
    }
    setSaving(false);
  };

  return (
    <div className="tab-section">
      <div className="section-header">
        <h2 className="section-title">Trazabilidad / Cadena de custodia</h2>
        <p className="section-desc">Registre cada traslado del hallazgo para mantener la cadena de custodia completa.</p>
      </div>

      {/* Search */}
      <div className="code-search">
        <div className="code-search__field">
          <input type="text" placeholder="Código de expediente"
            value={caseCode}
            onChange={e => { setCaseCode(e.target.value); setSearchError(''); }}
            onKeyDown={e => e.key === 'Enter' && searchRecord()} />
          <button className="code-search__btn" onClick={searchRecord} disabled={searching}>
            {searching ? <span className="spinner-sm" /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            )}
          </button>
        </div>
        {searchError && <span className="field-error">{searchError}</span>}
      </div>

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
              <span>📍 {record.found_location || '—'}</span>
              {record.found_at && <span>📅 {new Date(record.found_at + 'T12:00:00').toLocaleDateString('es-VE')}</span>}
            </div>
          </div>

          {/* Timeline */}
          {entries.length > 0 && (
            <div className="custody-timeline">
              <h3 className="custody-timeline__title">Historial de movimientos ({entries.length})</h3>
              <div className="custody-timeline__track">
                {entries.map((entry) => (
                  <div key={entry.id} className="custody-entry">
                    <div className="custody-entry__dot" />
                    {entries.length > 1 && <div className="custody-entry__line" />}
                    <div className="custody-entry__content">
                      <div className="custody-entry__time">
                        {new Date(entry.custody_from).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                      <div className="custody-entry__info">
                        <strong>{entry.location || '—'}</strong>
                        <span className="custody-entry__org">{entry.organization}</span>
                      </div>
                      {entry.notes && <p className="custody-entry__notes">{entry.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add entry form */}
          {saved && <div className="success-banner">✓ Movimiento registrado correctamente.</div>}
          {errors.general && <div className="error-banner">{errors.general}</div>}

          <div className="add-movement-section">
            <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: 'var(--space-md)' }}>Agregar movimiento</h3>
            <form className="forense-form" onSubmit={handleSubmit} noValidate>
              <div className="form-row-3">
                <div className="fgroup">
                  <label>Fecha y hora</label>
                  <input type="datetime-local" value={form.custody_from}
                    onChange={e => set('custody_from', e.target.value)} />
                </div>
                <div className="fgroup">
                  <label>Lugar <span className="req">*</span></label>
                  <input type="text" placeholder="Ej: Morgue, Ambulancia..."
                    value={form.location}
                    className={errors.location ? 'input--error' : ''}
                    onChange={e => { set('location', e.target.value); setErrors(p => ({ ...p, location: '' })); }} />
                  {errors.location && <span className="field-error">{errors.location}</span>}
                </div>
                <div className="fgroup">
                  <label>Responsable <span className="req">*</span></label>
                  <input type="text" placeholder="Ej: Cruz Roja, Dr. Pérez..."
                    value={form.organization}
                    className={errors.organization ? 'input--error' : ''}
                    onChange={e => { set('organization', e.target.value); setErrors(p => ({ ...p, organization: '' })); }} />
                  {errors.organization && <span className="field-error">{errors.organization}</span>}
                </div>
              </div>
              <div className="fgroup">
                <label>Notas <span className="optional-tag">(opcional)</span></label>
                <input type="text" placeholder="Observaciones del traslado..."
                  value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <><span className="spinner-sm" /> Guardando...</> : 'Registrar movimiento'}
              </button>
            </form>
          </div>
        </>
      )}

      {!record && !searching && (
        <div className="workflow-guide">
          <p className="workflow-guide__title">¿Cómo registrar un movimiento?</p>
          <div className="workflow-steps">
            <div className="workflow-step">
              <span className="workflow-step__num">1</span>
              <div>
                <p className="workflow-step__title">Identifique el expediente</p>
                <p className="workflow-step__desc">Escriba el código de expediente en el campo de arriba, o use el botón de abajo para ver los registros recientes.</p>
              </div>
            </div>
            <div className="workflow-step">
              <span className="workflow-step__num">2</span>
              <div>
                <p className="workflow-step__title">Agregue el movimiento</p>
                <p className="workflow-step__desc">Indique fecha, lugar y responsable de cada traslado para mantener la cadena de custodia.</p>
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
                    📍 {r.found_location || '—'}
                    {r.found_at && <> · {new Date(r.found_at + 'T12:00:00').toLocaleDateString('es-VE')}</>}
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
