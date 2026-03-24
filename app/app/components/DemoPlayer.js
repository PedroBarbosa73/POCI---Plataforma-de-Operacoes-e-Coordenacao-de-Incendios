'use client';

export default function DemoPlayer({ steps, currentStep, onNext, onPrev, onTerminate, onReset, presentationMode, onTogglePresentation }) {
  const executedStep = steps[currentStep - 1]
  const isDone = currentStep >= steps.length
  const isFirst = currentStep === 0

  return (
    <div className="demo-player">
      <span className="demo-player-badge">🎬 DEMO</span>
      <div className="demo-player-divider" />
      <span className="demo-player-counter">{currentStep} / {steps.length}</span>
      <div className="demo-player-divider" />
      <span className="demo-player-label">
        {currentStep === 0 ? 'Pronto para iniciar' : (executedStep?.label || '—')}
      </span>
      <div className="demo-player-controls">
        <button
          className="demo-player-btn"
          disabled={isFirst}
          onClick={onPrev}
        >
          ← Anterior
        </button>
        {isDone ? (
          <span className="demo-player-done">Concluído ✓</span>
        ) : (
          <button className="demo-player-btn demo-player-btn-primary" onClick={onNext}>
            Próximo →
          </button>
        )}
        <button className="demo-player-btn" onClick={onReset}>
          ↺ Reiniciar
        </button>
        <button className="demo-player-btn" onClick={onTogglePresentation}>
          {presentationMode ? '✕ Ecrã' : '⛶ Ecrã'}
        </button>
        <button className="demo-player-btn demo-player-btn-danger" onClick={onTerminate}>
          ✕ Terminar
        </button>
      </div>
    </div>
  )
}
