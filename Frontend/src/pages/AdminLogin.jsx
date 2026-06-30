import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './AdminLogin.css';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [formData, setFormData] = useState({ correo: '', contrasena: '' });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reaccionar cuando el usuario se autentique
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const validate = () => {
    const e = {};
    if (!formData.correo.trim()) e.correo = 'Requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correo)) e.correo = 'Correo inválido';
    if (!formData.contrasena) e.contrasena = 'Requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      await login(formData.correo.trim().toLowerCase(), formData.contrasena);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('Email not confirmed'))
        setErrors({ general: 'Debes confirmar tu correo. Ve a Supabase → Authentication → Providers → Email y desactiva "Confirm email".' });
      else if (msg.includes('Invalid login credentials'))
        setErrors({ general: 'Correo o contraseña incorrectos.' });
      else
        setErrors({ general: msg || 'Error al iniciar sesión.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login__grid-bg" aria-hidden="true" />

      {/* Back + theme */}
      <div className="admin-login__topbar">
        <a href="/" className="admin-login__back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Volver al inicio
        </a>
        <button className="nav__theme-btn" onClick={toggleTheme} aria-label="Cambiar tema">
          {theme === 'light' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          )}
        </button>
      </div>

      <main className="admin-login__main">
        <div className="admin-login__card">
          <div className="admin-login__accent"></div>
          
          <div className="admin-login__header">
            <h1 className="admin-login__title">Acceso Restringido</h1>
            <p className="admin-login__subtitle">S.U.B.I. // PROTOCOLO ADMINISTRATIVO</p>
          </div>

          {errors.general && (
            <div className="admin-alert" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="admin-login__form">
            <div className={`field ${errors.correo ? 'field--error' : ''}`}>
              <label htmlFor="admin-correo">Correo</label>
              <input id="admin-correo" name="correo" type="email" placeholder="usuario@correo.com" value={formData.correo} onChange={handleChange} disabled={isLoading} />
              {errors.correo && <span className="field__error">{errors.correo}</span>}
            </div>

            <div className={`field ${errors.contrasena ? 'field--error' : ''}`}>
              <label htmlFor="admin-pass">Contraseña</label>
              <div className="admin-login__pass-wrap">
                <input id="admin-pass" name="contrasena" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={formData.contrasena} onChange={handleChange} disabled={isLoading} />
                <button type="button" className="admin-login__eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar' : 'Mostrar'} tabIndex={-1}>
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              {errors.contrasena && <span className="field__error">{errors.contrasena}</span>}
            </div>

            <button type="submit" className={`admin-login__submit ${isLoading ? 'admin-login__submit--loading' : ''}`} disabled={isLoading}>
              {isLoading ? (
                <><span className="btn__spinner" /> Verificando...</>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}
