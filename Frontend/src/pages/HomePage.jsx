import { useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import DentalChart from '../components/DentalChart';
import { supabase } from '../lib/supabase';
import './HomePage.css';

export default function HomePage() {
  const { theme, toggleTheme } = useTheme();
  const fileRef = useRef(null);

  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState('');
  const [edad, setEdad] = useState('');
  const [sexo, setSexo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [dentalData, setDentalData] = useState({});
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLooking, setIsLooking] = useState(false);
  const [existingRecord, setExistingRecord] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});

  const sexReverseMap = { male: 'M', female: 'F', unknown: '' };

  const handleCedulaBlur = async () => {
    const trimmed = cedula.trim().replace(/[^0-9]/g, '');
    if (trimmed.length < 6) return;

    setIsLooking(true);
    setExistingRecord(null);

    const { data } = await supabase.rpc('get_report_by_cedula', { p_cedula: trimmed });

    if (data) {
      setExistingRecord(data);
      if (data.full_name)            setNombre(data.full_name);
      if (data.approx_age_min)       setEdad(String(data.approx_age_min));
      if (data.sex && data.sex !== 'unknown') setSexo(sexReverseMap[data.sex] ?? '');
      if (data.distinguishing_marks) setDescripcion(data.distinguishing_marks);
      if (data.dental_info)          setDentalData(data.dental_info);

      if (data.photo_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from('evidence')
          .createSignedUrl(data.photo_path, 3600);
        if (!signErr && signed?.signedUrl) setPhotoPreview(signed.signedUrl);
      }
    }

    setIsLooking(false);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors(p => ({ ...p, photo: 'La imagen no puede superar 5 MB' }));
      return;
    }
    setErrors(p => ({ ...p, photo: '' }));
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
    setResult(null);
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    const errs = {};

    // ── Cédula ──
    const trimmedCedula = cedula.trim().replace(/[^0-9]/g, '');
    if (!trimmedCedula)            errs.cedula = 'Ingrese un número de cédula';
    else if (trimmedCedula.length < 6) errs.cedula = 'La cédula debe tener al menos 6 dígitos';

    // ── Nombre (si se ingresó) ──
    const trimNombre = nombre.trim();
    if (trimNombre) {
      if (trimNombre.length < 3)
        errs.nombre = 'El nombre debe tener al menos 3 caracteres';
      else if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]+$/.test(trimNombre))
        errs.nombre = 'El nombre solo puede contener letras';
    }

    // ── Foto ──
    if (!photo && !existingRecord) errs.photo = 'Adjunte una fotografía';

    // ── Email de contacto ──
    const trimEmail = contactEmail.trim();
    if (trimEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimEmail))
      errs.contactEmail = 'Correo inválido (ej: nombre@correo.com)';

    // ── Teléfono de contacto ──
    const trimPhone = contactPhone.trim();
    if (trimPhone && trimPhone.replace(/[^0-9]/g, '').length < 7)
      errs.contactPhone = 'El teléfono debe tener al menos 7 dígitos';

    // ── Parentesco sin contacto ──
    if (relationship && !trimEmail && !trimPhone)
      errs.contactPhone = 'Agrega correo o teléfono si indicas el parentesco';

    // ── Términos y condiciones ──
    if (!acceptedTerms)
      errs.terms = 'Debes aceptar los términos y condiciones legales para continuar';

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsSubmitting(true);

    try {
      // 1. Subir foto a Storage → bucket "evidence", carpeta "intake/"
      let photoPath = null;
      if (photo) {
        const ext = photo.name.split('.').pop();
        const filename = `intake/${Date.now()}_${trimmedCedula}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(filename, photo, { upsert: false });
        if (uploadError) throw new Error(`Error subiendo foto: ${uploadError.message}`);
        photoPath = filename;
      }

      // 2. Mapear campos del formulario al payload del RPC
      const sexMap = { M: 'male', F: 'female' };
      const hasDental = Object.keys(dentalData).length > 0;
      const payload = {
        national_id:          trimmedCedula,
        full_name:            nombre.trim() || null,
        approx_age:           edad ? parseInt(edad, 10) : null,
        sex:                  sexMap[sexo] ?? 'unknown',
        distinguishing_marks: descripcion.trim() || null,
        dental_info:          hasDental ? dentalData : null,
        has_dental_records:   hasDental,
        photo_path:           photoPath,
        contact_name:         contactName.trim() || null,
        contact_email:        contactEmail.trim() || null,
        contact_phone:        contactPhone.trim() || null,
        relationship:         relationship || null,
      };

      // 3. Llamar al RPC — hace UPSERT por cédula sin duplicar ni pisar datos
      const { data: reportId, error: rpcError } = await supabase
        .rpc('submit_missing_report', { p: payload });
      if (rpcError) throw new Error(rpcError.message);

      // 4. Detectar si fue INSERT o UPDATE consultando created_at vs updated_at
      const { data: rec } = await supabase
        .from('missing_reports')
        .select('created_at, updated_at')
        .eq('id', reportId)
        .single();

      const isNew = !rec || rec.created_at === rec.updated_at;

      if (isNew) {
        setResult({
          type: 'new',
          message: `Registro creado. La cédula ${trimmedCedula} fue ingresada a la base de datos. Se notificará si hay coincidencias.`,
        });
      } else {
        setResult({
          type: 'exists',
          message: `La cédula ${trimmedCedula} ya existía en el sistema. Se actualizó el registro sin perder datos anteriores.`,
        });
      }
    } catch (err) {
      setResult({ type: 'error', message: `Error: ${err.message}` });
    }

    setIsSubmitting(false);
    setCedula(''); setNombre(''); setEdad(''); setSexo(''); setDescripcion('');
    setDentalData({}); setExistingRecord(null);
    setPhoto(null); setPhotoPreview(null);
    setContactName(''); setContactEmail(''); setContactPhone(''); setRelationship('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="home">
      {/* ── Navbar ── */}
      <nav className="nav">
        <div className="nav__inner">
          <div className="nav__badge">
            🇻🇪 Sismo Venezuela 2026 — Búsqueda de Personas
          </div>
          <button className="nav__theme-btn" onClick={toggleTheme} aria-label="Cambiar tema">
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="search-main">
        <div className="search-main__grid-bg" aria-hidden="true" />
        
        {/* Radar Background */}
        <div className="radar" aria-hidden="true">
          <div className="radar__wave" style={{ animationDelay: '0s' }}></div>
          <div className="radar__wave" style={{ animationDelay: '5s' }}></div>
          <div className="radar__wave" style={{ animationDelay: '10s' }}></div>
        </div>

        <div className="search-container">
          {/* Header */}
          <div className="search-header">
            <h1 className="search-header__title">Reportar Desaparecido</h1>
            <p className="search-header__desc">
              Ingrese los datos disponibles de la persona para cruzar información con la base de datos nacional y registros forenses. Toda ayuda es vital.
            </p>
          </div>

          {/* Form Card */}
          <div className="search-card">
            <form className="search-form" onSubmit={handleSubmit} noValidate>

              {/* ── Section: Identificación ── */}
              <div className="form-section">
                <div className="form-section__label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  Identificación
                </div>

                <div className="search-field">
                  <label htmlFor="cedula" className="search-field__label">Cédula <span className="required">*</span></label>
                  <div className="search-field__input-wrap">
                    <input
                      id="cedula"
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej: 12345678"
                      value={cedula}
                      onChange={(e) => {
                        setCedula(e.target.value);
                        setErrors(p => ({...p, cedula: ''}));
                        setResult(null);
                        if (existingRecord) {
                          setExistingRecord(null);
                          setNombre(''); setEdad(''); setSexo('');
                          setDescripcion(''); setDentalData({});
                          setPhoto(null); setPhotoPreview(null);
                          setContactName(''); setContactEmail(''); setContactPhone(''); setRelationship('');
                          if (fileRef.current) fileRef.current.value = '';
                        }
                      }}
                      onBlur={handleCedulaBlur}
                      disabled={isSubmitting}
                      autoComplete="off"
                      className={errors.cedula ? 'input--error' : ''}
                    />
                  </div>
                  {errors.cedula && <span className="search-field__error">{errors.cedula}</span>}
                </div>

                {isLooking && (
                  <div className="cedula-status cedula-status--looking">
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    Buscando en el sistema...
                  </div>
                )}
                {existingRecord && !isLooking && (
                  <div className="cedula-status cedula-status--found">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    Ya registrado — datos cargados. Actualiza solo lo que haya cambiado.
                  </div>
                )}

                <div className="search-field">
                  <label htmlFor="nombre" className="search-field__label">Nombre completo <span className="optional">(opcional)</span></label>
                  <div className="search-field__input-wrap">
                    <input
                      id="nombre"
                      type="text"
                      placeholder="Nombre y apellido"
                      value={nombre}
                      onChange={(e) => { setNombre(e.target.value); setErrors(p => ({ ...p, nombre: '' })); }}
                      disabled={isSubmitting}
                      className={errors.nombre ? 'input--error' : ''}
                    />
                  </div>
                  {errors.nombre && <span className="search-field__error">{errors.nombre}</span>}
                </div>

                <div className="field-row">
                  <div className="search-field">
                    <label htmlFor="edad" className="search-field__label">Edad aprox.</label>
                    <div className="search-field__input-wrap">
                      <input
                        id="edad"
                        type="number"
                        placeholder="—"
                        min="0" max="120"
                        value={edad}
                        onChange={(e) => setEdad(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div className="search-field">
                    <label htmlFor="sexo" className="search-field__label">Sexo</label>
                    <select
                      id="sexo"
                      value={sexo}
                      onChange={(e) => setSexo(e.target.value)}
                      disabled={isSubmitting}
                      className="search-select"
                    >
                      <option value="">— Seleccionar —</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Section: Fotografía ── */}
              <div className="form-section">
                <div className="form-section__label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Fotografía <span className="required">*</span>
                </div>

                {photoPreview ? (
                  <div className="photo-preview">
                    <img src={photoPreview} alt="Vista previa" />
                    <button type="button" className="photo-preview__remove" onClick={removePhoto} aria-label="Eliminar foto">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ) : (
                  <label className={`photo-upload ${errors.photo ? 'photo-upload--error' : ''}`} htmlFor="photo-input">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span>Haga clic para subir una imagen</span>
                    <span className="photo-upload__hint">JPG, PNG — Máx. 5 MB</span>
                    <input ref={fileRef} id="photo-input" type="file" accept="image/*" onChange={handlePhotoChange} disabled={isSubmitting} />
                  </label>
                )}
                {errors.photo && <span className="search-field__error">{errors.photo}</span>}
              </div>

              {/* ── Section: Registro dental ── */}
              <div className="form-section">
                <div className="form-section__label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5.5C12 3.567 10.433 2 8.5 2S5 3.567 5 5.5C5 8 7 10 7 13c0 2 1 5 1.5 6.5.3.9 1.1.5 1.3-.2C10.5 17 11 14 12 12"/>
                    <path d="M12 5.5C12 3.567 13.567 2 15.5 2S19 3.567 19 5.5C19 8 17 10 17 13c0 2-1 5-1.5 6.5-.3.9-1.1.5-1.3-.2C13.5 17 13 14 12 12"/>
                  </svg>
                  Registro dental <span className="optional">(mejora la identificación)</span>
                </div>
                <DentalChart value={dentalData} onChange={setDentalData} />
              </div>

              {/* ── Section: Señas particulares ── */}
              <div className="form-section">
                <div className="form-section__label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Señas particulares <span className="optional">(opcional)</span>
                </div>
                <textarea
                  id="descripcion"
                  className="search-textarea"
                  rows={3}
                  placeholder="Cicatrices, tatuajes, lunares, complexión, estatura, color de cabello..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {/* ── Section: Contacto del reportante ── */}
              <div className="form-section">
                <div className="form-section__label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9.5 19.79 19.79 0 0 1 1.56 6.18 2 2 0 0 1 3.5 4h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11.5a16 16 0 0 0 5.49 5.49l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Sus datos de contacto <span className="optional">(para notificarle si hay coincidencias)</span>
                </div>

                {existingRecord?.contact_count > 0 && (
                  <div className="contact-count-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    {existingRecord.contact_count} {existingRecord.contact_count === 1 ? 'persona ya reportó' : 'personas ya reportaron'} a esta persona. Agrega tus datos si eres diferente.
                  </div>
                )}

                <div className="field-row">
                  <div className="search-field" style={{ flex: 2 }}>
                    <label className="search-field__label">Tu nombre</label>
                    <div className="search-field__input-wrap">
                      <input
                        type="text"
                        placeholder="Nombre completo"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div className="search-field" style={{ flex: 1 }}>
                    <label className="search-field__label">Parentesco</label>
                    <select
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      disabled={isSubmitting}
                      className="search-select"
                    >
                      <option value="">— Seleccionar —</option>
                      <option value="Madre">Madre</option>
                      <option value="Padre">Padre</option>
                      <option value="Hijo/a">Hijo/a</option>
                      <option value="Hermano/a">Hermano/a</option>
                      <option value="Esposo/a">Esposo/a</option>
                      <option value="Abuelo/a">Abuelo/a</option>
                      <option value="Tío/a">Tío/a</option>
                      <option value="Primo/a">Primo/a</option>
                      <option value="Amigo/a">Amigo/a</option>
                      <option value="Vecino/a">Vecino/a</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>

                <div className="field-row">
                  <div className="search-field">
                    <label className="search-field__label">Correo electrónico</label>
                    <div className="search-field__input-wrap">
                      <input
                        type="email"
                        placeholder="tu@correo.com"
                        value={contactEmail}
                        onChange={(e) => { setContactEmail(e.target.value.toLowerCase()); setErrors(p => ({ ...p, contactEmail: '' })); }}
                        disabled={isSubmitting}
                        className={errors.contactEmail ? 'input--error' : ''}
                      />
                    </div>
                    {errors.contactEmail && <span className="search-field__error">{errors.contactEmail}</span>}
                  </div>
                  <div className="search-field">
                    <label className="search-field__label">Teléfono / WhatsApp</label>
                    <div className="search-field__input-wrap">
                      <input
                        type="tel"
                        placeholder="+58 412 000 0000"
                        value={contactPhone}
                        onChange={(e) => { setContactPhone(e.target.value); setErrors(p => ({ ...p, contactPhone: '' })); }}
                        disabled={isSubmitting}
                        className={errors.contactPhone ? 'input--error' : ''}
                      />
                    </div>
                    {errors.contactPhone && <span className="search-field__error">{errors.contactPhone}</span>}
                  </div>
                </div>
              </div>

              {/* ── Section: Legal ── */}
              <div className="form-section form-section--legal">
                <label className={`checkbox-label ${errors.terms ? 'checkbox-label--error' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={acceptedTerms} 
                    onChange={(e) => { setAcceptedTerms(e.target.checked); setErrors(p => ({ ...p, terms: '' })); }}
                    disabled={isSubmitting}
                  />
                  <span className="checkbox-custom"></span>
                  <div className="legal-text">
                    <strong>Acepto los Términos y Condiciones de Uso:</strong> Declaro que la información proporcionada es veraz. Entiendo que S.U.B.I. es una iniciativa <strong>sin fines de lucro</strong> creada exclusivamente para facilitar la búsqueda de personas desaparecidas en situación de emergencia. Eximo de toda responsabilidad legal, civil o penal a los desarrolladores y creadores de esta plataforma por el uso, precisión o resultados derivados de los datos aquí suministrados.
                  </div>
                </label>
                {errors.terms && <span className="search-field__error" style={{ marginLeft: '2rem', display: 'block', marginTop: '0.5rem' }}>{errors.terms}</span>}
              </div>

              {/* Submit */}
              <button
                type="submit"
                className={`search-submit ${isSubmitting ? 'search-submit--loading' : ''}`}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <><span className="spinner" /> Procesando...</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Buscar y registrar
                  </>
                )}
              </button>
            </form>

            {/* Result */}
            {result && (
              <div className={`search-result search-result--${result.type}`} role="alert">
                {result.type === 'new' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                )}
                {result.type === 'exists' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                )}
                <p>{result.message}</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="search-info" style={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9.5 19.79 19.79 0 0 1 1.56 6.18 2 2 0 0 1 3.5 4h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11.5a16 16 0 0 0 5.49 5.49l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>
              <strong>¿Su familiar ya ha sido localizado?</strong><br/>
              Por favor, comuníquese al correo <a href="mailto:admin@subi.gob.ve">admin@subi.gob.ve</a> o al WhatsApp <strong>+58 412 000 0000</strong> para cerrar el caso y agilizar la búsqueda de otros desaparecidos.
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer__inner">
          <p className="footer__copy">Sistema Único de Búsqueda e Identificación — Venezuela 2026</p>
        </div>
      </footer>
    </div>
  );
}
