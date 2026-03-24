'use client';

import Panel from './Panel';
import { usePociState } from '../../lib/usePociState';

export default function RadioPanel({ incidentId }) {
  const { opLog } = usePociState()
  const filtered = opLog.filter(
    (e) => e.type === 'radio_message' && (e.incidentId === incidentId || e.incidentId === null)
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
              <span className="badge badge-radio">{m.id}</span>
            </div>
            <div className="card-meta">"{m.message || m.msg}"</div>
          </div>
        ))
      )}
    </Panel>
  );
}
