'use client';

import { useState } from 'react';

export default function NovaOcorrenciaModal({ placement, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('active');

  if (!placement) return null;

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), area: area.trim() || 'Portugal', status, lat: placement.lat, lng: placement.lng });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="modal-overlay" onKeyDown={handleKeyDown}>
      <div className="modal">
        <div className="modal-title">Nova ocorrência</div>

        <div className="form-group">
          <label className="form-label">Nome</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: Incêndio Sintra"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Área / Concelho</label>
          <input
            className="form-input"
            type="text"
            placeholder="Ex: Sintra"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Estado inicial</label>
          <select
            className="form-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Ativo</option>
            <option value="controlled">Controlado</option>
            <option value="surveillance">Vigilância</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Localização</label>
          <div className="form-input nova-occ-coords">
            {placement.lat.toFixed(4)}, {placement.lng.toFixed(4)}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Criar ocorrência
          </button>
        </div>
      </div>
    </div>
  );
}
