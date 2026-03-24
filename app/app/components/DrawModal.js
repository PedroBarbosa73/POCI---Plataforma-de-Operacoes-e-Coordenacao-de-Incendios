'use client';

import { useState } from 'react';

export default function DrawModal({ mode, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ataque');
  const [status, setStatus] = useState('active');

  if (!mode) return null;

  function handleSave() {
    if (!name.trim()) return;
    if (mode === 'zone') {
      onSave({ name: name.trim(), type });
    } else {
      onSave({ name: name.trim(), status });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="modal-overlay" onKeyDown={handleKeyDown}>
      <div className="modal">
        <div className="modal-title">
          {mode === 'zone' ? 'Nova zona' : 'Novo corte de estrada'}
        </div>

        <div className="form-group">
          <label className="form-label">Nome</label>
          <input
            className="form-input"
            type="text"
            placeholder={mode === 'zone' ? 'Ex: Zona de exclusão norte' : 'Ex: EN2 sentido norte'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {mode === 'zone' && (
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select
              className="form-select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="ataque">Ataque</option>
              <option value="seguranca">Segurança</option>
              <option value="exclusao">Exclusão</option>
              <option value="apoio">Apoio</option>
            </select>
          </div>
        )}

        {mode === 'closure' && (
          <div className="form-group">
            <label className="form-label">Estado</label>
            <select
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Ativo</option>
              <option value="planned">Previsto</option>
              <option value="lifted">Levantado</option>
            </select>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
