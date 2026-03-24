// ── Seeded RNG (mulberry32) for reproducible unit generation ─────────────────
function mulberry32(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function strSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h) + 1;
}

// ── Town names by region ─────────────────────────────────────────────────────
const TOWNS = {
  'INC-034': [
    'Guarda', 'Covilhã', 'Gouveia', 'Seia', 'Belmonte', 'Manteigas', 'Fundão',
    'Celorico', 'Trancoso', 'Pinhel', 'Sabugal', 'Penamacor', 'Almeida',
    'Aguiar', 'Fornos', 'Meda', 'Nelas', 'Viseu', 'Lamego', 'Tábua',
    'Arganil', 'Pampilhosa', 'Lousã', 'Moimenta', 'Penedono',
    'Figueira', 'Oliveira', 'Mortágua', 'Santa Comba', 'Tondela',
  ],
  'INC-031': [
    'Monchique', 'Portimão', 'Silves', 'Lagos', 'Loulé', 'Albufeira',
    'Sagres', 'Aljezur', 'Olhão', 'Tavira', 'Faro', 'São Brás',
    'Alte', 'Odemira', 'Aljustrel', 'Beja', 'Mértola', 'Castro Verde',
    'Almodôvar', 'Alcoutim', 'Messines', 'Lagoa', 'Quarteira', 'Almancil', 'Salir',
    'Moncarapacho', 'Estói', 'Cacela', 'Vila Real', 'Tavira',
  ],
  'INC-029': [
    'Castelo Branco', 'Covilhã', 'Fundão', 'Idanha', 'Proença', 'Sertã',
    'Vila de Rei', 'Mação', 'Oleiros', 'Penamacor', 'Belmonte',
    'Tomar', 'Abrantes', 'Portalegre', 'Gavião', 'Alvega',
    'Pedrogão', 'Ansião', 'Ferreira', 'Sardoal', 'Constância',
    'Entroncamento', 'Figueiró', 'Góis', 'Arganil',
    'Pampilhosa', 'Soure', 'Condeixa', 'Coimbra', 'Leiria',
  ],
  'INC-026': [
    'Viseu', 'Lamego', 'Mangualde', 'Nelas', 'Penalva', 'Sernancelhe',
    'Trancoso', 'Aguiar', 'Castro Daire', 'Cinfães',
    'Resende', 'Armamar', 'Tarouca', 'Moimenta', 'Vila Nova de Paiva',
    'Sátão', 'Santa Comba', 'Oliveira de Frades', 'São Pedro', 'Mortágua',
  ],
};

// ── Status distribution by incident status ───────────────────────────────────
const STATUS_DIST = {
  active:      [['onscene', 0.50], ['enroute', 0.30], ['assigned', 0.20]],
  controlled:  [['onscene', 0.20], ['assigned', 0.45], ['available', 0.35]],
  surveillance:[['onscene', 0.10], ['assigned', 0.35], ['available', 0.55]],
  resolved:    [['available', 0.80], ['assigned', 0.20]],
};

function pickStatus(r, dist) {
  let cum = 0;
  for (const [s, p] of dist) { cum += p; if (r < cum) return s; }
  return dist[dist.length - 1][0];
}

// ── Unit generator ───────────────────────────────────────────────────────────
function generateUnits(incidentId, lat, lng, incidentStatus, count = 100) {
  const towns = TOWNS[incidentId] || TOWNS['INC-034'];
  const dist = STATUS_DIST[incidentStatus] || STATUS_DIST.active;
  const rand = mulberry32(strSeed(incidentId));

  // Build type queue [bombeiros×40, gnr×20, anepc×15, municipal×10, air×5, other×10]
  const typeQueue = [
    ...Array(40).fill('bombeiros'),
    ...Array(20).fill('gnr'),
    ...Array(15).fill('anepc'),
    ...Array(10).fill('municipal'),
    ...Array(5).fill('air'),
    ...Array(10).fill('other'),
  ];
  for (let i = typeQueue.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = typeQueue[i]; typeQueue[i] = typeQueue[j]; typeQueue[j] = tmp;
  }

  const units = [];
  const counters = {};

  for (let i = 0; i < count; i++) {
    const type = typeQueue[i % typeQueue.length];
    counters[type] = (counters[type] || 0) + 1;
    const n = counters[type];

    const status = pickStatus(rand(), dist);

    // Scatter radius: onscene = tight, enroute = medium, other = wider
    const maxDeg = status === 'onscene' ? 0.18 : status === 'enroute' ? 0.45 : 0.65;
    const angle = rand() * Math.PI * 2;
    const r = rand() * maxDeg;
    const unitLat = lat + Math.sin(angle) * r;
    const unitLng = lng + Math.cos(angle) * r;

    const town = towns[(n - 1) % towns.length];
    const repeat = Math.floor((n - 1) / towns.length);
    const suffix = repeat > 0 ? ` ${repeat + 1}` : '';

    let name, id, airKind;
    const pad = String(n).padStart(2, '0');
    const inc = incidentId.slice(-3);

    if (type === 'bombeiros') {
      name = `B.V. ${town}${suffix}`;
      id = `BV-${inc}-${pad}`;
    } else if (type === 'gnr') {
      name = `GNR ${town}${suffix}`;
      id = `GNR-${inc}-${pad}`;
    } else if (type === 'anepc') {
      name = `ANEPC ${town}${suffix}`;
      id = `ANC-${inc}-${pad}`;
    } else if (type === 'municipal') {
      name = `SMPC ${town}${suffix}`;
      id = `PCM-${inc}-${pad}`;
    } else if (type === 'air') {
      airKind = rand() > 0.4 ? 'helicopter' : 'plane';
      name = airKind === 'plane' ? `Canadair ${pad}` : `Kamov ${pad}`;
      id = `AER-${inc}-${pad}`;
    } else {
      name = `Logística ${pad}`;
      id = `LOG-${inc}-${pad}`;
    }

    const unit = { id, name, type, status, incident: incidentId, lat: unitLat, lng: unitLng };
    if (airKind) unit.airKind = airKind;
    units.push(unit);
  }

  return units;
}

// ── Incidents ────────────────────────────────────────────────────────────────
export const incidents = [
  {
    id: 'INC-034',
    name: 'Serra da Estrela',
    status: 'active',
    area: 'Guarda',
    updated: 'há 3 min',
    units: 100,
    lat: 40.321,
    lng: -7.612,
    brushRadiusKm: 22,
    communications: [
      { id: 'COMM-034-01', name: 'COS Serra da Estrela', role: 'cos' },
      { id: 'COMM-034-02', name: 'TO Guarda', role: 'to' },
    ],
  },
  {
    id: 'INC-031',
    name: 'Monchique',
    status: 'controlled',
    area: 'Faro',
    updated: 'há 18 min',
    units: 100,
    lat: 37.315,
    lng: -8.555,
    brushRadiusKm: 18,
    communications: [
      { id: 'COMM-031-01', name: 'COS Monchique', role: 'cos' },
      { id: 'COMM-031-02', name: 'TO Portimão', role: 'to' },
    ],
  },
  {
    id: 'INC-029',
    name: 'Castelo Branco',
    status: 'surveillance',
    area: 'Castelo Branco',
    updated: 'há 42 min',
    units: 100,
    lat: 39.822,
    lng: -7.49,
    brushRadiusKm: 16,
    communications: [
      { id: 'COMM-029-01', name: 'COS Castelo Branco', role: 'cos' },
      { id: 'COMM-029-02', name: 'TO Fundão', role: 'to' },
    ],
  },
  {
    id: 'INC-026',
    name: 'Viseu Norte',
    status: 'resolved',
    area: 'Viseu',
    updated: 'há 2 h',
    units: 0,
    lat: 40.75,
    lng: -7.88,
    communications: [
      { id: 'COMM-026-01', name: 'COS Viseu Norte', role: 'cos' },
    ],
  },
];

// ── Units (generated) ────────────────────────────────────────────────────────
export const units = [
  ...generateUnits('INC-034', 40.321, -7.612, 'active'),
  ...generateUnits('INC-031', 37.315, -8.555, 'controlled'),
  ...generateUnits('INC-029', 39.822, -7.49,  'surveillance'),
  ...generateUnits('INC-026', 40.75,  -7.88,  'resolved'),
];

// ── Road closures ─────────────────────────────────────────────────────────────
export const closures = [
  { id: 'CR-03', name: 'EN18 Km 42-47',         status: 'active',  incident: 'INC-034', path: [[40.10, -7.80], [40.05, -7.68]] },
  { id: 'CR-01', name: 'EN232 Acesso Serra',     status: 'active',  incident: 'INC-034', path: [[40.39, -7.62], [40.32, -7.59]] },
  { id: 'CR-04', name: 'EN339 Condicionamento',  status: 'planned', incident: 'INC-034', path: [[40.45, -7.50], [40.40, -7.55]] },
  { id: 'CR-02', name: 'A23 Saída 13',           status: 'planned', incident: 'INC-029', path: [[39.90, -7.55], [39.75, -7.35]] },
];

export const alerts = [
  { id: 'AL-09', title: 'Evacuação preventiva',      level: 'critical', target: 'Aldeia Nova, Guarda',              incidentId: 'INC-034', radius: 15, status: 'active',   message: 'Evacuação imediata obrigatória de Aldeia Nova e zonas limítrofes num raio de 15 km. Seguir indicações das autoridades.' },
  { id: 'AL-08', title: 'Proibição de acesso',        level: 'critical', target: 'Área restrita Serra da Estrela',   incidentId: 'INC-034', radius: 20, status: 'active',   message: 'Acesso proibido à área restrita da Serra da Estrela. Circulação interdita num raio de 20 km do foco de incêndio.' },
  { id: 'AL-07', title: 'Fumo intenso',               level: 'high',     target: 'Vale Verde, Covilhã',             incidentId: 'INC-034', radius: 25, status: 'active',   message: 'Fumo denso visível em Vale Verde e arredores. Recomenda-se encerrar janelas e evitar exposição ao exterior.' },
  { id: 'AL-06', title: 'Aviso meteorológico',        level: 'high',     target: 'Região Centro',                   incidentId: 'INC-034', radius: 30, status: 'active',   message: 'Condições meteorológicas adversas previstas: rajadas de vento até 60 km/h e temperatura acima de 34°C. Risco extremo.' },
  { id: 'AL-04', title: 'Encerramento de vias',       level: 'medium',   target: 'EN18, EN232',                     incidentId: 'INC-034', radius: 15, status: 'active',   message: 'EN18 e EN232 encerradas ao trânsito. Utilize rotas alternativas conforme sinalização das autoridades rodoviárias.' },
  { id: 'AL-03', title: 'Risco de incêndio máximo',   level: 'high',     target: 'Distritos Guarda e C. Branco',    incidentId: 'INC-029', radius: 20, status: 'active',   message: 'Nível de risco de incêndio máximo nos distritos da Guarda e Castelo Branco. Evite atividades ao ar livre e acender fogueiras.' },
  { id: 'AL-02', title: 'Evacuação preventiva',       level: 'critical', target: 'Monchique, Caldas de Monchique',   incidentId: 'INC-031', radius: 15, status: 'active',   message: 'Evacuação preventiva decretada para Monchique e Caldas de Monchique. Dirija-se ao ponto de reunião designado com documentos e medicamentos.' },
  { id: 'AL-01', title: 'Corte de estrada',            level: 'medium',   target: 'EN266 Portimão–Monchique',         incidentId: 'INC-031', radius: 10, status: 'active',   message: 'EN266 entre Portimão e Monchique cortada ao trânsito por razões de segurança. Desvio disponível pela CM1.' },
];

export const weather = {
  windSpeed: 32,
  gusts: 52,
  direction: 'NE',
  directionDeg: 50,
  temperature: 34,
  humidity: 18,
  updated: 'há 4 min',
};

export const initialZones = {
  'INC-034': [
    { id: 'Z-001', name: 'Zona de Exclusão A',    type: 'exclusao',  radiusKm: 7  },
    { id: 'Z-002', name: 'Setor de Ataque Norte', type: 'ataque',    radiusKm: 4  },
    { id: 'Z-003', name: 'Zona de Segurança',     type: 'seguranca', radiusKm: 14 },
  ],
};

// ── Fire stations ─────────────────────────────────────────────────────────────
export const fireStations = [
  // Serra da Estrela / Guarda region
  { id: 'QRT-001', name: 'B.V. Guarda',         type: 'voluntarios', lat: 40.537, lng: -7.270 },
  { id: 'QRT-002', name: 'B.V. Covilhã',         type: 'voluntarios', lat: 40.280, lng: -7.504 },
  { id: 'QRT-003', name: 'B.V. Seia',            type: 'voluntarios', lat: 40.421, lng: -7.702 },
  { id: 'QRT-004', name: 'B.V. Gouveia',         type: 'voluntarios', lat: 40.497, lng: -7.593 },
  { id: 'QRT-005', name: 'B.V. Manteigas',       type: 'voluntarios', lat: 40.399, lng: -7.534 },
  { id: 'QRT-006', name: 'B.V. Belmonte',        type: 'voluntarios', lat: 40.355, lng: -7.348 },
  { id: 'QRT-007', name: 'B.V. Fundão',          type: 'voluntarios', lat: 40.140, lng: -7.503 },
  { id: 'QRT-008', name: 'B.V. Trancoso',        type: 'voluntarios', lat: 40.781, lng: -7.349 },
  { id: 'QRT-009', name: 'B.V. Celorico da Beira', type: 'voluntarios', lat: 40.622, lng: -7.394 },
  { id: 'QRT-010', name: 'B.V. Pinhel',          type: 'voluntarios', lat: 40.777, lng: -7.062 },
  // Castelo Branco region
  { id: 'QRT-011', name: 'B.V. Castelo Branco',  type: 'voluntarios', lat: 39.825, lng: -7.492 },
  { id: 'QRT-012', name: 'B.V. Covilhã Sul',     type: 'voluntarios', lat: 40.150, lng: -7.590 },
  { id: 'QRT-013', name: 'B.V. Proença-a-Nova',  type: 'voluntarios', lat: 39.751, lng: -7.921 },
  { id: 'QRT-014', name: 'B.V. Sertã',           type: 'voluntarios', lat: 39.803, lng: -8.099 },
  { id: 'QRT-015', name: 'B.V. Oleiros',         type: 'voluntarios', lat: 39.913, lng: -7.912 },
  { id: 'QRT-016', name: 'B.V. Vila de Rei',     type: 'voluntarios', lat: 39.672, lng: -8.147 },
  { id: 'QRT-017', name: 'B.V. Mação',           type: 'voluntarios', lat: 39.561, lng: -7.997 },
  { id: 'QRT-018', name: 'B.V. Penamacor',       type: 'voluntarios', lat: 40.173, lng: -7.175 },
  // Viseu / Dão region
  { id: 'QRT-019', name: 'B.V. Viseu',           type: 'voluntarios', lat: 40.656, lng: -7.916 },
  { id: 'QRT-020', name: 'B.V. Mangualde',       type: 'voluntarios', lat: 40.601, lng: -7.762 },
  { id: 'QRT-021', name: 'B.V. Nelas',           type: 'voluntarios', lat: 40.531, lng: -7.856 },
  { id: 'QRT-022', name: 'B.V. Lamego',          type: 'voluntarios', lat: 41.098, lng: -7.806 },
  { id: 'QRT-023', name: 'B.V. Castro Daire',    type: 'voluntarios', lat: 40.899, lng: -7.934 },
  // Algarve / Monchique region
  { id: 'QRT-024', name: 'B.V. Monchique',       type: 'voluntarios', lat: 37.320, lng: -8.554 },
  { id: 'QRT-025', name: 'B.V. Portimão',        type: 'voluntarios', lat: 37.139, lng: -8.537 },
  { id: 'QRT-026', name: 'B.V. Lagos',           type: 'voluntarios', lat: 37.102, lng: -8.675 },
  { id: 'QRT-027', name: 'B.V. Silves',          type: 'voluntarios', lat: 37.195, lng: -8.439 },
  { id: 'QRT-028', name: 'B.V. Aljezur',         type: 'voluntarios', lat: 37.319, lng: -8.800 },
  { id: 'QRT-029', name: 'B.V. Loulé',           type: 'voluntarios', lat: 37.144, lng: -8.022 },
  { id: 'QRT-030', name: 'B.V. Faro',            type: 'voluntarios', lat: 37.020, lng: -7.930 },
  { id: 'QRT-031', name: 'B.V. Tavira',          type: 'voluntarios', lat: 37.127, lng: -7.651 },
  { id: 'QRT-032', name: 'B.V. Albufeira',       type: 'voluntarios', lat: 37.089, lng: -8.248 },
  // Coimbra / Centro region
  { id: 'QRT-033', name: 'B.V. Coimbra',         type: 'voluntarios', lat: 40.210, lng: -8.429 },
  { id: 'QRT-034', name: 'B.V. Leiria',          type: 'voluntarios', lat: 39.746, lng: -8.807 },
  { id: 'QRT-035', name: 'B.V. Tomar',           type: 'voluntarios', lat: 39.604, lng: -8.410 },
  { id: 'QRT-036', name: 'B.V. Arganil',         type: 'voluntarios', lat: 40.220, lng: -7.999 },
  { id: 'QRT-037', name: 'B.V. Góis',            type: 'voluntarios', lat: 40.158, lng: -8.111 },
  // Major cities (Sapadores)
  { id: 'QRT-038', name: 'B.S. Lisboa 1ª Companhia',  type: 'sapadores', lat: 38.717, lng: -9.142 },
  { id: 'QRT-039', name: 'B.S. Lisboa 2ª Companhia',  type: 'sapadores', lat: 38.735, lng: -9.160 },
  { id: 'QRT-040', name: 'B.S. Porto',           type: 'sapadores', lat: 41.163, lng: -8.619 },
  { id: 'QRT-041', name: 'B.S. Coimbra',         type: 'sapadores', lat: 40.206, lng: -8.415 },
  { id: 'QRT-042', name: 'B.M. Setúbal',         type: 'municipais', lat: 38.524, lng: -8.895 },
  { id: 'QRT-043', name: 'B.M. Évora',           type: 'municipais', lat: 38.571, lng: -7.907 },
  { id: 'QRT-044', name: 'B.V. Aveiro',          type: 'voluntarios', lat: 40.644, lng: -8.645 },
  { id: 'QRT-045', name: 'B.V. Santarém',        type: 'voluntarios', lat: 39.236, lng: -8.686 },
  { id: 'QRT-046', name: 'B.V. Abrantes',        type: 'voluntarios', lat: 39.464, lng: -8.197 },
  { id: 'QRT-047', name: 'B.V. Portalegre',      type: 'voluntarios', lat: 39.296, lng: -7.428 },
  { id: 'QRT-048', name: 'B.V. Braga',           type: 'voluntarios', lat: 41.545, lng: -8.426 },
  { id: 'QRT-049', name: 'B.V. Viana do Castelo', type: 'voluntarios', lat: 41.694, lng: -8.831 },
  { id: 'QRT-050', name: 'B.V. Beja',            type: 'voluntarios', lat: 38.015, lng: -7.864 },
]

// ── Radio messages ─────────────────────────────────────────────────────────────
export const radioMessages = [
  { id: 'RAD-001', from: 'COS Serra da Estrela', msg: 'Solicito reforço no setor Alfa, fogo a progredir para norte.',          incidentId: 'INC-034', type: 'tactical' },
  { id: 'RAD-002', from: 'Kamov 01',             msg: 'Larguei 3000L zona de rebentamento. A regressar para reabastecimento.', incidentId: 'INC-034', type: 'tactical' },
  { id: 'RAD-003', from: 'GNR Monchique',        msg: 'EN267 cortada ao trânsito. Desvio ativo pela CM1.',                    incidentId: 'INC-031', type: 'logistics' },
  { id: 'RAD-004', from: 'ANEPC Lisboa',         msg: 'Aviso meteorológico confirmado. Rajadas até 60km/h previstas para as 20h.', incidentId: null,      type: 'weather' },
  { id: 'RAD-005', from: 'COS Castelo Branco',   msg: 'Situação estabilizada no setor Sul. Manter vigilância.',               incidentId: 'INC-029', type: 'tactical' },
  { id: 'RAD-006', from: 'Logistica 01',         msg: 'Abastecimento completo em B.V. Covilhã. A deslocar para ponto de apoio.', incidentId: 'INC-034', type: 'logistics' },
  { id: 'RAD-007', from: 'B.V. Guarda',          msg: 'Em ocorrência no setor Bravo. Necessito apoio médico.',                incidentId: 'INC-034', type: 'tactical' },
  { id: 'RAD-008', from: 'ANEPC Coordenação',    msg: 'Reforço de meios aéreos solicitado ao DECIR. Aguardar confirmação.',   incidentId: null,      type: 'tactical' },
]
