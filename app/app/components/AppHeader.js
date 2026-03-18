'use client';

import Link from 'next/link';

export default function AppHeader({ lockView, isPublic, view, setView, incidentCounts, unitCount, totalUnitCount, selectedIncidentId, onNovaOcorrencia }) {
  return (
    <header className={`header ${isPublic ? 'header-public' : ''}`}>
      <div className="header-left">
        <div className="header-logo">
          <div className={`logo-icon ${isPublic ? 'logo-icon-public' : ''}`}>PO</div>
          <div>
            <div className="logo-text">POCI</div>
            <div className="logo-subtitle">
              {isPublic ? 'Informação ao Público' : 'Plataforma de Coordenação'}
            </div>
          </div>
        </div>
        {!isPublic && <div className="coords-display">Centro: 40.4589, -7.9284</div>}
        {!isPublic && incidentCounts && (
          <div className="header-status-pills">
            <span className="header-status-pill pill-active">
              <span className="pill-dot" />
              {incidentCounts.active} ativo{incidentCounts.active !== 1 ? 's' : ''}
            </span>
            {incidentCounts.controlled > 0 && (
              <span className="header-status-pill pill-controlled">
                <span className="pill-dot" />
                {incidentCounts.controlled} controlado{incidentCounts.controlled !== 1 ? 's' : ''}
              </span>
            )}
            {incidentCounts.surveillance > 0 && (
              <span className="header-status-pill pill-surveillance">
                <span className="pill-dot" />
                {incidentCounts.surveillance} vigilância
              </span>
            )}
            <span className="header-status-pill pill-units">
              <span className="pill-dot" />
              {selectedIncidentId
                ? `${unitCount} / ${totalUnitCount} unidades`
                : `${totalUnitCount} unidades`}
            </span>
          </div>
        )}
      </div>

      <div className="header-center">
        {!lockView ? (
          <div className="view-toggle">
            <button
              className={`view-btn ${!isPublic ? 'active' : ''}`}
              onClick={() => setView('command')}
            >
              Vista de Comando
            </button>
            <button
              className={`view-btn ${isPublic ? 'active' : ''}`}
              onClick={() => setView('public')}
            >
              Vista Pública
            </button>
          </div>
        ) : null}
      </div>

      <div className="header-right">
        {!isPublic ? (
          <>
            <button className="btn btn-secondary btn-sm">Exportar</button>
            <button className="btn btn-primary btn-sm" onClick={onNovaOcorrencia}>Nova Ocorrência</button>
          </>
        ) : (
          <Link className="btn btn-primary btn-sm" href="/login">
            Entrar
          </Link>
        )}
      </div>
    </header>
  );
}
