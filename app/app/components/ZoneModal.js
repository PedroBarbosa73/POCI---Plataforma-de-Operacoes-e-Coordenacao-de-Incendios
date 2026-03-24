'use client';

import { useState } from 'react';

export default function ZoneModal({ open, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ataque');
  const [radius, setRadius] = useState(6);

  if (!open) return null;

  function handleSave() {
    onSave({
      name: name.trim() || 'Zona sem nome',
      type,
      radiusKm: Math.max(1, Number(radius) || 6),
    });
    setName('');
    setType('ataque');
    setRadius(6);
  }

  function handleCancel() {
    setName('');
    setType('ataque');
    setRadius(6);
    onCancel();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Nova zona operacional</div>

        <div className="form-group">
          <label className="form-label">Nome da zona</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ataque Alfa"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select
            className="form-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="ataque">Área de ataque</option>
            <option value="seguranca">Zona de segurança</option>
            <option value="exclusao">Zona de exclusão</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Raio (km)</label>
          <input
            className="form-input"
            type="number"
            min="1"
            max="50"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Guardar zona
          </button>
        </div>
      </div>
    </div>
  );
}
