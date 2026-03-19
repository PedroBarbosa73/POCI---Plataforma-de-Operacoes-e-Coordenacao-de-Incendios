'use client';

import { useState } from 'react';

// Reusable dark custom select (same pattern as alertas/page.js)
function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <div className="rel-custom-select" style={{ position: 'relative' }}>
      <button type="button" className="rel-select-btn"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}>
        <span>{selected?.label || placeholder || '—'}</span>
        <span className="rel-select-arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="rel-select-dropdown">
          {options.map(o => (
            <button type="button" key={String(o.value)} className={`rel-select-option ${o.value === value ? 'active' : ''}`}
              onMouseDown={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: 'narrative',              label: 'Narrativa (só texto)' },
  { value: 'create_incident',        label: 'Criar ocorrência' },
  { value: 'assign_unit',            label: 'Atribuir meio' },
  { value: 'update_incident_status', label: 'Atualizar estado de ocorrência' },
  { value: 'close_road',             label: 'Corte de estrada' },
  { value: 'create_alert',           label: 'Criar alerta' },
  { value: 'send_radio',             label: 'Enviar mensagem de rádio' },
];

const STATUS_OPTIONS = [
  { value: 'active',       label: 'Ativo' },
  { value: 'controlled',   label: 'Controlado' },
  { value: 'surveillance', label: 'Vigilância' },
  { value: 'resolved',     label: 'Resolvido' },
];

const LEVEL_OPTIONS = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high',     label: 'Alto' },
  { value: 'medium',   label: 'Médio' },
  { value: 'low',      label: 'Baixo' },
];

const PRIORITY_OPTIONS = [
  { value: 'normal',   label: 'Normal' },
  { value: 'urgente',  label: 'Urgente' },
  { value: 'critico',  label: 'Crítico' },
];

export default function EventForm({ step, allUnits, allIncidents, onChange, onSave }) {
  function setParam(key, value) {
    onChange({ ...step, params: { ...step.params, [key]: value } });
  }

  function setField(key, value) {
    onChange({ ...step, [key]: value });
  }

  const unitOptions = allUnits.map(u => ({ value: u.id, label: `${u.name} (${u.id})` }));
  const incidentOptions = allIncidents.map(i => ({ value: i.id, label: `${i.name} (${i.id})` }));

  return (
    <div className="event-form">
      <div className="event-form-field">
        <label className="event-form-label">Tipo</label>
        <CustomSelect
          value={step.type}
          onChange={v => onChange({ ...step, type: v, params: {} })}
          options={TYPE_OPTIONS}
          placeholder="Selecionar tipo"
        />
      </div>

      <div className="event-form-field">
        <label className="event-form-label">Descrição (mostrada no player)</label>
        <input
          className="event-form-input"
          value={step.label || ''}
          onChange={e => setField('label', e.target.value)}
          placeholder="Ex: Incêndio declarado em Serra da Estrela"
        />
      </div>

      {/* Type-specific param fields */}
      {step.type === 'narrative' && (
        <div className="event-form-field">
          <label className="event-form-label">Texto de narrativa</label>
          <textarea className="event-form-input" rows={3}
            value={step.params?.text || ''}
            onChange={e => setParam('text', e.target.value)}
            placeholder="Nota de contexto para o apresentador" />
        </div>
      )}

      {step.type === 'create_incident' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Nome</label>
          <input className="event-form-input" value={step.params?.name || ''}
            onChange={e => setParam('name', e.target.value)} placeholder="Ex: Serra da Estrela" />
        </div>
        <div className="event-form-row">
          <div className="event-form-field">
            <label className="event-form-label">Latitude</label>
            <input className="event-form-input" type="number" step="0.001"
              value={step.params?.lat || ''} onChange={e => setParam('lat', parseFloat(e.target.value))} />
          </div>
          <div className="event-form-field">
            <label className="event-form-label">Longitude</label>
            <input className="event-form-input" type="number" step="0.001"
              value={step.params?.lng || ''} onChange={e => setParam('lng', parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Estado inicial</label>
          <CustomSelect value={step.params?.status} onChange={v => setParam('status', v)}
            options={STATUS_OPTIONS} placeholder="Selecionar estado" />
        </div>
      </>)}

      {step.type === 'assign_unit' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Meio</label>
          <CustomSelect value={step.params?.unitId} onChange={v => setParam('unitId', v)}
            options={unitOptions} placeholder="Selecionar meio" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência de destino</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
      </>)}

      {step.type === 'update_incident_status' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Novo estado</label>
          <CustomSelect value={step.params?.status} onChange={v => setParam('status', v)}
            options={STATUS_OPTIONS} placeholder="Selecionar estado" />
        </div>
      </>)}

      {step.type === 'close_road' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Nome do corte</label>
          <input className="event-form-input" value={step.params?.name || ''}
            onChange={e => setParam('name', e.target.value)} placeholder="Ex: EN267 sentido norte" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incident} onChange={v => setParam('incident', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Coordenadas (lat,lng por linha)</label>
          <textarea className="event-form-input" rows={4}
            value={(step.params?.path || []).map(p => p.join(',')).join('\n')}
            onChange={e => {
              const path = e.target.value.split('\n')
                .map(l => l.split(',').map(Number))
                .filter(p => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]))
              setParam('path', path)
            }}
            placeholder="40.321,-7.612&#10;40.325,-7.615" />
        </div>
      </>)}

      {step.type === 'create_alert' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Título</label>
          <input className="event-form-input" value={step.params?.title || ''}
            onChange={e => setParam('title', e.target.value)} />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Mensagem</label>
          <textarea className="event-form-input" rows={2} value={step.params?.message || ''}
            onChange={e => setParam('message', e.target.value)} />
        </div>
        <div className="event-form-row">
          <div className="event-form-field">
            <label className="event-form-label">Nível</label>
            <CustomSelect value={step.params?.level} onChange={v => setParam('level', v)}
              options={LEVEL_OPTIONS} placeholder="Nível" />
          </div>
          <div className="event-form-field">
            <label className="event-form-label">Raio (km)</label>
            <input className="event-form-input" type="number" min="0"
              value={step.params?.radius || ''} onChange={e => setParam('radius', parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
      </>)}

      {step.type === 'send_radio' && (<>
        <div className="event-form-row">
          <div className="event-form-field">
            <label className="event-form-label">De (from)</label>
            <input className="event-form-input" value={step.params?.from || ''}
              onChange={e => setParam('from', e.target.value)} placeholder="Ex: COS Serra da Estrela" />
          </div>
          <div className="event-form-field">
            <label className="event-form-label">Para (to)</label>
            <input className="event-form-input" value={step.params?.to || ''}
              onChange={e => setParam('to', e.target.value)} placeholder="Ex: Todos" />
          </div>
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Prioridade</label>
          <CustomSelect value={step.params?.priority} onChange={v => setParam('priority', v)}
            options={PRIORITY_OPTIONS} placeholder="Normal" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Mensagem</label>
          <textarea className="event-form-input" rows={3} value={step.params?.message || ''}
            onChange={e => setParam('message', e.target.value)}
            placeholder="Ex: Solicito reforço no setor Alfa." />
        </div>
      </>)}

      <button className="event-form-save" onClick={onSave}>Guardar</button>
    </div>
  );
}
