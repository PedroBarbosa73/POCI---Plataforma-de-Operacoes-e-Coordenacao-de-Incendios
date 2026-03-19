'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
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

export default function DemoPage() {
  const { status } = useSession();
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

  if (status === 'loading') return null;
  if (status === 'unauthenticated') redirect('/login');

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

  function handleStartDemo() {
    startScenario();
    router.push('/comando');
  }

  return (
    <div className="demo-page">
      <div className="demo-page-left">
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
            allIncidents={allIncidents}
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
