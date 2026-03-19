'use client';

const TYPE_LABELS = {
  narrative:              '💬 Narrativa',
  create_incident:        '🔥 Criar ocorrência',
  assign_unit:            '→ Atribuir meio',
  update_incident_status: '↺ Estado de ocorrência',
  close_road:             '✕ Corte de estrada',
  create_alert:           '⚠ Criar alerta',
  send_radio:             '📡 Rádio',
};

export default function ScriptEditor({ steps, selectedIndex, onSelect, onAdd, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div className="script-editor">
      <div className="script-editor-header">
        <span className="script-editor-title">Script do Demo</span>
        <button className="script-editor-add" onClick={onAdd}>+ Adicionar Evento</button>
      </div>

      {steps.length === 0 && (
        <div className="script-editor-empty">Nenhum evento. Adiciona o primeiro.</div>
      )}

      <div className="script-editor-list">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`script-step ${selectedIndex === i ? 'active' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className="script-step-index">{i + 1}</span>
            <div className="script-step-info">
              <span className="script-step-type">{TYPE_LABELS[step.type] || step.type}</span>
              <span className="script-step-label">{step.label || '(sem descrição)'}</span>
            </div>
            <div className="script-step-actions" onClick={e => e.stopPropagation()}>
              <button title="Mover acima" disabled={i === 0} onClick={() => onMoveUp(i)}>↑</button>
              <button title="Mover abaixo" disabled={i === steps.length - 1} onClick={() => onMoveDown(i)}>↓</button>
              <button title="Eliminar" onClick={() => onDelete(i)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
