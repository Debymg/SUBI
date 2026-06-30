import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import './LoginPage.css';

/* Demo credentials for testing */
const DEMO_USERS = {
  admin: { id: 1, nombre: 'Administrador', correo: 'admin@subi.gob', rol: 'administrador' },
  user:  { id: 2, nombre: 'Usuario Demo',  correo: 'usuario@subi.gob', rol: 'usuario' },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({ correo: '', contrasena: '' });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.correo.trim()) {
      newErrors.correo = 'El correo electrónico es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correo)) {
      newErrors.correo = 'Ingrese un correo electrónico válido';
    }
    if (!formData.contrasena) {
      newErrors.contrasena = 'La contraseña es requerida';
    } else if (formData.contrasena.length < 6) {
      newErrors.contrasena = 'La contraseña debe tener al menos 6 caracteres';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    /* Simulate API call */
    await new Promise(resolve => setTimeout(resolve, 1200));

    if (formData.correo === 'admin@subi.gob' && formData.contrasena === 'admin123') {
      login(DEMO_USERS.admin);
      navigate('/admin');
    } else if (formData.correo === 'usuario@subi.gob' && formData.contrasena === 'user123') {
      login(DEMO_USERS.user);
      navigate('/dashboard');
    } else {
      setErrors({ general: 'Credenciales incorrectas. Verifique su correo y contraseña.' });
    }
    setIsLoading(false);
  };

  return (
    <div className="login-page">
      {/* Decorative grid background */}
      <div className="login-page__grid-bg" aria-hidden="true" />

      {/* Header bar */}
      <header className="login-header">
        <div className="login-header__brand">
          <div className="login-header__logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#logo-gradient)" />
              <path d="M10 22V16C10 12.686 12.686 10 16 10C19.314 10 22 12.686 22 16V22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="16" cy="16" r="2" fill="white" />
              <path d="M8 24H24" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <defs>
                <linearGradient id="logo-gradient" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#2563EB" />
                  <stop offset="1" stopColor="#0EA5E9" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <span className="login-header__title">SUBI</span>
            <span className="login-header__subtitle">Sistema Único de Búsqueda e Identificación</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main login card */}
      <main className="login-main">
        <div className="login-card">
          {/* Card header */}
          <div className="login-card__header">
            <h1 className="login-card__title">Iniciar Sesión</h1>
            <p className="login-card__desc">Acceda a la plataforma de búsqueda e identificación</p>
          </div>

          {/* Error banner */}
          {errors.general && (
            <div className="login-alert login-alert--error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{errors.general}</span>
            </div>
          )}

          {/* Login form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className={`form-group ${errors.correo ? 'form-group--error' : ''}`}>
              <label htmlFor="correo" className="form-label">Correo Electrónico</label>
              <div className="form-input-wrapper">
                <svg className="form-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7L13.03 12.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  className="form-input"
                  placeholder="nombre@correo.com"
                  value={formData.correo}
                  onChange={handleChange}
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>
              {errors.correo && <span className="form-error">{errors.correo}</span>}
            </div>

            {/* Password */}
            <div className={`form-group ${errors.contrasena ? 'form-group--error' : ''}`}>
              <label htmlFor="contrasena" className="form-label">Contraseña</label>
              <div className="form-input-wrapper">
                <svg className="form-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="contrasena"
                  name="contrasena"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={formData.contrasena}
                  onChange={handleChange}
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="form-input-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.contrasena && <span className="form-error">{errors.contrasena}</span>}
            </div>

            {/* Remember / Forgot */}
            <div className="login-form__options">
              <label className="form-checkbox" htmlFor="remember">
                <input type="checkbox" id="remember" />
                <span className="form-checkbox__mark" />
                <span>Recordar sesión</span>
              </label>
              <a href="#" className="login-form__forgot">¿Olvidó su contraseña?</a>
            </div>

            {/* Submit button */}
            <button
              id="login-submit"
              type="submit"
              className={`btn btn--primary btn--full ${isLoading ? 'btn--loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="btn__spinner" />
                  <span>Verificando...</span>
                </>
              ) : (
                <span>Iniciar Sesión</span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider">
            <span>Credenciales de prueba</span>
          </div>

          {/* Demo credentials */}
          <div className="login-demo">
            <div className="login-demo__card">
              <div className="login-demo__badge login-demo__badge--admin">Admin</div>
              <div className="login-demo__info">
                <span>admin@subi.gob</span>
                <span>admin123</span>
              </div>
            </div>
            <div className="login-demo__card">
              <div className="login-demo__badge login-demo__badge--user">Usuario</div>
              <div className="login-demo__info">
                <span>usuario@subi.gob</span>
                <span>user123</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="login-footer">
          <p>© 2026 SUBI — Sistema Único de Búsqueda e Identificación</p>
          <p>Todos los derechos reservados</p>
        </footer>
      </main>
    </div>
  );
}
