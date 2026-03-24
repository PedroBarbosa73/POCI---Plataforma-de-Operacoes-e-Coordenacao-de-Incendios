export function statusBadge(status) {
  switch (status) {
    case 'active': return 'badge badge-active';
    case 'controlled': return 'badge badge-controlled';
    case 'resolved': return 'badge badge-resolved';
    case 'surveillance': return 'badge badge-surveillance';
    default: return 'badge';
  }
}

export function incidentStatusLabel(status) {
  switch (status) {
    case 'active': return 'Ativo';
    case 'controlled': return 'Controlado';
    case 'resolved': return 'Resolvido';
    case 'surveillance': return 'Vigilância';
    default: return status;
  }
}

export function unitBadge(status) {
  switch (status) {
    case 'available': return 'badge badge-available';
    case 'enroute': return 'badge badge-enroute';
    case 'onscene': return 'badge badge-onscene';
    case 'assigned': return 'badge badge-assigned';
    default: return 'badge';
  }
}

export function unitStatusLabel(status) {
  switch (status) {
    case 'available': return 'Disponível';
    case 'enroute': return 'Em deslocação';
    case 'onscene': return 'Em ocorrência';
    case 'assigned': return 'Atribuída';
    default: return status;
  }
}

export function alertBadge(level) {
  switch (level) {
    case 'critical': return 'badge badge-critical';
    case 'high': return 'badge badge-high';
    case 'medium': return 'badge badge-medium';
    case 'low': return 'badge badge-low';
    default: return 'badge';
  }
}

export function alertLevelLabel(level) {
  switch (level) {
    case 'critical': return 'Crítico';
    case 'high': return 'Alto';
    case 'medium': return 'Médio';
    case 'low': return 'Baixo';
    default: return level;
  }
}

export function closureStatusLabel(status) {
  switch (status) {
    case 'active': return 'Ativo';
    case 'planned': return 'Previsto';
    case 'reopened': return 'Reaberto';
    default: return status;
  }
}
