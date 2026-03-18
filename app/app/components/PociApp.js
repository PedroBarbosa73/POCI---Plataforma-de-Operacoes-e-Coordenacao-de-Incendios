'use client';

import { useMemo, useRef, useState } from 'react';
import { incidents, closures, alerts, weather, initialZones } from '../data/mockData';
import { usePociState } from '../lib/usePociState';
import AppHeader from './AppHeader';
import MapView from './MapView';
import DrawModal from './DrawModal';
import ZoneModal from './ZoneModal';
import PublicSidebar from './PublicSidebar';
import PanelDock from './PanelDock';
import IncidentsPanel from './panels/IncidentsPanel';
import ZonesPanel from './panels/ZonesPanel';
import ClosuresPanel from './panels/ClosuresPanel';
import UnitsPanel from './panels/UnitsPanel';
import AlertsPanel from './panels/AlertsPanel';
import WeatherPanel from './panels/WeatherPanel';
import RadioPanel from './panels/RadioPanel';
import IncidentDetail from './IncidentDetail';
import NovaOcorrenciaModal from './NovaOcorrenciaModal';

export default function PociApp({ mode = 'command', lockView = false }) {
  const {
    customIncidents, setCustomIncidents,
    drawnZonesByIncident, setDrawnZonesByIncident,
    drawnClosures, setDrawnClosures,
    demoMode, setDemoMode,
    unitAssignments, unitStatuses,
    assignUnit, unassignUnit,
    allUnits, unitsByIncident,
  } = usePociState()

  const [view, setView] = useState(lockView ? mode : 'command');
  const isPublic = view === 'public';

  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedClosureId, setSelectedClosureId] = useState(null);

  const [showZones, setShowZones] = useState(true);
  const [pendingDraw, setPendingDraw] = useState(null);
  const [placingIncident, setPlacingIncident] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState(null);

  const zonesByIncident = useMemo(() => {
    const merged = { ...initialZones };
    Object.entries(drawnZonesByIncident).forEach(([id, zones]) => {
      merged[id] = [...(merged[id] || []), ...zones];
    });
    return merged;
  }, [drawnZonesByIncident]);
  const [visiblePanels, setVisiblePanels] = useState({
    incidents: true, zones: true, closures: true,
    units: true, alerts: true, weather: true, radio: true,
  });

  function togglePanel(id) {
    setVisiblePanels((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const mapRef = useRef(null);

  const allIncidents = useMemo(() => [...incidents, ...customIncidents], [customIncidents]);

  const incidentCounts = useMemo(() => {
    const counts = { active: 0, controlled: 0, surveillance: 0 };
    allIncidents.forEach((inc) => {
      if (counts[inc.status] !== undefined) counts[inc.status] += 1;
    });
    return counts;
  }, [allIncidents]);

  const visibleIncidents = useMemo(() => {
    if (!selectedIncidentId) return allIncidents;
    return allIncidents.filter((inc) => inc.id === selectedIncidentId);
  }, [selectedIncidentId, allIncidents]);

  const visibleUnits = useMemo(() => {
    if (!selectedIncidentId) return allUnits;
    return unitsByIncident(selectedIncidentId);
  }, [selectedIncidentId, allUnits, unitAssignments]);

  const visibleClosures = useMemo(() => {
    const allClosures = [...closures, ...drawnClosures];
    if (!selectedIncidentId) return allClosures;
    return allClosures.filter((c) => c.incident === selectedIncidentId);
  }, [selectedIncidentId, drawnClosures]);

  const visibleZones = useMemo(() => {
    if (!selectedIncidentId) return [];
    return zonesByIncident[selectedIncidentId] || [];
  }, [selectedIncidentId, zonesByIncident]);

  const selectedIncident = useMemo(
    () => allIncidents.find((inc) => inc.id === selectedIncidentId) || null,
    [selectedIncidentId, allIncidents]
  );

  function handleSelectIncident(id) {
    setSelectedIncidentId(id);
    setSelectedUnitId(null);
    mapRef.current?.focusIncident(id);
  }

  function handleClearSelection() {
    setSelectedIncidentId(null);
    setSelectedUnitId(null);
  }

  function handleSelectUnit(id) {
    setSelectedUnitId(id);
    const incidentId = unitAssignments[id]
    if (incidentId) setSelectedIncidentId(incidentId)
    mapRef.current?.focusUnit(id);
  }

  function handleSelectClosure(id) {
    setSelectedClosureId(id);
    mapRef.current?.focusClosure(id);
  }

  function handleDeleteDrawnZone(zoneId) {
    setDrawnZonesByIncident((prev) => {
      const updated = {};
      Object.entries(prev).forEach(([incId, zones]) => {
        updated[incId] = zones.filter((z) => z.id !== zoneId);
      });
      return updated;
    });
  }

  function handleDeleteDrawnClosure(closureId) {
    setDrawnClosures((prev) => prev.filter((c) => c.id !== closureId));
  }

  function handleNovaOcorrenciaClick() {
    setPlacingIncident(true);
  }

  function handlePlaceIncident({ lat, lng }) {
    setPlacingIncident(false);
    setPendingPlacement({ lat, lng });
  }

  function handleNovaOcorrenciaSave(data) {
    const newInc = {
      id: `CUST-${Date.now()}`,
      name: data.name,
      area: data.area,
      status: data.status,
      lat: data.lat,
      lng: data.lng,
      updated: 'agora',
    };
    setCustomIncidents((prev) => [...prev, newInc]);
    setPendingPlacement(null);
  }

  function handleDrawComplete({ mode, points }) {
    setPendingDraw({ mode, points });
  }

  function handleDrawSave(data) {
    if (!pendingDraw) return;
    if (pendingDraw.mode === 'zone' && selectedIncidentId) {
      setDrawnZonesByIncident((prev) => {
        const list = prev[selectedIncidentId] ? [...prev[selectedIncidentId]] : [];
        list.push({ id: `Z-${Date.now()}`, name: data.name, type: data.type, points: pendingDraw.points });
        return { ...prev, [selectedIncidentId]: list };
      });
    } else if (pendingDraw.mode === 'closure' && selectedIncidentId) {
      setDrawnClosures((prev) => [
        ...prev,
        {
          id: `CR-${Date.now()}`,
          name: data.name,
          status: data.status,
          incident: selectedIncidentId,
          path: pendingDraw.points,
        },
      ]);
    }
    setPendingDraw(null);
  }

  return (
    <div className="app-wrapper">
      <AppHeader lockView={lockView} isPublic={isPublic} view={view} setView={setView} incidentCounts={incidentCounts} unitCount={visibleUnits.length} totalUnitCount={allUnits.length} selectedIncidentId={selectedIncidentId} onNovaOcorrencia={handleNovaOcorrenciaClick} />

      <section className="map-area">
        <MapView
          ref={mapRef}
          selectedIncidentId={selectedIncidentId}
          selectedUnitId={selectedUnitId}
          isPublic={isPublic}
          zonesByIncident={zonesByIncident}
          showZones={showZones}
          isCommandView={!isPublic}
          onDrawComplete={handleDrawComplete}
          onShowZonesChange={setShowZones}
          drawnClosures={drawnClosures}
          placingIncident={placingIncident}
          onPlaceIncident={handlePlaceIncident}
          customIncidents={customIncidents}
          unitStatuses={unitStatuses}
          allUnits={allUnits}
        />

        {/* ── Left sidebar ── */}
        <aside className="sidebar sidebar-left">
          {!isPublic && selectedIncidentId ? (
            <IncidentDetail
              incident={selectedIncident}
              units={visibleUnits}
              closures={visibleClosures}
              zones={visibleZones}
              weather={weather}
              onClose={handleClearSelection}
              visiblePanels={visiblePanels}
              onDeleteZone={handleDeleteDrawnZone}
              onDeleteClosure={handleDeleteDrawnClosure}
              drawnClosureIds={new Set(drawnClosures.map((c) => c.id))}
              unitStatuses={unitStatuses}
            />
          ) : (
            <>
              {visiblePanels.incidents && (
                <IncidentsPanel
                  incidents={visibleIncidents}
                  allCount={allIncidents.length}
                  selectedIncidentId={selectedIncidentId}
                  selectedIncident={selectedIncident}
                  onSelectIncident={handleSelectIncident}
                  onClearSelection={handleClearSelection}
                  isPublic={isPublic}
                />
              )}
              {!isPublic && selectedIncidentId && visiblePanels.zones && <ZonesPanel zones={visibleZones} />}
              {!isPublic && selectedIncidentId && visiblePanels.closures && (
                <ClosuresPanel
                  closures={visibleClosures}
                  selectedClosureId={selectedClosureId}
                  onSelectClosure={handleSelectClosure}
                />
              )}
              {!isPublic && visiblePanels.radio && <RadioPanel />}
            </>
          )}
        </aside>

        {/* ── Right sidebar ── */}
        {isPublic ? (
          <PublicSidebar
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={handleSelectIncident}
          />
        ) : (
          <aside className="sidebar sidebar-right">
            {visiblePanels.units && (
              <UnitsPanel
                units={visibleUnits}
                allUnits={allUnits}
                allCount={visibleUnits.length}
                totalCount={selectedIncidentId ? allUnits.length : null}
                selectedUnitId={selectedUnitId}
                demoMode={demoMode}
                onToggleDemoMode={() => setDemoMode((d) => !d)}
                onSelectUnit={handleSelectUnit}
                unitStatuses={unitStatuses}
              />
            )}
            {selectedIncidentId && visiblePanels.alerts && <AlertsPanel alerts={alerts} />}
          </aside>
        )}

        {!isPublic && (
          <PanelDock visiblePanels={visiblePanels} onToggle={togglePanel} selectedIncidentId={selectedIncidentId} />
        )}

      </section>

      <DrawModal
        mode={pendingDraw?.mode ?? null}
        onSave={handleDrawSave}
        onCancel={() => setPendingDraw(null)}
      />
      <NovaOcorrenciaModal
        placement={pendingPlacement}
        onSave={handleNovaOcorrenciaSave}
        onCancel={() => setPendingPlacement(null)}
      />
    </div>
  );
}
