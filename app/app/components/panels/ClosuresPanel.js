'use client';

import Panel from './Panel';
import { closureStatusLabel } from '../../lib/labels';

export default function ClosuresPanel({ closures, selectedClosureId, onSelectClosure }) {
  return (
    <Panel title="Cortes de estrada" icon="C" badge={closures.length}>
      {closures.map((closure) => (
        <div
          key={closure.id}
          className={`card ${closure.id === selectedClosureId ? 'selected' : ''}`}
          onClick={() => onSelectClosure(closure.id)}
        >
          <div className="card-header">
            <div className="card-name">{closure.name}</div>
            <span className={closure.status === 'active' ? 'badge badge-active' : 'badge badge-medium'}>
              {closureStatusLabel(closure.status)}
            </span>
          </div>
          <div className="card-meta">{closure.id}</div>
        </div>
      ))}
    </Panel>
  );
}
