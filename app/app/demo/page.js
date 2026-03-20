'use client';

import { useEffect, useState } from 'react';
import { useSupabaseUser } from '../lib/useSupabaseUser';
import { redirect, useRouter } from 'next/navigation';
import { usePociState } from '../lib/usePociState';
import ScriptEditor from '../components/ScriptEditor';
import EventForm from '../components/EventForm';

function makeStep(type = 'narrative') {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: '',
    params: {},
  };
}

function makeId() {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildExampleScript() {
  const incId = makeId();
  const u = (unitId, label) => ({ id: makeId(), type: 'assign_unit', label, params: { unitId, incidentId: incId } });
  const r = (from, msg, priority = 'normal') => ({ id: makeId(), type: 'send_radio', label: `Rádio — ${from}`, params: { from, to: 'CDOS Guarda', priority, incidentId: incId, message: msg } });

  return [
    // ── ABERTURA ──────────────────────────────────────────────────────────────
    { id: makeId(), type: 'narrative', label: 'Bem-vindos à demonstração POCI',
      params: { text: 'Plataforma Operacional de Coordenação de Incêndios — simulação de incêndio florestal em tempo real.' } },

    // ── DEFLAGRAÇÃO ───────────────────────────────────────────────────────────
    { id: incId, type: 'create_incident', label: 'Incêndio deflagra em Manteigas',
      params: { name: 'Incêndio Manteigas', lat: 40.3945, lng: -7.5412, status: 'active', area: 'Serra da Estrela', brushRadiusKm: 3 } },
    r('CDOS Guarda', 'Alerta confirmado em Manteigas. Duas frentes activas. Activação de 1º alarme.', 'urgente'),

    // ── 1º ALARME — 8 meios ───────────────────────────────────────────────────
    u('BV-034-05', 'B.V. Manteigas — 1º chegada'),
    u('BV-034-03', 'B.V. Seia em deslocação'),
    u('BV-034-04', 'B.V. Gouveia em deslocação'),
    u('GNR-034-01', 'GNR Guarda — corte de trânsito'),
    u('GNR-034-02', 'GNR Seia — evacuação'),
    u('ANC-034-01', 'ANEPC assume COS'),
    u('LOG-034-01', 'Logística 01 — ponto de apoio'),
    u('PCM-034-01', 'SMPC Manteigas activado'),
    r('BV-034-05', 'No local. Fogo com 2 frentes, vento NE forte. Solicito reforço imediato.', 'urgente'),
    { id: makeId(), type: 'create_alert', label: 'Alerta vermelho — evacuação imediata',
      params: { title: 'Evacuação Imediata', message: 'Evacuação obrigatória de Sameiro e Vale Formoso. Fogo em progressão rápida para NW.', level: 'critical', radius: 8, incidentId: incId } },
    { id: makeId(), type: 'close_road', label: 'EN232 cortada — acesso norte',
      params: { name: 'EN232 Acesso Norte', incident: incId, path: [[40.420, -7.540], [40.408, -7.532], [40.395, -7.520]] } },
    r('GNR-034-01', 'EN232 cortada. Desvio activo por CM1047. Evacuação em curso, população a cooperar.'),

    // ── 2º ALARME — reforço +12 meios (total 20) ──────────────────────────────
    { id: makeId(), type: 'narrative', label: '2º alarme activado — reforço geral',
      params: { text: 'CDOS Guarda activa 2º alarme. Reforço de meios terrestres e aéreos.' } },
    u('BV-034-01', 'B.V. Guarda — sector leste'),
    u('BV-034-02', 'B.V. Covilhã — sector sul'),
    u('BV-034-06', 'B.V. Belmonte em deslocação'),
    u('BV-034-07', 'B.V. Fundão em deslocação'),
    u('GNR-034-03', 'GNR Covilhã — perímetro sul'),
    u('GNR-034-04', 'GNR Fundão — perímetro oeste'),
    u('ANC-034-02', 'ANEPC Covilhã — sector B'),
    u('LOG-034-02', 'Logística 02 — abastecimento'),
    u('PCM-034-02', 'SMPC Seia activado'),
    u('AER-034-01', 'Kamov 01 — reconhecimento aéreo'),
    u('AER-034-02', 'Canadair 01 — 1ª largada'),
    u('AER-034-03', 'Kamov 02 — apoio sector A'),
    r('AER-034-01', 'Frente principal avança NW a ~3km/h. Zona de rebentamento identificada. Inicio de largada.', 'urgente'),
    { id: makeId(), type: 'create_alert', label: 'Alerta vento — risco extremo',
      params: { title: 'Vento Forte — Risco Extremo', message: 'Rajadas até 75 km/h nas próximas 3h. Risco de propagação acelerada para concelhos vizinhos.', level: 'critical', radius: 20, incidentId: incId } },
    { id: makeId(), type: 'close_road', label: 'EN338 cortada — acesso sul',
      params: { name: 'EN338 Acesso Sul', incident: incId, path: [[40.372, -7.558], [40.361, -7.544]] } },

    // ── 3º ALARME — mobilização total +18 meios (total 38) ────────────────────
    { id: makeId(), type: 'narrative', label: '3º alarme — mobilização total',
      params: { text: 'Situação crítica. ANPC activa 3º alarme. Mobilização de todos os meios disponíveis na região.' } },
    u('BV-034-08', 'B.V. Trancoso — sector norte'),
    u('BV-034-09', 'B.V. Celorico — sector nordeste'),
    u('BV-034-10', 'B.V. Pinhel em deslocação'),
    u('BV-034-11', 'B.V. Sabugal em deslocação'),
    u('BV-034-12', 'B.V. Guarda 2 — reforço leste'),
    u('GNR-034-05', 'GNR Trancoso — perímetro norte'),
    u('GNR-034-06', 'GNR Celorico — controlo de acessos'),
    u('GNR-034-07', 'GNR Sabugal — evacuação preventiva'),
    u('ANC-034-03', 'ANEPC Guarda — logística avançada'),
    u('ANC-034-04', 'ANEPC Covilhã 2 — sector C'),
    u('LOG-034-03', 'Logística 03 — ponto avançado norte'),
    u('LOG-034-04', 'Logística 04 — abastecimento aéreo'),
    u('PCM-034-03', 'SMPC Gouveia activado'),
    u('PCM-034-04', 'SMPC Covilhã activado'),
    u('AER-034-04', 'Canadair 02 — 2ª largada'),
    u('AER-034-05', 'Kamov 03 — coordenação sectores'),
    r('ANC-034-01', 'Assumo coordenação geral. Sector A: BV Manteigas/Seia/Gouveia. Sector B: BV Covilhã/Guarda. Sector C: BV Trancoso/Celorico. Aéreos em rotação contínua.', 'urgente'),
    r('AER-034-02', 'Largada completa Sector A, 6000L zona de rebentamento. A regressar para reabastecimento. ETA 12min.'),
    { id: makeId(), type: 'close_road', label: 'IC6 condicionado — desvio obrigatório',
      params: { name: 'IC6 Condicionamento', incident: incId, path: [[40.350, -7.500], [40.340, -7.480], [40.330, -7.460]] } },
    { id: makeId(), type: 'create_alert', label: 'Alerta qualidade do ar — região Centro',
      params: { title: 'Fumo Intenso — Qualidade do Ar', message: 'Fumo denso sobre a Serra da Estrela e concelhos vizinhos. População deve fechar janelas e evitar exterior.', level: 'high', radius: 35, incidentId: incId } },

    // ── REFORÇO FINAL +12 meios (total 50) ───────────────────────────────────
    { id: makeId(), type: 'narrative', label: 'Reforço final — 50 meios no terreno',
      params: { text: 'Mobilização completa. 50 meios no terreno. Plataforma POCI a coordenar em tempo real.' } },
    u('BV-034-13', 'B.V. Mangualde — reforço oeste'),
    u('BV-034-14', 'B.V. Nelas em deslocação'),
    u('BV-034-15', 'B.V. Viseu — reforço norte'),
    u('BV-034-16', 'B.V. Tondela em deslocação'),
    u('GNR-034-08', 'GNR Mangualde — perímetro oeste'),
    u('GNR-034-09', 'GNR Viseu — controlo IC'),
    u('ANC-034-05', 'ANEPC Nacional — supervisão'),
    u('ANC-034-06', 'ANEPC Viseu — sector D'),
    u('LOG-034-05', 'Logística 05 — posto médico avançado'),
    u('LOG-034-06', 'Logística 06 — reabastecimento aéreo'),
    u('PCM-034-05', 'SMPC Viseu activado'),
    u('PCM-034-06', 'SMPC Mangualde activado'),
    r('ANC-034-05', '50 meios no terreno. Frente principal estabilizada. Sector B em controlo. Reforços a cobrir sectores C e D.', 'urgente'),
    r('AER-034-04', 'Largada completa Sector B, 6000L. Canadair 01 já de regresso. Rotação contínua garantida.'),

    // ── CONTROLO ─────────────────────────────────────────────────────────────
    { id: makeId(), type: 'update_incident_status', label: 'Fogo em fase de controlo',
      params: { incidentId: incId, status: 'controlled' } },
    r('ANC-034-01', 'Frente principal dominada. Sectores A e B controlados. C e D em resolução. Manter todos os meios. Excelente trabalho de equipa.'),
    { id: makeId(), type: 'create_alert', label: 'Evacuação parcialmente levantada',
      params: { title: 'Evacuação Parcialmente Levantada', message: 'Vale Formoso pode regressar. Sameiro e Aldeia Nova mantêm evacuação até nova ordem das autoridades.', level: 'medium', radius: 5, incidentId: incId } },

    // ── ENCERRAMENTO ─────────────────────────────────────────────────────────
    { id: makeId(), type: 'narrative', label: 'Demonstração concluída',
      params: { text: 'POCI coordenou em tempo real: 50 meios (44 terrestres + 6 aéreos), 3 cortes de estrada, 4 alertas e 12 comunicações de rádio — tudo numa única plataforma.' } },
  ];
}

export default function DemoPage() {
  const { user, loading } = useSupabaseUser()
  const router = useRouter();
  const { allUnits, allIncidents, startScenario } = usePociState();

  const [steps, setSteps] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [draftStep, setDraftStep] = useState(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('poci_scenario');
      if (raw) setSteps(JSON.parse(raw));
    } catch {}
  }, []);

  // Auto-save on every change
  useEffect(() => {
    try { localStorage.setItem('poci_scenario', JSON.stringify(steps)); } catch {}
  }, [steps]);

  if (loading) return null
  if (!user) { redirect('/login'); return null }

  function handleAdd() {
    const step = makeStep('narrative');
    const newSteps = [...steps, step];
    setSteps(newSteps);
    setSelectedIndex(newSteps.length - 1);
    setDraftStep({ ...step });
  }

  function handleSelect(i) {
    setSelectedIndex(i);
    setDraftStep({ ...steps[i] });
  }

  function handleSave() {
    if (selectedIndex === null || !draftStep) return;
    const updated = [...steps];
    updated[selectedIndex] = draftStep;
    setSteps(updated);
  }

  function handleDelete(i) {
    const updated = steps.filter((_, idx) => idx !== i);
    setSteps(updated);
    if (selectedIndex === i) { setSelectedIndex(null); setDraftStep(null); }
    else if (selectedIndex > i) setSelectedIndex(selectedIndex - 1);
  }

  function handleMoveUp(i) {
    if (i === 0) return;
    const updated = [...steps];
    [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
    setSteps(updated);
    if (selectedIndex === i) setSelectedIndex(i - 1);
    else if (selectedIndex === i - 1) setSelectedIndex(i);
  }

  function handleMoveDown(i) {
    if (i === steps.length - 1) return;
    const updated = [...steps];
    [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
    setSteps(updated);
    if (selectedIndex === i) setSelectedIndex(i + 1);
    else if (selectedIndex === i + 1) setSelectedIndex(i);
  }

  function handleLoadExample() {
    const example = buildExampleScript();
    setSteps(example);
    setSelectedIndex(null);
    setDraftStep(null);
  }

  function handleStartDemo() {
    startScenario();
    router.push('/comando');
  }

  return (
    <div className="demo-page">
      <div className="demo-page-left">
        <button className="demo-example-btn" onClick={handleLoadExample}>
          Carregar Exemplo
        </button>
        <ScriptEditor
          steps={steps}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />
        <button
          className="demo-start-btn"
          disabled={steps.length === 0}
          onClick={handleStartDemo}
        >
          Iniciar Demo →
        </button>
      </div>

      <div className="demo-page-right">
        {draftStep ? (
          <EventForm
            step={draftStep}
            allUnits={allUnits}
            allIncidents={[
              ...allIncidents,
              ...steps
                .filter(s => s.type === 'create_incident' && s.params?.name)
                .filter(s => !allIncidents.find(i => i.id === s.id))
                .map(s => ({ id: s.id, name: s.params.name })),
            ]}
            onChange={setDraftStep}
            onSave={handleSave}
          />
        ) : (
          <div className="demo-page-empty">
            Seleciona um evento para editar, ou adiciona um novo.
          </div>
        )}
      </div>
    </div>
  );
}
