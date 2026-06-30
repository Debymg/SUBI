import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import './DashboardPage.css';

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#lg2)" />
            <path d="M10 22V16C10 12.686 12.686 10 16 10C19.314 10 22 12.686 22 16V22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="16" cy="16" r="2" fill="white" />
            <path d="M8 24H24" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <defs>
              <linearGradient id="lg2" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#2563EB" />
                <stop offset="1" stopColor="#0EA5E9" />
              </linearGradient>
            </defs>
          </svg>
          <span className="dashboard__title">SUBI <span className="dashboard__role-badge dashboard__role-badge--user">Usuario</span></span>
        </div>
        <div className="dashboard__actions">
          <ThemeToggle />
          <button className="btn-logout" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main className="dashboard__content">
        <div className="dashboard__welcome">
          <h1>Mi Panel</h1>
          <p>Bienvenido, <strong>{user?.nombre}</strong>. Reporte y consulte personas desaparecidas.</p>
        </div>

        <div className="dashboard__stats">
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="stat-card__data">
              <span className="stat-card__number">0</span>
              <span className="stat-card__label">Mis Reportes</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div className="stat-card__data">
              <span className="stat-card__number">0</span>
              <span className="stat-card__label">Búsquedas</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="stat-card__data">
              <span className="stat-card__number">0</span>
              <span className="stat-card__label">Alertas</span>
            </div>
          </div>
        </div>

        <div className="dashboard__placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <h2>Módulo en construcción</h2>
          <p>Aquí podrá generar nuevos reportes de personas desaparecidas, consultar la base de datos y recibir alertas.</p>
        </div>
      </main>
    </div>
  );
}
