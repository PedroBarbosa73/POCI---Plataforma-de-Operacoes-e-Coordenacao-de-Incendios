'use client';

import Panel from './Panel';
import { usePociState } from '../../lib/usePociState';

const typeBadge = { tactical: 'badge-available', logistics: 'badge-medium', weather: 'badge-controlled' };

export default function RadioPanel({ incidentId }) {
  const { radioMessages } = usePociState()
  const filtered = radioMessages.filter(
    (m) => m.incidentId === incidentId || m.incidentId === null
  );

  return (
    <Panel title="Linha de rádio" icon="R" badge="Ao vivo" badgeClass="green">
      {filtered.length === 0 ? (
        <div className="panel-empty">Sem mensagens para esta ocorrência.</div>
      ) : (
        [...filtered].reverse().map((m) => (
          <div key={m.id} className="card">
            <div className="card-header">
              <div className="card-name">{m.from}</div>
              <span className={`badge ${typeBadge[m.type] || 'badge-available'}`}>{m.id}</span>
            </div>
            <div className="card-meta">"{m.message || m.msg}"</div>
          </div>
        ))
      )}
    </Panel>
  );
}
