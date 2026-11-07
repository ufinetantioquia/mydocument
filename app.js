const $ = s => document.querySelector(s),
  pad = n => String(n).padStart(2, '0'),
  fd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ==========================================================================
// 1. CONFIGURACIÓN DE FLOTA OPERATIVA Y PERSONAL REQUERIDO
// ==========================================================================
// Camionetas: Taraza (4), Apartado (4), Medellin 1-3 (3). Motorizados: Medellin 1-2 (1)
const DEFAULT_FL = [
  ['Movil O&M Taraza', 'Camioneta', '#2b7bff', 'Taraza', 'Movil O&M Taraza', 4],
  ['Movil O&M Apartado', 'Camioneta', '#2b7bff', 'Apartado', 'Movil O&M Apartado', 4],
  ['Movil O&M Medellin 1', 'Camioneta', '#2b7bff', 'Medellin', 'Movil O&M Medellin 1', 3],
  ['Movil O&M Medellin 2', 'Camioneta', '#2b7bff', 'Medellin', 'Movil O&M Medellin 2', 3],
  ['Movil O&M Medellin 3', 'Camioneta', '#2b7bff', 'Medellin', 'Movil O&M Medellin 3', 3],
  ['Moto O&M Medellin 1', 'Moto', '#f28c28', 'Medellin', 'Moto O&M Medellin 1', 1],
  ['Moto O&M Medellin 2', 'Moto', '#f28c28', 'Medellin', 'Moto O&M Medellin 2', 1]
].map(a => ({ n: a[0], t: a[1], c: a[2], z: a[3], csv: a[4], p: a[5] }));

function inferDefaultPax(unit) {
  if (typeof unit.p === 'number' && unit.p > 0) return unit.p;
  if (unit.t === 'Moto' || /moto/i.test(unit.n)) return 1;
  if (/taraz|apartad/i.test(unit.n)) return 4;
  return 3;
}

let FL = [];
try {
  const savedFl = JSON.parse(localStorage.getItem('ufco_fleet') || 'null');
  FL = Array.isArray(savedFl) && savedFl.length
    ? savedFl.map(u => ({ ...u, p: inferDefaultPax(u) }))
    : [...DEFAULT_FL];
} catch (e) {
  FL = [...DEFAULT_FL];
}

function saveFleet() {
  try {
    localStorage.setItem('ufco_fleet', JSON.stringify(FL));
  } catch (e) {}
}

function refreshFleetSelect() {
  const html = FL.map((v, i) => `<option value="${i}">${esc(v.n)} (${v.p} ${v.p === 1 ? 'persona' : 'personas'})</option>`).join('');
  if ($('#fmv')) $('#fmv').innerHTML = html;
  if ($('#vehUnit')) $('#vehUnit').innerHTML = FL.map((v, i) => `<option value="${i}">${esc(v.n)} (${esc(v.t)})</option>`).join('');
}

// Catálogo de tipos de actividad técnica O&M
const TP = {
  P: ['Preventivo', '#2b7bff'],
  C: ['Correctivo', '#e0561b'],
  E: ['Empalmes', '#8a5cf6'],
  M: ['Mediciones OTDR', '#0891b2'],
  R: ['Enrutamiento', '#2fa84f'],
  A: ['Auditoria de Nodo', '#d97706'],
  D: ['Depuracion', '#db2777'],
  O: ['Otro', '#74869b']
};

const ST = { p: 'Pendiente', c: 'En curso', h: 'Hecha', b: 'Bloqueada' };

// Catálogo de estados de operatividad vehicular (Días que dejan de trabajar las camionetas)
const VEH_STATES = {
  Operativa: { label: 'Operativa (En servicio)', color: '#2fa84f', icon: '🟢', isDown: false, tag: 'OP' },
  Taller: { label: 'Taller / Mantenimiento', color: '#e0561b', icon: '🛠️', isDown: true, tag: 'TAL' },
  Varada: { label: 'Varada / Falla mecanica', color: '#d23b3b', icon: '⚠️', isDown: true, tag: 'VAR' },
  Sin_Personal: { label: 'Sin cuadrilla / Personal', color: '#8a5cf6', icon: '👥', isDown: true, tag: 'SIN' },
  Pico_Placa: { label: 'Pico y placa / Restriccion', color: '#db2777', icon: '🚫', isDown: true, tag: 'RES' },
  Descanso: { label: 'Descanso / No programada', color: '#74869b', icon: '💤', isDown: true, tag: 'DESC' }
};

const MN = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DN = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const today = fd(new Date());
let D = new Map(),         // Actividades: `m${m}_${YYYY-MM-DD}_${s}` -> Activity Object
  PAX = new Map(),         // Personal: `m${m}_${YYYY-MM-DD}` -> Pax Object
  VEH = new Map(),         // Operatividad de moviles: `m${m}_${YYYY-MM-DD}` -> Veh Object
  cur = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 },
  sel = today,
  editId = null,
  activePaxUnit = 0,
  activeVehUnit = 0,
  activeTab = 'crono',    // 'crono' | 'pax' | 'veh' | 'stats' | 'ticket'
  hid = new Set(),
  tm = null;

// Estado Global de la Pestaña 5 (Gestión de Ticket de Falla y Paradas de Reloj)
const DEFAULT_TICKET_DATA = {
  num: 'TIK-20322201-G8N8',
  ufinet: 'COCOUNE10092132C',
  client: 'UNE EPM TELECOMUNICACIONES S.A. (Millicom)',
  finalClient: 'JERONIMO MARTINS',
  contact: 'Daniel Camilo Bernal',
  phone: '3243387504',
  address: 'Barranquilla - Calle 87 # 42B1-48 Nogales',
  coords: '5.9270266,-75.6713538',
  node: 'ANC - Anconsur',
  equipment: 'COANAMAGTDSCPITRC01 (10.247.194.127)',
  port: 'nni2 (1000BASE-X Down - Vlans 1153, 1154)',
  potenciaRx: '-40.0 dBm (low-alarm)',
  type: 'Corte Fibra',
  startFalla: '2026-11-01T00:40',
  startSitio: '2026-11-01T08:00',
  endFalla: '2026-11-01T18:30',
  unitM: 2,
  diagnostic: 'Rx=-40.0 dBm (low-alarm). Corte total fibra en enlace NNI2 hacia COANAMAIFXSCPHYM01. Cuadrilla en verificacion de ruta.'
};

const DEFAULT_CLOCK_STOPS = [
  {
    id: 'cs_1',
    start: '2026-11-01T10:15',
    end: '2026-11-01T12:00',
    reason: 'Permiso / Acceso a predio',
    detail: 'Vigilancia no autoriza ingreso hasta las 12:00'
  }
];

let ticketData = { ...DEFAULT_TICKET_DATA };
let clockStops = [...DEFAULT_CLOCK_STOPS];
let ticketInputsBound = false;

// ==========================================================================
// 2. HELPERS DE CLAVE, DURACIÓN Y NORMATIVA LABORAL COLOMBIANA (HORAS EXTRAS)
// ==========================================================================
const idOf = a => `m${a.m}_${a.f}_${a.s}`,
  get = (m, f, s) => D.get(`m${m}_${f}_${s}`),
  paxKey = (m, f) => `m${m}_${f}`,
  vehKey = (m, f) => `m${m}_${f}`,
  getPax = (m, f) => {
    const req = FL[m]?.p || 1;
    const saved = PAX.get(paxKey(m, f));
    return saved ? { ...saved, req } : { m, f, n: req, req, st: 'Completa', names: '', note: '' };
  },
  dim = () => new Date(cur.y, cur.m + 1, 0).getDate(),
  ds = d => `${cur.y}-${pad(cur.m + 1)}-${pad(d)}`;

// Cálculo de duración en horas entre hora inicio y hora fin
function calcDuration(start, end, slot) {
  if (start && end) {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff > 0) return Math.round((diff / 60) * 10) / 10;
  }
  return slot === 'DIA' ? 8.0 : 4.0;
}

// Normativa Laboral Colombiana (CST Art. 159-168 / Ley 2101 de 2021)
// - Jornada ordinaria diaria estándar: 8 horas (jornada máxima de 42h semanales en 2026).
// - Límite legal CST: Máximo 2 horas extras diarias y 12 horas extras semanales.
// - Horas Extras Diurnas (HED): 06:00 a 21:00 (+25%).
// - Horas Extras Nocturnas (HEN): 21:00 a 06:00 (+75%).
function calcLaborBreakdown(dur, end) {
  const ordinarias = Math.min(8.0, dur);
  const totalExtras = Math.max(0, dur - 8.0);
  let extrasNocturnas = 0;
  let extrasDiurnas = totalExtras;

  if (end && totalExtras > 0) {
    const [h2] = end.split(':').map(Number);
    if (h2 >= 21) {
      extrasNocturnas = Math.min(totalExtras, h2 - 21);
      extrasDiurnas = Math.max(0, totalExtras - extrasNocturnas);
    }
  }

  const excedeTopeDiario = totalExtras > 2.0; // Alerta CST Art. 22 Ley 50/1990

  return {
    dur,
    ordinarias,
    extrasDiurnas,
    extrasNocturnas,
    totalExtras,
    excedeTopeDiario
  };
}

// Estado del vehículo / movil para control de días que dejan de trabajar
function getVeh(m, f) {
  const saved = VEH.get(vehKey(m, f));
  if (saved) return saved;
  const dt = new Date(f + 'T12:00');
  const isSunday = dt.getDay() === 0;
  const hasActs = Boolean(get(m, f, 'AM') || get(m, f, 'PM') || get(m, f, 'DIA'));
  const px = getPax(m, f);
  if (isSunday && !hasActs) {
    return { m, f, st: 'Descanso', reason: 'Domingo / Descanso programado', note: '' };
  }
  if (px.n === 0 && !hasActs) {
    return { m, f, st: 'Sin_Personal', reason: 'Sin personal registrado', note: '' };
  }
  return { m, f, st: 'Operativa', reason: 'En operacion normal', note: '' };
}

const toast = t => {
  const e = $('#toast');
  if (!e) return;
  e.textContent = t;
  e.classList.add('on');
  clearTimeout(tm);
  tm = setTimeout(() => e.classList.remove('on'), 3400);
};

const inMonth = a => a.f.slice(0, 7) === `${cur.y}-${pad(cur.m + 1)}`;

// Filtro integrado: tipo, estado y búsqueda por texto
const ok = a =>
  !hid.has(a.k) &&
  (!$('#fe')?.value || a.e === $('#fe').value) &&
  (!$('#q')?.value ||
    [a.t, TP[a.k]?.[0], a.loc, a.node, a.tik, a.lead, a.start, a.end]
      .join(' ')
      .toLowerCase()
      .includes($('#q').value.toLowerCase()));

// ==========================================================================
// 3. PERSISTENCIA EN LOCALSTORAGE Y GENERADOR DE SIMULACIÓN INTEGRAL
// ==========================================================================
function lsSave() {
  try {
    localStorage.setItem('ufco_acts', JSON.stringify([...D]));
  } catch (e) {}
}

function savePaxStore() {
  try {
    localStorage.setItem('ufco_pax', JSON.stringify([...PAX]));
  } catch (e) {}
}

function saveVehStore() {
  try {
    localStorage.setItem('ufco_veh', JSON.stringify([...VEH]));
  } catch (e) {}
}

async function put(a) {
  a.dur = calcDuration(a.start, a.end, a.s);
  const k = idOf(a);
  D.set(k, a);
  lsSave();
}

async function del(k) {
  D.delete(k);
  lsSave();
}

async function many(fn, list) {
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(fn));
}

// Generador de simulación completa (324 actividades + ticket real + horas extras + asistencia + inoperatividad)
function generateSimulationData() {
  const catalog = [
    { k: 'P', t: 'Preventivo tramo troncal fibra optica y camaras de paso', s: 'AM', start: '08:00', end: '12:30', dur: 4.5, prio: 'Alta' },
    { k: 'C', t: 'Correctivo urgente por corte o atenuacion en ruta troncal', s: 'PM', start: '13:00', end: '16:30', dur: 3.5, prio: 'Critica' },
    { k: 'E', t: 'Empalmes masivos y sangria en caja de distribucion', s: 'DIA', start: '08:00', end: '17:00', dur: 8.0, prio: 'Alta' },
    { k: 'M', t: 'Mediciones reflectometricas OTDR y calibracion optica', s: 'AM', start: '09:00', end: '12:00', dur: 3.0, prio: 'Normal' },
    { k: 'R', t: 'Enrutamiento de fibra en ODF y peinado de bastidores', s: 'PM', start: '13:30', end: '16:30', dur: 3.0, prio: 'Normal' },
    { k: 'A', t: 'Auditoria integral de Nodo O&M, clima y bancos de baterias', s: 'DIA', start: '08:00', end: '17:00', dur: 8.0, prio: 'Alta' },
    { k: 'D', t: 'Depuracion de reservas tecnicas, marquillas y cierres', s: 'PM', start: '13:00', end: '16:00', dur: 3.0, prio: 'Normal' },
    { k: 'O', t: 'Apoyo tecnico en tendido de acometida y pruebas de enlace', s: 'AM', start: '08:30', end: '12:00', dur: 3.5, prio: 'Baja' }
  ];

  const techs = [
    ['Carlos Mendoza (Lider)', 'Luis Restrepo', 'Pedro Salazar', 'Juan Valencia'],
    ['Andres Gomez (Lider)', 'Mario Londono', 'David Correa', 'Camilo Toro'],
    ['Jorge Rios (Lider)', 'Nelson Pineda', 'Fabio Morales'],
    ['Hector Velez (Lider)', 'Mauricio Gil', 'Santiago Duque'],
    ['Gabriel Castro (Lider)', 'Oscar Henao', 'Julian Arango'],
    ['Tomas Marin (Motorizado 1)'],
    ['Victor Cardona (Motorizado 2)']
  ];

  D.clear();
  PAX.clear();
  VEH.clear();

  const nDays = dim();

  for (let d = 1; d <= nDays; d++) {
    const fStr = ds(d);
    const dt = new Date(cur.y, cur.m, d);
    const w = dt.getDay(); // 0 = Domingo

    FL.forEach((v, m) => {
      // 1. Operatividad Vehicular (Días que las camionetas dejan de trabajar)
      if (w === 0) {
        VEH.set(vehKey(m, fStr), { m, f: fStr, st: 'Descanso', reason: 'Domingo habitual', note: 'No programada' });
      } else if (m === 3 && (d === 11 || d === 12)) {
        VEH.set(vehKey(m, fStr), { m, f: fStr, st: 'Taller', reason: 'Mantenimiento preventivo 20.000 km', note: 'Taller autorizado - cambio pastillas' });
      } else if (m === 1 && d === 18) {
        VEH.set(vehKey(m, fStr), { m, f: fStr, st: 'Varada', reason: 'Falla bomba de embrague en ruta Carepa', note: 'Grua solicitada' });
      } else if (m === 5 && d === 6) {
        VEH.set(vehKey(m, fStr), { m, f: fStr, st: 'Pico_Placa', reason: 'Restriccion vehicular digitos 4-5', note: 'Reasignado a nodo base' });
      } else {
        VEH.set(vehKey(m, fStr), { m, f: fStr, st: 'Operativa', reason: 'En servicio normal', note: 'Ruta operativa asignada' });
      }

      // 2. Asistencia de Personal
      if (w === 0) {
        PAX.set(paxKey(m, fStr), { m, f: fStr, n: 0, req: v.p, st: 'Descanso', names: 'Descanso dominical', note: 'Sin operacion' });
      } else if ((m + d) % 11 === 0 && v.p > 1) {
        PAX.set(paxKey(m, fStr), { m, f: fStr, n: v.p - 1, req: v.p, st: 'Incapacidad', names: techs[m].slice(0, v.p - 1).join(', '), note: '1 tecnico con incapacidad medica EPS' });
      } else if ((m * 3 + d) % 17 === 0 && v.p > 1) {
        PAX.set(paxKey(m, fStr), { m, f: fStr, n: v.p - 1, req: v.p, st: 'Permiso', names: techs[m].slice(0, v.p - 1).join(', '), note: '1 tecnico con permiso de calamidad' });
      } else {
        PAX.set(paxKey(m, fStr), { m, f: fStr, n: v.p, req: v.p, st: 'Completa', names: techs[m].join(', '), note: 'Dotacion completa presente' });
      }

      // 3. Actividades Técnicas
      if (w === 0) return; // Sin actividades los domingos
      if (m === 3 && (d === 11 || d === 12)) return; // En taller
      if (m === 1 && d === 18) return; // Varada

      // Ticket real crítico asignado para Movil Medellin 1 el día 7 de noviembre
      if (m === 2 && d === 7) {
        const ticketReal = {
          m: 2,
          f: fStr,
          s: 'DIA',
          k: 'C',
          t: 'Corte Fibra - IDU COCOUNE10092132C Jeronimo Martins (Vlans 1153/1154, Puerto nni2)',
          e: 'c',
          start: '08:00',
          end: '18:30', // 10.5 horas: 8h ordinarias + 2.5h extras (alerta CST)
          dur: 10.5,
          loc: 'Medellin / Sabaneta',
          node: 'ANC - Anconsur (Equipo COANAMAGTDSCPITRC01)',
          tik: 'TIK-20322201-G8N8',
          prio: 'Critica',
          lead: 'Raul E. Castro Ramos / Daniel Camilo Bernal',
          notes: 'Rx=-40 dBm (low-alarm). Corte total fibra optica en NNI2 hacia COANAMAIFXSCPHYM01. Contacto en sitio: Daniel Camilo Bernal (3243387504). Coord: 5.9270266,-75.6713538. Calle 87 # 42B1-48 Nogales.'
        };
        D.set(idOf(ticketReal), ticketReal);
        return;
      }

      const seed = (m * 5 + d * 3) % catalog.length;
      const item1 = catalog[seed];
      const isDia = (item1.s === 'DIA') && (d % 4 === 0) && (v.t !== 'Moto');
      const sSlot = isDia ? 'DIA' : 'AM';
      
      // Simulamos algunas jornadas extendidas con horas extras legales (hasta 9.5h o 10h)
      let start1 = '08:00';
      let end1 = isDia ? (d % 3 === 0 ? '18:30' : '17:00') : item1.end;
      let dur1 = calcDuration(start1, end1, sSlot);

      let st1 = 'p';
      if (d < 7) {
        st1 = ((m * d) % 13 === 0) ? 'b' : 'h';
      } else if (d === 7) {
        st1 = 'c';
      }

      const act1 = {
        m,
        f: fStr,
        s: sSlot,
        k: item1.k,
        t: `${item1.t} (${v.z})`,
        e: st1,
        start: start1,
        end: end1,
        dur: dur1,
        loc: v.z,
        node: `NOD-${m + 1}0${d}`,
        tik: `TIK-${cur.y}${pad(cur.m + 1)}${pad(d)}-${m + 1}`,
        prio: item1.prio,
        lead: techs[m][0],
        notes: st1 === 'b' ? 'Bloqueada: en espera de permiso predial y llaves de acceso' : 'Ejecucion tecnica segun cronograma'
      };
      D.set(idOf(act1), act1);

      // Franja PM si no fue día completo
      if (!isDia && (w !== 6 || m % 2 === 0)) {
        const seed2 = (seed + 3) % catalog.length;
        const item2 = catalog[seed2];
        const st2 = (d < 7) ? 'h' : 'p';
        const start2 = '13:00';
        const end2 = (d % 5 === 0) ? '18:00' : '17:00'; // 5h o 4h
        const dur2 = calcDuration(start2, end2, 'PM');

        const act2 = {
          m,
          f: fStr,
          s: 'PM',
          k: item2.k,
          t: `${item2.t} (${v.z})`,
          e: st2,
          start: start2,
          end: end2,
          dur: dur2,
          loc: v.z,
          node: `NOD-${m + 1}5${d}`,
          tik: `TIK-${cur.y}${pad(cur.m + 1)}${pad(d)}-P${m + 1}`,
          prio: item2.prio,
          lead: techs[m][0],
          notes: 'Actividad programada franja de la tarde'
        };
        D.set(idOf(act2), act2);
      }
    });
  }

  lsSave();
  savePaxStore();
  saveVehStore();
  render();
}

function importJsonData(data, source = 'archivo') {
  if (!data || typeof data !== 'object') {
    toast('El archivo no contiene un JSON valido');
    return;
  }

  if (Array.isArray(data.fleet) && data.fleet.length) {
    FL = data.fleet.map(u => ({ ...u, p: inferDefaultPax(u) }));
    saveFleet();
    refreshFleetSelect();
  }

  if (Array.isArray(data.activities)) {
    D.clear();
    data.activities.forEach(a => {
      a.dur = a.dur || calcDuration(a.start, a.end, a.s);
      D.set(idOf(a), a);
    });
    lsSave();
  }

  if (Array.isArray(data.attendance)) {
    PAX.clear();
    data.attendance.forEach(p => PAX.set(paxKey(p.m, p.f), p));
    savePaxStore();
  }

  if (Array.isArray(data.vehicles)) {
    VEH.clear();
    data.vehicles.forEach(v => VEH.set(vehKey(v.m, v.f), v));
    saveVehStore();
  }

  if (data.ticket && typeof data.ticket === 'object') {
    ticketData = Object.assign({}, DEFAULT_TICKET_DATA, data.ticket);
    if (Array.isArray(data.ticket.clockStops)) {
      clockStops = [...data.ticket.clockStops];
    }
    saveTicketState();
  }

  render();
  toast(`Base de datos restaurada desde ${source} (${D.size} actividades)`);
}

function exportJson() {
  const exportPayload = {
    version: '2.0',
    exported_at: new Date().toISOString(),
    description: 'Base de datos del Cronograma de moviles y motorizados O&M (Colombia CST)',
    fleet: FL,
    activities: [...D.values()],
    attendance: [...PAX.values()],
    vehicles: [...VEH.values()],
    ticket: {
      ...ticketData,
      clockStops: clockStops
    }
  };

  const str = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'datos_cronograma.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Respaldo descargado como datos_cronograma.json. Puedes subirlo a tu repositorio en GitHub.');
}

async function loadFromGitHub(silent = false) {
  try {
    const res = await fetch('./datos_cronograma.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Archivo no encontrado');
    const data = await res.json();
    importJsonData(data, 'GitHub');
  } catch (err) {
    if (!silent) toast('No se pudo cargar datos_cronograma.json desde GitHub');
  }
}

function local(msg) {
  try {
    D = new Map(JSON.parse(localStorage.getItem('ufco_acts') || '[]'));
    for (const [, a] of D) {
      if (!TP[a.k]) a.k = 'O';
      if (!a.dur) a.dur = calcDuration(a.start, a.end, a.s);
    }
  } catch (e) {
    D = new Map();
  }

  try {
    PAX = new Map(JSON.parse(localStorage.getItem('ufco_pax') || '[]'));
  } catch (e) {
    PAX = new Map();
  }

  try {
    VEH = new Map(JSON.parse(localStorage.getItem('ufco_veh') || '[]'));
  } catch (e) {
    VEH = new Map();
  }

  if ($('#st')) $('#st').textContent = msg;
  refreshFleetSelect();

  // Si no hay actividades en el mes actual, cargar automáticamente la simulación completa
  const monthActs = [...D.values()].filter(a => inMonth(a));
  if (monthActs.length === 0) {
    generateSimulationData();
    return;
  }

  render();
}

// ==========================================================================
// 4. CONTROL Y NAVEGACIÓN DE PESTAÑAS PRINCIPALES
// ==========================================================================
function switchMainTab(tab) {
  activeTab = tab;
  const tabs = [
    ['crono', '#btnTabCrono', '#tabCronograma'],
    ['pax', '#btnTabPax', '#tabPersonal'],
    ['veh', '#btnTabVeh', '#tabVehiculos'],
    ['stats', '#btnTabStats', '#tabEstadisticas'],
    ['ticket', '#btnTabTicket', '#tabTicket']
  ];

  tabs.forEach(([t, btnId, secId]) => {
    const isAct = t === tab;
    $(btnId)?.classList.toggle('active', isAct);
    $(btnId)?.setAttribute('aria-selected', isAct);
    $(secId)?.classList.toggle('hidden', !isAct);
  });

  render();
}

if ($('#btnTabCrono')) $('#btnTabCrono').onclick = () => switchMainTab('crono');
if ($('#btnTabPax')) $('#btnTabPax').onclick = () => switchMainTab('pax');
if ($('#btnTabVeh')) $('#btnTabVeh').onclick = () => switchMainTab('veh');
if ($('#btnTabStats')) $('#btnTabStats').onclick = () => switchMainTab('stats');
if ($('#btnTabTicket')) $('#btnTabTicket').onclick = () => switchMainTab('ticket');

// ==========================================================================
// 5. PESTAÑA 1: CRONOGRAMA DE ACTIVIDADES, HORARIOS Y VISITAS TÉCNICAS
// ==========================================================================
function kpis() {
  const A = [...D.values()].filter(a => inMonth(a) && a.m < FL.length),
    n = s => A.filter(a => a.e === s).length,
    pc = A.length ? Math.round((n('h') / A.length) * 100) : 0;
  let lib = 0,
    totReq = 0,
    totPres = 0,
    totHours = 0,
    totExtras = 0;

  A.forEach(a => {
    const dur = a.dur || calcDuration(a.start, a.end, a.s);
    totHours += dur;
    const lb = calcLaborBreakdown(dur, a.end);
    totExtras += lb.totalExtras;
  });

  FL.forEach((v, m) => {
    ['AM', 'PM'].forEach(s => {
      if (!(get(m, sel, s) || get(m, sel, 'DIA'))) lib++;
    });
    const px = getPax(m, sel);
    totReq += v.p;
    totPres += px.n;
  });

  if ($('#kp')) {
    $('#kp').innerHTML = [
      [A.length, 'actividades del mes'],
      [pc + ' %', 'cumplimiento (hechas)'],
      [totHours.toFixed(1) + ' h', 'horas tecnicas totales'],
      [totExtras.toFixed(1) + ' h', 'horas extras (norma CST)'],
      [n('c'), 'en curso'],
      [n('b'), 'bloqueadas'],
      [`${totPres} / ${totReq}`, 'personal activo el ' + sel.slice(8) + '/' + sel.slice(5, 7)],
      [lib, 'franjas libres el ' + sel.slice(8) + '/' + sel.slice(5, 7)]
    ]
      .map(x => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`)
      .join('');
  }

  if ($('#lg')) {
    $('#lg').innerHTML = Object.entries(TP)
      .map(
        ([k, v]) =>
          `<span class="lg" role="button" tabindex="0" data-k="${k}" aria-pressed="${!hid.has(k)}"><i class="sw" style="--c:${v[1]}"></i><b>${k}</b> · ${v[0]}</span>`
      )
      .join('');
  }
}

function grid() {
  const n = dim();
  let h = `<table><thead><tr><th class="c1">Movil / Personal</th><th class="c2"></th>`;
  for (let d = 1; d <= n; d++) {
    const f = ds(d),
      w = new Date(cur.y, cur.m, d).getDay();
    h += `<th data-d="${f}" class="${w % 6 == 0 ? 'we' : ''} ${f == today ? 'td' : ''} ${f == sel ? 'sl' : ''}">${d}<small>${DN[w]}</small></th>`;
  }
  h += `<th class="c3">Ocupacion</th></tr></thead><tbody>`;

  FL.forEach((v, m) => {
    let busy = 0;
    for (let d = 1; d <= n; d++) if (get(m, ds(d), 'AM') || get(m, ds(d), 'PM') || get(m, ds(d), 'DIA')) busy++;
    const paxLabel = `${v.p} ${v.p === 1 ? 'persona' : 'personas'}`;

    ['AM', 'PM'].forEach((s, r) => {
      h += `<tr>${
        r
          ? ''
          : `<td class="c1" rowspan="2" style="border-left:5px solid ${v.c}">${esc(v.n)}<small style="display:block;color:var(--mut);font-weight:400;font-size:10.5px">${paxLabel}</small></td>`
      }<td class="c2">${s}</td>`;

      for (let d = 1; d <= n; d++) {
        const f = ds(d),
          a = get(m, f, s) || get(m, f, 'DIA'),
          px = getPax(m, f),
          vSt = getVeh(m, f),
          w = new Date(cur.y, cur.m, d).getDay();

        const tp = a ? TP[a.k] || TP.P : null;
        const dur = a ? (a.dur || calcDuration(a.start, a.end, a.s)) : 0;
        const lb = a ? calcLaborBreakdown(dur, a.end) : null;
        const extraNote = lb && lb.totalExtras > 0 ? ` (+${lb.totalExtras}h extra)` : '';
        const vehWarn = vSt.st !== 'Operativa' ? ` | ⚠️ Movil ${VEH_STATES[vSt.st]?.label || vSt.st}` : '';
        const paxTip = ` | Personal: ${px.n}/${v.p} (${px.st})${vehWarn}`;

        h += `<td class="e ${w % 6 == 0 ? 'we' : ''} ${f == today ? 'td' : ''}" data-m="${m}" data-f="${f}" data-s="${s}">${
          a
            ? `<span class="blk ${a.e} ${ok(a) ? '' : 'dim'}" style="--c:${tp[1]}" title="${esc(
                tp[0] + ' · ' + ST[a.e] + ': ' + a.t + (a.tik ? ' (' + a.tik + ')' : '') + ` [${a.start || '08:00'}-${a.end || '12:00'} · ${dur}h${extraNote}]` + paxTip
              )}">${a.k}</span>`
            : ''
        }</td>`;
      }
      h += r ? '' : `<td class="c3" rowspan="2"><b>${Math.round((busy / n) * 100)} %</b><div class="oc"><i style="width:${(busy / n) * 100}%"></i></div></td>`;
      h += '</tr>';
    });
  });
  if ($('#gw')) $('#gw').innerHTML = h + '</tbody></table>';
}

function agenda() {
  const f = sel,
    dt = new Date(f + 'T12:00'),
    A = [];
  if ($('#dl')) $('#dl').textContent = dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if ($('#ag')) {
    $('#ag').innerHTML = FL.map((v, m) => {
      const px = getPax(m, f);
      const vSt = getVeh(m, f);
      const vDef = VEH_STATES[vSt.st] || VEH_STATES.Operativa;
      const isDown = vDef.isDown;
      const vehBarClass = isDown
        ? vSt.st === 'Taller'
          ? 'taller'
          : vSt.st === 'Varada'
          ? 'varada'
          : vSt.st === 'Sin_Personal'
          ? 'sin-pax'
          : 'descanso'
        : '';

      const vehReasonText = vSt.reason ? ` · ${esc(vSt.reason)}` : '';
      const vehHtml = `<div class="veh-bar ${vehBarClass}">
        <div style="display:flex;align-items:center;gap:6px">
          <b>${vDef.icon} ${esc(vDef.label)}</b>
          <small style="color:var(--mut);font-size:11px">${vehReasonText}</small>
        </div>
        <button class="btn" type="button" data-veh-open="${m}" style="padding:2px 8px;font-size:11px">Operatividad</button>
      </div>`;

      const statusClass = px.n >= v.p ? 'ok' : 'warn';
      const subPax = [
        px.st !== 'Completa' ? px.st : px.n >= v.p ? 'Dotacion completa' : 'Dotacion incompleta',
        px.names,
        px.note
      ]
        .filter(Boolean)
        .join(' · ');

      const paxHtml = `<div class="pax-bar ${statusClass}" data-pax-m="${m}">
        <div class="pax-info">
          <b>Personal: ${px.n} de ${v.p} ${v.p === 1 ? 'persona' : 'personas'}</b>
          <small title="${esc(subPax)}">${esc(subPax)}</small>
        </div>
        <div class="pax-ctrl">
          <button type="button" data-px-step="-1" title="Restar 1 persona">&minus;</button>
          <span class="pax-pill ${statusClass}">${px.n}/${v.p}</span>
          <button type="button" data-px-step="1" title="Sumar 1 persona">+</button>
          <button type="button" data-px-open="1" title="Registrar integrantes o novedad de personal">Personal</button>
        </div>
      </div>`;

      const lane = s => {
        const a = get(m, f, s) || get(m, f, 'DIA');
        if (a && !A.includes(a)) A.push(a);
        if (!a) return `<button class="free" data-m="${m}" data-s="${s}">Libre · asignar actividad</button>`;
        const tp = TP[a.k] || TP.P;
        const dur = a.dur || calcDuration(a.start, a.end, a.s);
        const lb = calcLaborBreakdown(dur, a.end);

        const timeBadge = `<span class="time-badge">🕒 ${a.start || (a.s === 'PM' ? '13:00' : '08:00')}–${a.end || (a.s === 'AM' ? '12:00' : '17:00')} (${dur}h)</span>`;
        const extraBadge = lb.totalExtras > 0
          ? `<span class="pax-pill warn" title="${lb.extrasDiurnas}h HED / ${lb.extrasNocturnas}h HEN">+${lb.totalExtras}h Extra</span>`
          : '';
        const extra = [a.loc, a.node, a.tik, a.lead].filter(Boolean).join(' · ');

        return `<div class="act ${a.e}" style="--c:${tp[1]}" data-id="${idOf(a)}">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
            <span class="tg">${tp[0]}${a.s == 'DIA' ? ' · dia completo' : ''}</span>
            ${timeBadge}
            ${extraBadge}
          </div>
          <p style="margin:2px 0 4px;font-weight:600">${esc(a.t)}</p>
          ${extra ? `<small style="color:var(--mut);font-size:11px;display:block;margin-top:2px">${esc(extra)}</small>` : ''}
          ${a.notes ? `<small style="color:#d23b3b;font-size:10.5px;display:block;margin-top:2px">⚠️ ${esc(a.notes)}</small>` : ''}
          <div class="qa">${['c', 'h', 'b']
            .map(q => `<button data-q="${q}" class="${a.e == q ? 'on' : ''}">${{ c: 'Iniciar', h: 'Hecha', b: 'Bloquear' }[q]}</button>`)
            .join('')}<button data-ed="1">Editar</button></div>
        </div>`;
      };

      return `<article class="mv" style="--mc:${v.c}">
        <h3>${esc(v.n)}<small>${esc(v.t)} · ${v.p} ${v.p === 1 ? 'persona' : 'personas'}</small></h3>
        ${vehHtml}
        ${paxHtml}
        <div class="lane"><b>AM</b>${lane('AM')}</div>
        <div class="lane"><b>PM</b>${lane('PM')}</div>
      </article>`;
    }).join('');
  }

  const p = A.length ? Math.round((A.filter(a => a.e == 'h').length / A.length) * 100) : 0;
  if ($('#rg')) {
    $('#rg').style.setProperty('--p', p);
    $('#rg span').textContent = p + '%';
  }
}

// ==========================================================================
// 6. PESTAÑA 2: ESTADÍSTICA Y CONTROL DE ASISTENCIA DE PERSONAL
// ==========================================================================
function renderPaxStats() {
  const nDays = dim();
  const dt = new Date(sel + 'T12:00');
  if ($('#pxDl')) $('#pxDl').textContent = dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let dayReq = 0,
    dayPres = 0,
    dayUnitsOk = 0;
  FL.forEach((v, m) => {
    const px = getPax(m, sel);
    dayReq += v.p;
    dayPres += px.n;
    if (px.n >= v.p) dayUnitsOk++;
  });
  const dayPct = dayReq ? Math.round((dayPres / dayReq) * 100) : 0;
  if ($('#pxRing')) {
    $('#pxRing').style.setProperty('--p', dayPct);
    $('#pxRing span').textContent = dayPct + '%';
  }

  let monthReqTotal = 0,
    monthPresTotal = 0;
  const noveltyCounts = {};

  for (let d = 1; d <= nDays; d++) {
    const fStr = ds(d);
    FL.forEach((v, m) => {
      const px = getPax(m, fStr);
      monthReqTotal += v.p;
      monthPresTotal += px.n;
      if (px.n < v.p || (px.st && px.st !== 'Completa')) {
        const stKey = px.st && px.st !== 'Completa' ? px.st : 'Ausencia';
        noveltyCounts[stKey] = (noveltyCounts[stKey] || 0) + 1;
      }
    });
  }
  const monthPct = monthReqTotal ? Math.round((monthPresTotal / monthReqTotal) * 100) : 0;

  if ($('#paxKpis')) {
    $('#paxKpis').innerHTML = [
      [`${dayPres} / ${dayReq}`, 'personas presentes el ' + sel.slice(8) + '/' + sel.slice(5, 7)],
      [dayPct + ' %', 'asistencia del dia seleccionado'],
      [`${dayUnitsOk} / ${FL.length}`, 'moviles y motos completas hoy'],
      [Math.max(0, dayReq - dayPres), 'ausencias en el dia seleccionado'],
      [monthPct + ' %', 'asistencia promedio del mes'],
      [`${monthPresTotal} / ${monthReqTotal}`, 'personas-dia cubiertas en el mes']
    ]
      .map(x => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`)
      .join('');
  }

  // Grafica de Asistencia por Movil (Dia)
  if ($('#paxUnitChart')) {
    $('#paxUnitChart').innerHTML = FL.map((v, m) => {
      const px = getPax(m, sel);
      const totalSlots = Math.max(v.p, px.n);
      let slotsHtml = '';
      for (let i = 1; i <= totalSlots; i++) {
        const isPresent = i <= px.n;
        slotsHtml += `<span class="st-slot ${isPresent ? '' : 'miss'}" title="${isPresent ? 'Persona ' + i + ': Presente' : 'Persona ' + i + ': Ausente (' + px.st + ')'}">${i}P</span>`;
      }
      const pctUnit = v.p ? Math.round((px.n / v.p) * 100) : 0;
      const statusCls = px.n >= v.p ? 'ok' : 'warn';

      return `<div class="st-row" data-pax-m="${m}">
        <div>
          <b style="display:block">${esc(v.n)}</b>
          <small style="color:var(--mut);font-size:11px">Meta: ${v.p} ${v.p === 1 ? 'persona' : 'personas'} · ${esc(px.st)}</small>
        </div>
        <div>
          <div class="st-slots">${slotsHtml}</div>
          ${px.names || px.note ? `<small style="color:var(--mut);font-size:10.5px;display:block;margin-top:3px">${esc([px.names, px.note].filter(Boolean).join(' · '))}</small>` : ''}
        </div>
        <div class="pax-ctrl" style="justify-content:flex-end">
          <button type="button" data-px-step="-1" title="Restar 1 persona">&minus;</button>
          <span class="pax-pill ${statusCls}" title="${pctUnit}% de asistencia">${px.n}/${v.p}</span>
          <button type="button" data-px-step="1" title="Sumar 1 persona">+</button>
          <button type="button" data-px-open="1">Editar</button>
        </div>
      </div>`;
    }).join('');
  }

  // Barras de Tendencia Mensual
  if ($('#paxMonthBars')) {
    let barsHtml = '';
    for (let d = 1; d <= nDays; d++) {
      const fStr = ds(d);
      let dReq = 0,
        dPres = 0;
      FL.forEach((v, m) => {
        dReq += v.p;
        dPres += getPax(m, fStr).n;
      });
      const pct = dReq ? Math.min(100, Math.round((dPres / dReq) * 100)) : 0;
      const barCls = pct >= 100 ? '' : pct >= 85 ? 'warn' : 'low';
      barsHtml += `<div class="d-col ${fStr === sel ? 'sel' : ''}" data-d="${fStr}" title="${fStr}: ${dPres} de ${dReq} personas (${pct}%)">
        <div class="d-bar-w">
          <div class="d-bar ${barCls}" style="height:${pct}%"></div>
        </div>
        <small>${d}</small>
      </div>`;
    }
    $('#paxMonthBars').innerHTML = barsHtml;
  }

  const novEntries = Object.entries(noveltyCounts);
  if ($('#paxNoveltySummary')) {
    $('#paxNoveltySummary').innerHTML = novEntries.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--mut)">
          <span>Novedades registradas en ${MN[cur.m]}:</span>
          ${novEntries.map(([k, val]) => `<span class="pax-pill warn">${esc(k)}: ${val}</span>`).join('')}
        </div>`
      : `<div class="note" style="margin-top:0">Dotacion al 100 % en todos los dias del mes sin novedades registradas.</div>`;
  }

  // Tabla Estadística Mensual
  if ($('#paxSummaryTable')) {
    let tblHtml = `<thead><tr>
      <th>Movil / Motorizado</th>
      <th>Dotacion requerida</th>
      <th>Presentes (${sel.slice(8)}/${sel.slice(5, 7)})</th>
      <th>Promedio personas/dia</th>
      <th>Dias completos</th>
      <th>Dias con ausencia</th>
      <th>Asistencia mensual</th>
    </tr></thead><tbody>`;

    FL.forEach((v, m) => {
      let sumPres = 0,
        daysFull = 0,
        daysIncomplete = 0;
      for (let d = 1; d <= nDays; d++) {
        const px = getPax(m, ds(d));
        sumPres += px.n;
        if (px.n >= v.p) daysFull++;
        else daysIncomplete++;
      }
      const avgPres = (sumPres / nDays).toFixed(1);
      const unitMonthReq = v.p * nDays;
      const unitMonthPct = unitMonthReq ? Math.round((sumPres / unitMonthReq) * 100) : 0;
      const todayPx = getPax(m, sel);

      tblHtml += `<tr>
        <td><span class="mv-dot" style="background:${v.c}"></span><b>${esc(v.n)}</b></td>
        <td><b>${v.p}</b> ${v.p === 1 ? 'persona' : 'personas'}</td>
        <td><span class="pax-pill ${todayPx.n >= v.p ? 'ok' : 'warn'}">${todayPx.n} / ${v.p} pers.</span></td>
        <td>${avgPres} de ${v.p} pers.</td>
        <td>${daysFull} / ${nDays} dias</td>
        <td>${daysIncomplete > 0 ? `<b style="color:#d23b3b">${daysIncomplete} dias</b>` : '0 dias'}</td>
        <td style="min-width:140px">
          <div style="display:flex;align-items:center;gap:8px">
            <b>${unitMonthPct} %</b>
            <div class="oc" style="flex:1"><i style="width:${unitMonthPct}%;background:${unitMonthPct >= 95 ? '#2fa84f' : '#f28c28'}"></i></div>
          </div>
        </td>
      </tr>`;
    });
    tblHtml += `</tbody>`;
    $('#paxSummaryTable').innerHTML = tblHtml;
  }

  // Matriz Diaria de Personal
  if ($('#paxGridWrap')) {
    let mHtml = `<table><thead><tr><th class="c1">Movil</th><th class="c2">Meta</th>`;
    for (let d = 1; d <= nDays; d++) {
      const f = ds(d),
        w = new Date(cur.y, cur.m, d).getDay();
      mHtml += `<th data-d="${f}" class="${w % 6 == 0 ? 'we' : ''} ${f == today ? 'td' : ''} ${f == sel ? 'sl' : ''}">${d}<small>${DN[w]}</small></th>`;
    }
    mHtml += `<th class="c3">Asistencia</th></tr></thead><tbody>`;

    FL.forEach((v, m) => {
      let sumPres = 0;
      mHtml += `<tr>
        <td class="c1" style="border-left:5px solid ${v.c}">${esc(v.n)}</td>
        <td class="c2"><b>${v.p}P</b></td>`;

      for (let d = 1; d <= nDays; d++) {
        const f = ds(d),
          px = getPax(m, f),
          w = new Date(cur.y, cur.m, d).getDay();
        sumPres += px.n;
        const isOk = px.n >= v.p;
        const tip = `${v.n} (${f}): ${px.n} de ${v.p} personas · ${px.st}${px.names ? ' · ' + px.names : ''}${px.note ? ' · ' + px.note : ''}`;
        mHtml += `<td class="e ${w % 6 == 0 ? 'we' : ''} ${f == today ? 'td' : ''}" data-pax-cell="1" data-m="${m}" data-f="${f}" title="${esc(tip)}">
          <span class="px-num ${isOk ? '' : 'warn'}">${px.n}</span>
        </td>`;
      }

      const pct = Math.round((sumPres / (v.p * nDays)) * 100);
      mHtml += `<td class="c3"><b>${pct} %</b><div class="oc"><i style="width:${pct}%;background:${pct >= 95 ? '#2fa84f' : '#f28c28'}"></i></div></td></tr>`;
    });

    mHtml += `<tr><td class="c1"><b>Total Flota</b></td><td class="c2"><b>${dayReq}P</b></td>`;
    for (let d = 1; d <= nDays; d++) {
      const f = ds(d);
      let totD = 0;
      FL.forEach((_, m) => (totD += getPax(m, f).n));
      mHtml += `<td style="font-weight:700;font-size:11px;color:${totD >= dayReq ? 'var(--ink)' : '#d23b3b'}">${totD}</td>`;
    }
    mHtml += `<td class="c3"><b>${monthPct} %</b></td></tr></tbody></table>`;
    $('#paxGridWrap').innerHTML = mHtml;
  }
}

// ==========================================================================
// 7. PESTAÑA 3: INOPERATIVIDAD DE CAMIONETAS Y DISPONIBILIDAD DE FLOTA
// ==========================================================================
function renderVehTab() {
  const nDays = dim();
  const dt = new Date(sel + 'T12:00');
  if ($('#vehDl')) $('#vehDl').textContent = dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // 1. Cálculos de operatividad de hoy
  let todayOp = 0,
    camionetasTot = 0,
    camionetasOp = 0;

  FL.forEach((v, m) => {
    const isCamioneta = v.t !== 'Moto';
    if (isCamioneta) camionetasTot++;
    const vSt = getVeh(m, sel);
    const def = VEH_STATES[vSt.st] || VEH_STATES.Operativa;
    if (!def.isDown) {
      todayOp++;
      if (isCamioneta) camionetasOp++;
    }
  });

  const todayAvailPct = FL.length ? Math.round((todayOp / FL.length) * 100) : 0;
  if ($('#vehRing')) {
    $('#vehRing').style.setProperty('--p', todayAvailPct);
    $('#vehRing span').textContent = todayAvailPct + '%';
  }

  // 2. Cálculos mensuales de días trabajados vs días que dejan de trabajar
  let monthFleetDays = FL.length * nDays,
    monthDaysWorked = 0,
    monthDaysStopped = 0;
  const reasonCounts = {};

  for (let d = 1; d <= nDays; d++) {
    const fStr = ds(d);
    FL.forEach((v, m) => {
      const vSt = getVeh(m, fStr);
      const def = VEH_STATES[vSt.st] || VEH_STATES.Operativa;
      if (!def.isDown) {
        monthDaysWorked++;
      } else {
        monthDaysStopped++;
        const rKey = def.label;
        reasonCounts[rKey] = (reasonCounts[rKey] || 0) + 1;
      }
    });
  }

  const monthFleetAvail = monthFleetDays ? Math.round((monthDaysWorked / monthFleetDays) * 100) : 0;

  // KPIs Operatividad
  if ($('#vehKpis')) {
    $('#vehKpis').innerHTML = [
      [`${camionetasOp} / ${camionetasTot}`, 'camionetas operativas el ' + sel.slice(8) + '/' + sel.slice(5, 7)],
      [todayAvailPct + ' %', 'disponibilidad de flota hoy'],
      [monthDaysWorked, 'dias trabajados por la flota en el mes'],
      [monthDaysStopped, 'dias que las unidades dejaron de trabajar'],
      [monthFleetAvail + ' %', 'disponibilidad mensual promedio'],
      [`${reasonCounts['Taller / Mantenimiento'] || 0} d`, 'dias en taller / mantenimiento']
    ]
      .map(x => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`)
      .join('');
  }

  // Lista de estado del día seleccionado
  if ($('#vehDayList')) {
    $('#vehDayList').innerHTML = FL.map((v, m) => {
      const vSt = getVeh(m, sel);
      const def = VEH_STATES[vSt.st] || VEH_STATES.Operativa;
      const pillClass = def.isDown
        ? vSt.st === 'Taller'
          ? 'taller'
          : vSt.st === 'Varada'
          ? 'varada'
          : vSt.st === 'Sin_Personal'
          ? 'sin-pax'
          : 'descanso'
        : 'op';

      return `<div class="st-row" data-veh-m="${m}">
        <div>
          <b style="display:block">${esc(v.n)}</b>
          <small style="color:var(--mut);font-size:11px">${esc(v.t)} · ${esc(v.z || 'O&M')}</small>
        </div>
        <div>
          <span class="veh-pill ${pillClass}">${def.icon} ${esc(def.label)}</span>
          ${vSt.reason ? `<small style="display:block;color:var(--mut);font-size:11px;margin-top:2px">${esc(vSt.reason)}</small>` : ''}
          ${vSt.note ? `<small style="display:block;color:var(--mut);font-size:10.5px">${esc(vSt.note)}</small>` : ''}
        </div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn" type="button" data-veh-open="${m}" style="padding:4px 10px;font-size:12px">Cambiar estado</button>
        </div>
      </div>`;
    }).join('');
  }

  // Comparativa mensual por movil: Dias trabajados vs dias paradas
  if ($('#vehMonthBars')) {
    $('#vehMonthBars').innerHTML = FL.map((v, m) => {
      let worked = 0,
        stopped = 0;
      for (let d = 1; d <= nDays; d++) {
        const def = VEH_STATES[getVeh(m, ds(d)).st] || VEH_STATES.Operativa;
        if (!def.isDown) worked++;
        else stopped++;
      }
      const workedPct = Math.round((worked / nDays) * 100);
      const stoppedPct = Math.round((stopped / nDays) * 100);

      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <b>${esc(v.n)}</b>
          <span><b>${worked} dias trabajados</b> · <span style="color:#d23b3b">${stopped} parados</span> (${workedPct}%)</span>
        </div>
        <div class="stacked-bar">
          <div class="stacked-segment" style="width:${workedPct}%;background:#2fa84f" title="${worked} dias trabajados (${workedPct}%)"></div>
          <div class="stacked-segment" style="width:${stoppedPct}%;background:#d23b3b" title="${stopped} dias parados (${stoppedPct}%)"></div>
        </div>
      </div>`;
    }).join('');
  }

  const rEntries = Object.entries(reasonCounts);
  if ($('#vehDowntimeCauses')) {
    $('#vehDowntimeCauses').innerHTML = rEntries.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--mut)">
          <span>Causas de dias sin trabajar en ${MN[cur.m]}:</span>
          ${rEntries.map(([k, val]) => `<span class="pax-pill warn">${esc(k)}: ${val} dias</span>`).join('')}
        </div>`
      : `<div class="note" style="margin-top:0">Toda la flota operativa durante todo el mes sin paradas registradas.</div>`;
  }

  // Tabla mensual de inoperatividad
  if ($('#vehSummaryTable')) {
    let tblHtml = `<thead><tr>
      <th>Movil / Motorizado</th>
      <th>Tipo</th>
      <th>Dias del mes</th>
      <th>Dias trabajados</th>
      <th>Dias paradas (sin trabajar)</th>
      <th>Disponibilidad %</th>
      <th>Causas de inoperatividad</th>
    </tr></thead><tbody>`;

    FL.forEach((v, m) => {
      let worked = 0,
        stopped = 0,
        reasons = {};

      for (let d = 1; d <= nDays; d++) {
        const vSt = getVeh(m, ds(d));
        const def = VEH_STATES[vSt.st] || VEH_STATES.Operativa;
        if (!def.isDown) {
          worked++;
        } else {
          stopped++;
          reasons[def.label] = (reasons[def.label] || 0) + 1;
        }
      }

      const avail = Math.round((worked / nDays) * 100);
      const reasonSummary = Object.entries(reasons)
        .map(([lbl, cnt]) => `${lbl} (${cnt})`)
        .join(' · ') || 'Sin paradas';

      tblHtml += `<tr>
        <td><span class="mv-dot" style="background:${v.c}"></span><b>${esc(v.n)}</b></td>
        <td>${esc(v.t)}</td>
        <td>${nDays} dias</td>
        <td><b style="color:#2fa84f">${worked} dias</b></td>
        <td>${stopped > 0 ? `<b style="color:#d23b3b">${stopped} dias</b>` : '0 dias'}</td>
        <td style="min-width:130px">
          <div style="display:flex;align-items:center;gap:8px">
            <b>${avail} %</b>
            <div class="oc" style="flex:1"><i style="width:${avail}%;background:${avail >= 90 ? '#2fa84f' : '#f28c28'}"></i></div>
          </div>
        </td>
        <td><small style="color:var(--mut)">${esc(reasonSummary)}</small></td>
      </tr>`;
    });
    tblHtml += `</tbody>`;
    $('#vehSummaryTable').innerHTML = tblHtml;
  }

  // Matriz Diaria de Operatividad Vehicular
  if ($('#vehGridWrap')) {
    let vGrid = `<table><thead><tr><th class="c1">Movil</th><th class="c2">Tipo</th>`;
    for (let d = 1; d <= nDays; d++) {
      const f = ds(d),
        w = new Date(cur.y, cur.m, d).getDay();
      vGrid += `<th data-d="${f}" class="${w % 6 == 0 ? 'we' : ''} ${f == today ? 'td' : ''} ${f == sel ? 'sl' : ''}">${d}<small>${DN[w]}</small></th>`;
    }
    vGrid += `<th class="c3">Operatividad</th></tr></thead><tbody>`;

    FL.forEach((v, m) => {
      let worked = 0;
      vGrid += `<tr>
        <td class="c1" style="border-left:5px solid ${v.c}">${esc(v.n)}</td>
        <td class="c2"><b>${esc(v.t === 'Moto' ? 'Moto' : 'Movil')}</b></td>`;

      for (let d = 1; d <= nDays; d++) {
        const f = ds(d),
          vSt = getVeh(m, f),
          def = VEH_STATES[vSt.st] || VEH_STATES.Operativa,
          w = new Date(cur.y, cur.m, d).getDay();

        if (!def.isDown) worked++;
        const tagCls = def.isDown
          ? vSt.st === 'Taller'
            ? 'taller'
            : vSt.st === 'Varada'
            ? 'varada'
            : vSt.st === 'Sin_Personal'
            ? 'sin-pax'
            : 'descanso'
          : 'op';

        const tip = `${v.n} (${f}): ${def.label}${vSt.reason ? ' - ' + vSt.reason : ''}${vSt.note ? ' (' + vSt.note + ')' : ''}`;
        vGrid += `<td class="e ${w % 6 == 0 ? 'we' : ''} ${f == today ? 'td' : ''}" data-veh-cell="1" data-m="${m}" data-f="${f}" title="${esc(tip)}">
          <span class="veh-cell-tag ${tagCls}">${def.tag}</span>
        </td>`;
      }

      const avail = Math.round((worked / nDays) * 100);
      vGrid += `<td class="c3"><b>${avail} %</b><div class="oc"><i style="width:${avail}%;background:${avail >= 90 ? '#2fa84f' : '#f28c28'}"></i></div></td></tr>`;
    });

    vGrid += `</tbody></table>`;
    $('#vehGridWrap').innerHTML = vGrid;
  }
}

// ==========================================================================
// 8. PESTAÑA 4: ESTADÍSTICAS OPERATIVAS Y CONTROL DE HORAS EXTRAS (NORMATIVA COLOMBIA)
// ==========================================================================
function renderStatsTab() {
  const nDays = dim();
  const A = [...D.values()].filter(a => inMonth(a) && a.m < FL.length);

  // Totales generales y desglose legal de horas según Código Sustantivo del Trabajo
  let totalHours = 0,
    totalManHours = 0,
    totalOrdinarias = 0,
    totalExtrasDiurnas = 0,
    totalExtrasNocturnas = 0;

  A.forEach(a => {
    const dur = a.dur || calcDuration(a.start, a.end, a.s);
    const px = getPax(a.m, a.f);
    const lb = calcLaborBreakdown(dur, a.end);

    totalHours += dur;
    totalManHours += dur * px.n;
    totalOrdinarias += lb.ordinarias;
    totalExtrasDiurnas += lb.extrasDiurnas;
    totalExtrasNocturnas += lb.extrasNocturnas;
  });

  const totalExtras = totalExtrasDiurnas + totalExtrasNocturnas;
  const doneActs = A.filter(a => a.e === 'h');
  const inProgActs = A.filter(a => a.e === 'c');
  const pendActs = A.filter(a => a.e === 'p');
  const blockActs = A.filter(a => a.e === 'b');
  const pctDone = A.length ? Math.round((doneActs.length / A.length) * 100) : 0;
  const avgDuration = A.length ? (totalHours / A.length).toFixed(1) : '0.0';

  // Días paradas de camionetas
  let monthDaysStopped = 0;
  for (let d = 1; d <= nDays; d++) {
    const fStr = ds(d);
    FL.forEach((v, m) => {
      if (getVeh(m, fStr).st !== 'Operativa') monthDaysStopped++;
    });
  }

  // 1. Tarjetas Superiores Hero KPIs
  if ($('#statsHeroGrid')) {
    $('#statsHeroGrid').innerHTML = [
      ['Total visitas mes', A.length, `${doneActs.length} hechas · ${inProgActs.length} en curso`],
      ['Horas tecnicas totales', totalHours.toFixed(1) + ' h', `Promedio: ${avgDuration} h por visita`],
      ['Horas ordinarias (Ley 2101)', totalOrdinarias.toFixed(1) + ' h', `Base legal 42h semanales`],
      ['Horas extras totales', totalExtras.toFixed(1) + ' h', `${totalExtrasDiurnas.toFixed(1)}h HED (+25%) · ${totalExtrasNocturnas.toFixed(1)}h HEN (+75%)`],
      ['Horas-hombre O&M', totalManHours.toFixed(1) + ' h-h', `Esfuerzo cuadrillas presentes`],
      ['Cumplimiento visitas', pctDone + ' %', `${blockActs.length} visitas bloqueadas`]
    ]
      .map(
        x => `<div class="stat-hero-card">
          <span>${x[0]}</span>
          <b>${x[1]}</b>
          <small>${x[2]}</small>
        </div>`
      )
      .join('');
  }

  // 2. BLOQUE A: TIEMPOS POR ACTIVIDADES
  const kindStats = {};
  Object.keys(TP).forEach(k => {
    kindStats[k] = { code: k, label: TP[k][0], color: TP[k][1], count: 0, hours: 0, done: 0 };
  });

  A.forEach(a => {
    const k = kindStats[a.k] ? a.k : 'O';
    const dur = a.dur || calcDuration(a.start, a.end, a.s);
    kindStats[k].count++;
    kindStats[k].hours += dur;
    if (a.e === 'h') kindStats[k].done++;
  });

  const sortedKinds = Object.values(kindStats).sort((a, b) => b.hours - a.hours);

  if ($('#statsTimeBars')) {
    $('#statsTimeBars').innerHTML = sortedKinds.map(ks => {
      const pctTime = totalHours ? Math.round((ks.hours / totalHours) * 100) : 0;
      const avgH = ks.count ? (ks.hours / ks.count).toFixed(1) : '0.0';

      return `<div class="stat-bar-row">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="sw" style="--c:${ks.color}"></span>
          <b>${esc(ks.label)}</b>
        </div>
        <div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width:${pctTime}%;background:${ks.color}"></div>
          </div>
        </div>
        <div style="text-align:right">
          <b>${ks.hours.toFixed(1)} h</b>
          <small style="display:block;color:var(--mut);font-size:11px">${ks.count} visitas (${avgH}h prom.)</small>
        </div>
      </div>`;
    }).join('');
  }

  // Franjas horarias y desglose ordinario/extra
  let amHours = 0,
    pmHours = 0,
    diaHours = 0;
  A.forEach(a => {
    const dur = a.dur || calcDuration(a.start, a.end, a.s);
    if (a.s === 'AM') amHours += dur;
    else if (a.s === 'PM') pmHours += dur;
    else diaHours += dur;
  });

  if ($('#statsDurationCards')) {
    $('#statsDurationCards').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div class="egm-stat-item">
          <span>Horas ordinarias</span>
          <b style="color:#2fa84f">${totalOrdinarias.toFixed(1)} h</b>
          <small style="color:var(--mut)">CST máx 8h/día</small>
        </div>
        <div class="egm-stat-item">
          <span>Horas extras</span>
          <b style="color:#e0561b">${totalExtras.toFixed(1)} h</b>
          <small style="color:var(--mut)">HED (+25%) / HEN (+75%)</small>
        </div>
      </div>

      <b>Distribucion de horas por franja horaria:</b>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
            <span>Franja AM (Manana)</span>
            <b>${amHours.toFixed(1)} h (${totalHours ? Math.round((amHours / totalHours) * 100) : 0}%)</b>
          </div>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${totalHours ? (amHours / totalHours) * 100 : 0}%;background:#2b7bff"></div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
            <span>Franja PM (Tarde)</span>
            <b>${pmHours.toFixed(1)} h (${totalHours ? Math.round((pmHours / totalHours) * 100) : 0}%)</b>
          </div>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${totalHours ? (pmHours / totalHours) * 100 : 0}%;background:#f28c28"></div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
            <span>Dia completo (Jornadas tecnicas intensivas)</span>
            <b>${diaHours.toFixed(1)} h (${totalHours ? Math.round((diaHours / totalHours) * 100) : 0}%)</b>
          </div>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${totalHours ? (diaHours / totalHours) * 100 : 0}%;background:#8a5cf6"></div></div>
        </div>
      </div>`;
  }

  // 3. BLOQUE B: CONTROL DE HORAS EXTRAS Y JORNADA LABORAL (NORMATIVA COLOMBIANA CST / LEY 2101)
  if ($('#statsOvertimeTable')) {
    let otHtml = `<thead><tr>
      <th>Movil / Motorizado</th>
      <th>Tipo</th>
      <th>Horas Ordinarias</th>
      <th>Horas Extras Diurnas (HED +25%)</th>
      <th>Horas Extras Nocturnas (HEN +75%)</th>
      <th>Total Horas Extras Mes</th>
      <th>Promedio Semanal Extras</th>
      <th>Cumplimiento Tope CST (Max 12h/sem)</th>
    </tr></thead><tbody>`;

    FL.forEach((v, m) => {
      const actsM = A.filter(a => a.m === m);
      let mOrd = 0,
        mHed = 0,
        mHen = 0,
        diasConExceso = 0;

      actsM.forEach(a => {
        const dur = a.dur || calcDuration(a.start, a.end, a.s);
        const lb = calcLaborBreakdown(dur, a.end);
        mOrd += lb.ordinarias;
        mHed += lb.extrasDiurnas;
        mHen += lb.extrasNocturnas;
        if (lb.excedeTopeDiario) diasConExceso++;
      });

      const mTotExt = mHed + mHen;
      const semanasMes = nDays / 7;
      const promSemanal = (mTotExt / semanasMes).toFixed(1);
      const excedeSemanal = promSemanal > 12.0;

      const badgeCst = excedeSemanal
        ? `<span class="pax-pill warn" style="background:#d23b3b;color:#fff">⚠️ Excede tope legal (${promSemanal}h > 12h)</span>`
        : diasConExceso > 0
        ? `<span class="pax-pill warn">⚠️ ${diasConExceso} dia(s) con >2h extra</span>`
        : `<span class="pax-pill ok">🟢 Cumple CST</span>`;

      otHtml += `<tr>
        <td><span class="mv-dot" style="background:${v.c}"></span><b>${esc(v.n)}</b></td>
        <td>${esc(v.t)}</td>
        <td><b>${mOrd.toFixed(1)} h</b></td>
        <td>${mHed > 0 ? `<b style="color:#f28c28">${mHed.toFixed(1)} h</b>` : '0.0 h'}</td>
        <td>${mHen > 0 ? `<b style="color:#d23b3b">${mHen.toFixed(1)} h</b>` : '0.0 h'}</td>
        <td><b>${mTotExt.toFixed(1)} h</b></td>
        <td>${promSemanal} h / sem</td>
        <td>${badgeCst}</td>
      </tr>`;
    });

    otHtml += `</tbody>`;
    $('#statsOvertimeTable').innerHTML = otHtml;
  }

  // 4. BLOQUE C: CANTIDAD DE VISITAS POR MOVILES
  if ($('#statsVisitsTable')) {
    let vTbl = `<thead><tr>
      <th>Movil / Motorizado</th>
      <th>Tipo</th>
      <th>Hechas (Realizadas)</th>
      <th>En curso</th>
      <th>Pendientes</th>
      <th>Bloqueadas</th>
      <th>Total Visitas</th>
      <th>Horas Totales</th>
      <th>Cumplimiento %</th>
      <th>Distribucion de Estados</th>
    </tr></thead><tbody>`;

    FL.forEach((v, m) => {
      const actsM = A.filter(a => a.m === m);
      const dM = actsM.filter(a => a.e === 'h').length;
      const cM = actsM.filter(a => a.e === 'c').length;
      const pM = actsM.filter(a => a.e === 'p').length;
      const bM = actsM.filter(a => a.e === 'b').length;
      const totM = actsM.length;
      const pctM = totM ? Math.round((dM / totM) * 100) : 0;
      const hM = actsM.reduce((acc, a) => acc + (a.dur || calcDuration(a.start, a.end, a.s)), 0);

      const segD = totM ? (dM / totM) * 100 : 0;
      const segC = totM ? (cM / totM) * 100 : 0;
      const segP = totM ? (pM / totM) * 100 : 0;
      const segB = totM ? (bM / totM) * 100 : 0;

      vTbl += `<tr>
        <td><span class="mv-dot" style="background:${v.c}"></span><b>${esc(v.n)}</b></td>
        <td>${esc(v.t)}</td>
        <td><b style="color:#2fa84f">${dM}</b></td>
        <td><b style="color:#2b7bff">${cM}</b></td>
        <td><b>${pM}</b></td>
        <td>${bM > 0 ? `<b style="color:#d23b3b">${bM}</b>` : '0'}</td>
        <td><b>${totM}</b></td>
        <td>${hM.toFixed(1)} h</td>
        <td><b>${pctM} %</b></td>
        <td style="min-width:140px">
          <div class="stacked-bar">
            <div class="stacked-segment" style="width:${segD}%;background:#2fa84f" title="Hechas: ${dM}"></div>
            <div class="stacked-segment" style="width:${segC}%;background:#2b7bff" title="En curso: ${cM}"></div>
            <div class="stacked-segment" style="width:${segP}%;background:#f28c28" title="Pendientes: ${pM}"></div>
            <div class="stacked-segment" style="width:${segB}%;background:#d23b3b" title="Bloqueadas: ${bM}"></div>
          </div>
        </td>
      </tr>`;
    });

    vTbl += `</tbody>`;
    $('#statsVisitsTable').innerHTML = vTbl;
  }

  // 5. BLOQUE D: ESTADOS DE LAS ACTIVIDADES
  const segDone = A.length ? Math.round((doneActs.length / A.length) * 100) : 0;
  const segProg = A.length ? Math.round((inProgActs.length / A.length) * 100) : 0;
  const segPend = A.length ? Math.round((pendActs.length / A.length) * 100) : 0;
  const segBlock = A.length ? Math.round((blockActs.length / A.length) * 100) : 0;

  if ($('#statsStatusChart')) {
    $('#statsStatusChart').innerHTML = `
      <div style="margin-bottom:14px">
        <div class="stacked-bar" style="height:26px">
          <div class="stacked-segment" style="width:${segDone}%;background:#2fa84f" title="Hechas: ${doneActs.length} (${segDone}%)"></div>
          <div class="stacked-segment" style="width:${segProg}%;background:#2b7bff" title="En curso: ${inProgActs.length} (${segProg}%)"></div>
          <div class="stacked-segment" style="width:${segPend}%;background:#f28c28" title="Pendientes: ${pendActs.length} (${segPend}%)"></div>
          <div class="stacked-segment" style="width:${segBlock}%;background:#d23b3b" title="Bloqueadas: ${blockActs.length} (${segBlock}%)"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:8px">
        <div class="egm-stat-item" style="border-left:3px solid #2fa84f">
          <span>Hechas</span>
          <b style="color:#2fa84f">${doneActs.length}</b>
          <small>${segDone} % del total</small>
        </div>
        <div class="egm-stat-item" style="border-left:3px solid #2b7bff">
          <span>En curso</span>
          <b style="color:#2b7bff">${inProgActs.length}</b>
          <small>${segProg} % del total</small>
        </div>
        <div class="egm-stat-item" style="border-left:3px solid #f28c28">
          <span>Pendientes</span>
          <b style="color:#f28c28">${pendActs.length}</b>
          <small>${segPend} % del total</small>
        </div>
        <div class="egm-stat-item" style="border-left:3px solid #d23b3b">
          <span>Bloqueadas</span>
          <b style="color:#d23b3b">${blockActs.length}</b>
          <small>${segBlock} % del total</small>
        </div>
      </div>`;
  }

  // Lista de Bloqueadas
  if ($('#statsBlockedList')) {
    $('#statsBlockedList').innerHTML = blockActs.length
      ? `<div style="max-height:190px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
          ${blockActs.map(a => {
            const v = FL[a.m] || { n: 'Movil' };
            const tp = TP[a.k] || TP.P;
            return `<div style="padding:8px 10px;background:var(--bg);border-radius:8px;border-left:3px solid #d23b3b">
              <div style="display:flex;justify-content:space-between;font-size:12px">
                <b>${esc(a.t)}</b>
                <span class="pax-pill warn">${a.f} · ${a.s}</span>
              </div>
              <small style="color:var(--mut);display:block;margin-top:2px">${esc(v.n)} · ${tp[0]}${a.tik ? ' · ' + esc(a.tik) : ''}</small>
              ${a.notes ? `<small style="color:#d23b3b;display:block;margin-top:2px">⚠️ Motivo: ${esc(a.notes)}</small>` : ''}
            </div>`;
          }).join('')}
        </div>`
      : `<div class="note" style="margin-top:10px">Excelente: no hay visitas bloqueadas registradas en este mes.</div>`;
  }

  // 6. AUDITOR OPERATIVO Y ALERTAS LABORALES
  const auditAlerts = [];

  // Alerta 1: Exceso legal de horas extras diarias (CST Art. 22 Ley 50/1990)
  A.forEach(a => {
    const dur = a.dur || calcDuration(a.start, a.end, a.s);
    const lb = calcLaborBreakdown(dur, a.end);
    if (lb.excedeTopeDiario) {
      auditAlerts.push({
        type: 'alert',
        title: '⚠️ Exceso de Jornada y Horas Extras (Norma CST Colombia)',
        desc: `La unidad "${FL[a.m]?.n}" tiene una jornada de ${dur}h el ${a.f} (${lb.totalExtras}h extras). El Codigo Sustantivo del Trabajo prohibe exceder 2 horas extras diarias por trabajador.`
      });
    }
  });

  // Alerta 2: Actividades en moviles paradas
  A.forEach(a => {
    const vSt = getVeh(a.m, a.f);
    if (vSt.st !== 'Operativa') {
      auditAlerts.push({
        type: 'alert',
        title: '⚠️ Movil Inoperativa con Visita Asignada',
        desc: `La unidad "${FL[a.m]?.n}" tiene la actividad "${a.t}" el ${a.f} (${a.s}), pero el vehiculo esta marcado como "${VEH_STATES[vSt.st]?.label || vSt.st}". Se requiere reasignar la visita o habilitar el vehiculo.`
      });
    }
  });

  // Alerta 3: Visitas de alta prioridad con dotación incompleta
  A.forEach(a => {
    if (a.prio === 'Critica' || a.prio === 'Alta') {
      const px = getPax(a.m, a.f);
      const req = FL[a.m]?.p || 1;
      if (px.n < req) {
        auditAlerts.push({
          type: 'warn',
          title: '⚠️ Dotacion Incompleta en Visita Prioritaria',
          desc: `La actividad critica "${a.t}" del ${a.f} cuenta con solo ${px.n} de ${req} personas en la cuadrilla (${px.st}). Se recomienda enviar apoyo operativo.`
        });
      }
    }
  });

  if (auditAlerts.length === 0) {
    auditAlerts.push({
      type: 'ok',
      title: '🟢 Cumplimiento Total de Normativa Laboral y Flota',
      desc: 'Todas las jornadas respetan los limites legales de horas extras diurnas y nocturnas del CST, y no se registran vehiculos parados con visitas asignadas.'
    });
  }

  if ($('#auditAlerts')) {
    $('#auditAlerts').innerHTML = auditAlerts
      .slice(0, 6)
      .map(
        al => `<div class="audit-card ${al.type}">
          <b>${al.title}</b>
          <p>${esc(al.desc)}</p>
        </div>`
      )
      .join('');
  }
}

// ==========================================================================
// 9. FUNCIÓN MAESTRA DE RENDERIZADO
// ==========================================================================
function render() {
  if ($('#ml')) $('#ml').textContent = MN[cur.m] + ' ' + cur.y;
  kpis();
  grid();
  agenda();
  renderPaxStats();
  renderVehTab();
  renderStatsTab();
  renderTicketTab();
}

// ==========================================================================
// 10. MODAL 1: CREAR / EDITAR ACTIVIDAD TÉCNICA
// ==========================================================================
function updateLiveDuration() {
  const s = $('#fs') ? $('#fs').value : 'AM';
  const start = $('#fStart') ? $('#fStart').value : '08:00';
  const end = $('#fEnd') ? $('#fEnd').value : '12:00';
  const dur = calcDuration(start, end, s);
  const lb = calcLaborBreakdown(dur, end);

  if ($('#fDurBadge')) $('#fDurBadge').textContent = `${dur} ${dur === 1 ? 'hora' : 'horas'}`;
  if ($('#fLaborBadge')) {
    $('#fLaborBadge').innerHTML = `${lb.ordinarias}h Ordinarias · ${lb.totalExtras > 0 ? `<b style="color:#e0561b">+${lb.totalExtras}h Extra (CST)</b>` : '0h Extra'}`;
  }
}

if ($('#fStart')) $('#fStart').oninput = updateLiveDuration;
if ($('#fEnd')) $('#fEnd').oninput = updateLiveDuration;
if ($('#fs')) {
  $('#fs').onchange = e => {
    const s = e.target.value;
    if ($('#fStart')) $('#fStart').value = s === 'PM' ? '13:00' : '08:00';
    if ($('#fEnd')) $('#fEnd').value = s === 'AM' ? '12:00' : '17:00';
    updateLiveDuration();
  };
}

function openD(a, isNew) {
  refreshFleetSelect();
  editId = isNew ? null : idOf(a);
  if ($('#dt')) $('#dt').textContent = isNew ? 'Nueva actividad' : 'Editar actividad';
  if ($('#fmv')) $('#fmv').value = a.m;
  if ($('#ff')) $('#ff').value = a.f;
  if ($('#fu')) $('#fu').value = '';
  if ($('#fs')) $('#fs').value = a.s;
  if ($('#fStart')) $('#fStart').value = a.start || (a.s === 'PM' ? '13:00' : '08:00');
  if ($('#fEnd')) $('#fEnd').value = a.end || (a.s === 'AM' ? '12:00' : '17:00');
  if ($('#fe2')) $('#fe2').value = a.e;
  if ($('#fk')) $('#fk').value = TP[a.k] ? a.k : 'P';
  if ($('#ft')) $('#ft').value = a.t || '';
  if ($('#fLoc')) $('#fLoc').value = a.loc ?? (FL[a.m]?.z || '');
  if ($('#fNode')) $('#fNode').value = a.node || '';
  if ($('#fTik')) $('#fTik').value = a.tik || '';
  if ($('#fPrio')) $('#fPrio').value = a.prio || 'Normal';
  if ($('#fLead')) $('#fLead').value = a.lead || '';
  if ($('#fNotes')) $('#fNotes').value = a.notes || '';
  if ($('#dd')) $('#dd').style.visibility = isNew ? 'hidden' : 'visible';
  updateLiveDuration();
  if ($('#dg')) $('#dg').showModal();
}

if ($('#fk')) {
  $('#fk').innerHTML = Object.entries(TP)
    .map(([k, v]) => `<option value="${k}">${v[0]}</option>`)
    .join('');
}

if ($('#add')) $('#add').onclick = () => openD({ m: 0, f: sel, s: 'AM', k: 'P', e: 'p', t: '' }, 1);
if ($('#dc')) $('#dc').onclick = () => $('#dg').close();

if ($('#ds')) {
  $('#ds').onclick = async () => {
    const m = +$('#fmv').value,
      f = $('#ff').value,
      u = $('#fu').value || f,
      s = $('#fs').value,
      t = $('#ft').value.trim();

    if (!f || !t || u < f) {
      toast('Revisa la fecha y escribe la actividad');
      return;
    }

    const start = $('#fStart').value;
    const end = $('#fEnd').value;
    const dur = calcDuration(start, end, s);

    const base = {
        m,
        s,
        t,
        k: $('#fk').value,
        e: $('#fe2').value,
        start,
        end,
        dur,
        loc: $('#fLoc').value.trim(),
        node: $('#fNode').value.trim(),
        tik: $('#fTik').value.trim(),
        prio: $('#fPrio').value,
        lead: $('#fLead').value.trim(),
        notes: $('#fNotes').value.trim()
      },
      P = [],
      X = new Set(editId ? [editId] : []);

    for (let d = new Date(f + 'T12:00'), i = 0; fd(d) <= u && i < 62; d.setDate(d.getDate() + 1), i++) {
      const a = { ...base, f: fd(d) };
      P.push(a);
      (s == 'DIA' ? ['AM', 'PM', 'DIA'] : [s, 'DIA']).forEach(x => X.add(`m${m}_${a.f}_${x}`));
    }

    const N = new Set(P.map(idOf));
    await many(
      del,
      [...X].filter(x => !N.has(x) && D.has(x))
    );
    await many(put, P);
    if ($('#dg')) $('#dg').close();
    render();
    toast(P.length > 1 ? P.length + ' dias programados' : 'Actividad tecnica guardada');
  };
}

if ($('#dd')) {
  $('#dd').onclick = async () => {
    await del(editId);
    if ($('#dg')) $('#dg').close();
    render();
    toast('Actividad eliminada');
  };
}

// ==========================================================================
// 11. MODAL 2: GESTIÓN DE MÓVILES Y MOTORIZADOS
// ==========================================================================
if ($('#mvType')) {
  $('#mvType').onchange = e => {
    if ($('#mvPax')) $('#mvPax').value = e.target.value === 'Moto' ? 1 : 3;
  };
}

function renderMvList() {
  if ($('#mvCount')) $('#mvCount').textContent = FL.length;
  if ($('#mvList')) {
    $('#mvList').innerHTML = FL.map(
      (v, i) => `<div class="mv-row">
        <div>
          <span class="mv-dot" style="background:${v.c}"></span>
          <b>${esc(v.n)}</b>
          <small>${esc(v.t)} · ${v.p} ${v.p === 1 ? 'persona' : 'personas'}${v.z ? ' · ' + esc(v.z) : ''}</small>
        </div>
        <button class="btn" type="button" data-del-mv="${i}" style="padding:3px 9px;font-size:11.5px">Eliminar</button>
      </div>`
    ).join('');
  }
}

if ($('#addMv')) {
  $('#addMv').onclick = () => {
    if ($('#mvName')) $('#mvName').value = '';
    if ($('#mvType')) $('#mvType').value = 'Camioneta';
    if ($('#mvZone')) $('#mvZone').value = 'Medellin';
    if ($('#mvPax')) $('#mvPax').value = 3;
    renderMvList();
    if ($('#dgMv')) $('#dgMv').showModal();
  };
}

if ($('#mvClose')) $('#mvClose').onclick = () => $('#dgMv').close();

if ($('#mvSave')) {
  $('#mvSave').onclick = () => {
    const name = $('#mvName').value.trim();
    const type = $('#mvType').value;
    const zone = $('#mvZone').value.trim() || 'Medellin';
    const pax = Math.max(1, Math.min(10, +$('#mvPax').value || (type === 'Moto' ? 1 : 3)));

    if (!name) {
      toast('Escribe el nombre de la movil o moto');
      return;
    }
    if (FL.some(v => norm(v.n) === norm(name))) {
      toast('Ya existe una unidad con ese nombre');
      return;
    }

    const color = type === 'Moto' ? '#f28c28' : '#2b7bff';
    const csvName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    FL.push({ n: name, t: type, c: color, z: zone, csv: csvName, p: pax });
    saveFleet();
    refreshFleetSelect();
    renderMvList();
    render();
    if ($('#mvName')) $('#mvName').value = '';
    toast(`${type === 'Moto' ? 'Moto' : 'Movil'} "${name}" (${pax} pers.) adicionada`);
  };
}

if ($('#mvList')) {
  $('#mvList').onclick = e => {
    const btn = e.target.closest('button[data-del-mv]');
    if (!btn) return;
    const idx = +btn.dataset.delMv;
    if (FL.length <= 1) {
      toast('Debe existir al menos una unidad en el cronograma');
      return;
    }
    const unit = FL[idx];
    if (!confirm(`¿Eliminar "${unit.n}" y sus registros asociados?`)) return;

    FL.splice(idx, 1);
    const nextD = new Map();
    for (const [, a] of D) {
      if (a.m === idx) continue;
      const updated = a.m > idx ? { ...a, m: a.m - 1 } : a;
      nextD.set(idOf(updated), updated);
    }
    D = nextD;

    const nextPax = new Map();
    for (const [, p] of PAX) {
      if (p.m === idx) continue;
      const updatedP = p.m > idx ? { ...p, m: p.m - 1 } : p;
      nextPax.set(paxKey(updatedP.m, updatedP.f), updatedP);
    }
    PAX = nextPax;

    const nextVeh = new Map();
    for (const [, v] of VEH) {
      if (v.m === idx) continue;
      const updatedV = v.m > idx ? { ...v, m: v.m - 1 } : v;
      nextVeh.set(vehKey(updatedV.m, updatedV.f), updatedV);
    }
    VEH = nextVeh;

    saveFleet();
    lsSave();
    savePaxStore();
    saveVehStore();
    refreshFleetSelect();
    renderMvList();
    render();
    toast(`Unidad "${unit.n}" eliminada`);
  };
}

// ==========================================================================
// 12. MODAL 3: CONTROL DIARIO DE PERSONAL
// ==========================================================================
function openPaxModal(m, dateStr) {
  activePaxUnit = m;
  const unit = FL[m];
  const px = getPax(m, dateStr);
  if ($('#pxTitle')) $('#pxTitle').textContent = `Control de personal · ${unit.n}`;
  if ($('#pxSub')) $('#pxSub').textContent = `Dotacion requerida: ${unit.p} ${unit.p === 1 ? 'persona' : 'personas'} (${unit.t} · ${unit.z || 'O&M'})`;
  if ($('#pxDate')) $('#pxDate').value = dateStr;
  if ($('#pxUntil')) $('#pxUntil').value = '';
  if ($('#pxCount')) $('#pxCount').value = px.n;
  if ($('#pxStatus')) $('#pxStatus').value = px.st || 'Completa';
  if ($('#pxNames')) $('#pxNames').value = px.names || '';
  if ($('#pxNote')) $('#pxNote').value = px.note || '';
  if ($('#dgPax')) $('#dgPax').showModal();
}

if ($('#pxCancel')) $('#pxCancel').onclick = () => $('#dgPax').close();

if ($('#pxSave')) {
  $('#pxSave').onclick = () => {
    const m = activePaxUnit;
    const unit = FL[m];
    const f = $('#pxDate').value || sel;
    const u = $('#pxUntil').value || f;
    if (u < f) {
      toast('La fecha final debe ser igual o posterior a la inicial');
      return;
    }
    const n = Math.max(0, Math.min(12, +$('#pxCount').value || 0));
    let st = $('#pxStatus').value;
    if (n < unit.p && st === 'Completa') st = 'Incapacidad';
    const names = $('#pxNames').value.trim();
    const note = $('#pxNote').value.trim();

    let daysUpdated = 0;
    for (let d = new Date(f + 'T12:00'), i = 0; fd(d) <= u && i < 62; d.setDate(d.getDate() + 1), i++) {
      const dStr = fd(d);
      PAX.set(paxKey(m, dStr), { m, f: dStr, n, req: unit.p, st, names, note });
      daysUpdated++;
    }
    savePaxStore();
    if ($('#dgPax')) $('#dgPax').close();
    render();
    toast(daysUpdated > 1 ? `Personal actualizado por ${daysUpdated} dias` : `Personal de ${unit.n} actualizado (${n}/${unit.p})`);
  };
}

// ==========================================================================
// 13. MODAL 4: CONTROL DE OPERATIVIDAD Y DÍAS QUE LAS CAMIONETAS DEJAN DE TRABAJAR
// ==========================================================================
function openVehModal(m, dateStr) {
  activeVehUnit = m;
  refreshFleetSelect();
  const unit = FL[m];
  const vSt = getVeh(m, dateStr);

  if ($('#vehModalTitle')) $('#vehModalTitle').textContent = `Operatividad de unidad · ${unit.n}`;
  if ($('#vehModalSub')) $('#vehModalSub').textContent = `Control de operatividad: dias en servicio vs dias que deja de trabajar (${unit.t} · ${unit.z || 'O&M'})`;
  if ($('#vehUnit')) $('#vehUnit').value = m;
  if ($('#vehDate')) $('#vehDate').value = dateStr;
  if ($('#vehUntil')) $('#vehUntil').value = '';
  if ($('#vehStatus')) $('#vehStatus').value = vSt.st || 'Operativa';
  if ($('#vehReason')) $('#vehReason').value = vSt.reason || '';
  if ($('#vehNotes')) $('#vehNotes').value = vSt.note || '';
  if ($('#dgVeh')) $('#dgVeh').showModal();
}

if ($('#vehCancel')) $('#vehCancel').onclick = () => $('#dgVeh').close();

if ($('#vehSave')) {
  $('#vehSave').onclick = () => {
    const m = +$('#vehUnit').value;
    const unit = FL[m];
    const f = $('#vehDate').value || sel;
    const u = $('#vehUntil').value || f;
    if (u < f) {
      toast('La fecha final debe ser posterior o igual a la inicial');
      return;
    }

    const st = $('#vehStatus').value;
    const reason = $('#vehReason').value.trim();
    const note = $('#vehNotes').value.trim();

    let daysUpdated = 0;
    for (let d = new Date(f + 'T12:00'), i = 0; fd(d) <= u && i < 62; d.setDate(d.getDate() + 1), i++) {
      const dStr = fd(d);
      VEH.set(vehKey(m, dStr), { m, f: dStr, st, reason, note });
      daysUpdated++;
    }

    saveVehStore();
    if ($('#dgVeh')) $('#dgVeh').close();
    render();

    const isDown = VEH_STATES[st]?.isDown;
    toast(
      daysUpdated > 1
        ? `Estado de ${unit.n} actualizado por ${daysUpdated} dias (${st})`
        : `${unit.n}: ${isDown ? '⚠️ Marcada fuera de servicio (' + st + ')' : '🟢 Operativa en servicio'}`
    );
  };
}

if ($('#btnOpenVehModal')) $('#btnOpenVehModal').onclick = () => openVehModal(0, sel);
if ($('#btnQuickRegVeh')) $('#btnQuickRegVeh').onclick = () => openVehModal(0, sel);

// ==========================================================================
// 14. EVENTOS DE CRONOGRAMA, AGENDA Y MATRICES
// ==========================================================================
if ($('#pv')) {
  $('#pv').onclick = () => {
    cur.m--;
    if (cur.m < 0) {
      cur.m = 11;
      cur.y--;
    }
    sel = ds(1);
    render();
  };
}

if ($('#nx')) {
  $('#nx').onclick = () => {
    cur.m++;
    if (cur.m > 11) {
      cur.m = 0;
      cur.y++;
    }
    sel = ds(1);
    render();
  };
}

const mv = n => {
  const d = new Date(sel + 'T12:00');
  d.setDate(d.getDate() + n);
  sel = fd(d);
  cur = { y: d.getFullYear(), m: d.getMonth() };
  render();
};

if ($('#dp')) $('#dp').onclick = () => mv(-1);
if ($('#dn')) $('#dn').onclick = () => mv(1);
if ($('#hoy')) {
  $('#hoy').onclick = () => {
    sel = today;
    cur = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 };
    render();
  };
}

if ($('#pxDp')) $('#pxDp').onclick = () => mv(-1);
if ($('#pxDn')) $('#pxDn').onclick = () => mv(1);
if ($('#pxHoy')) {
  $('#pxHoy').onclick = () => {
    sel = today;
    cur = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 };
    render();
  };
}

if ($('#vehDp')) $('#vehDp').onclick = () => mv(-1);
if ($('#vehDn')) $('#vehDn').onclick = () => mv(1);
if ($('#vehHoy')) {
  $('#vehHoy').onclick = () => {
    sel = today;
    cur = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 };
    render();
  };
}

['q', 'fe'].forEach(i => {
  const el = $('#' + i);
  if (el) el.oninput = render;
});

if ($('#lg')) {
  $('#lg').onclick = e => {
    const l = e.target.closest('.lg');
    if (l) {
      hid.has(l.dataset.k) ? hid.delete(l.dataset.k) : hid.add(l.dataset.k);
      render();
    }
  };
}

if ($('#gw')) {
  $('#gw').onclick = e => {
    const h = e.target.closest('th[data-d]');
    if (h) {
      sel = h.dataset.d;
      render();
      if ($('#dl')) $('#dl').scrollIntoView({ block: 'center' });
      return;
    }
    const c = e.target.closest('td.e');
    if (!c) return;
    const a = get(+c.dataset.m, c.dataset.f, c.dataset.s) || get(+c.dataset.m, c.dataset.f, 'DIA');
    a ? openD(a) : openD({ m: +c.dataset.m, f: c.dataset.f, s: c.dataset.s, k: 'P', e: 'p', t: '' }, 1);
  };
}

if ($('#ag')) {
  $('#ag').onclick = async e => {
    const vehBtn = e.target.closest('button[data-veh-open]');
    if (vehBtn) {
      openVehModal(+vehBtn.dataset.vehOpen, sel);
      return;
    }

    const paxBar = e.target.closest('.pax-bar');
    if (paxBar) {
      const m = +paxBar.dataset.paxM;
      const stepBtn = e.target.closest('button[data-px-step]');
      if (stepBtn) {
        const delta = +stepBtn.dataset.pxStep;
        const curPx = getPax(m, sel);
        const req = FL[m].p;
        const nextN = Math.max(0, Math.min(10, curPx.n + delta));
        const nextSt = nextN >= req ? 'Completa' : curPx.st === 'Completa' ? 'Permiso' : curPx.st;
        PAX.set(paxKey(m, sel), { ...curPx, m, f: sel, n: nextN, req, st: nextSt });
        savePaxStore();
        render();
        return;
      }
      if (e.target.closest('button[data-px-open]')) {
        openPaxModal(m, sel);
        return;
      }
    }

    const fr = e.target.closest('.free');
    if (fr) return openD({ m: +fr.dataset.m, f: sel, s: fr.dataset.s, k: 'P', e: 'p', t: '' }, 1);

    const box = e.target.closest('.act');
    if (!box) return;
    const a = D.get(box.dataset.id),
      b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ed) return openD(a);
    const q = b.dataset.q;
    await put({ ...a, e: a.e == q ? 'p' : q });
    render();
  };
}

if ($('#paxUnitChart')) {
  $('#paxUnitChart').onclick = e => {
    const row = e.target.closest('.st-row');
    if (!row) return;
    const m = +row.dataset.paxM;
    const stepBtn = e.target.closest('button[data-px-step]');
    if (stepBtn) {
      const delta = +stepBtn.dataset.pxStep;
      const curPx = getPax(m, sel);
      const req = FL[m].p;
      const nextN = Math.max(0, Math.min(10, curPx.n + delta));
      const nextSt = nextN >= req ? 'Completa' : curPx.st === 'Completa' ? 'Permiso' : curPx.st;
      PAX.set(paxKey(m, sel), { ...curPx, m, f: sel, n: nextN, req, st: nextSt });
      savePaxStore();
      render();
      return;
    }
    if (e.target.closest('button[data-px-open]')) {
      openPaxModal(m, sel);
    }
  };
}

if ($('#paxMonthBars')) {
  $('#paxMonthBars').onclick = e => {
    const col = e.target.closest('.d-col');
    if (col && col.dataset.d) {
      sel = col.dataset.d;
      render();
    }
  };
}

if ($('#paxGridWrap')) {
  $('#paxGridWrap').onclick = e => {
    const th = e.target.closest('th[data-d]');
    if (th) {
      sel = th.dataset.d;
      render();
      return;
    }
    const td = e.target.closest('td[data-pax-cell]');
    if (td) {
      openPaxModal(+td.dataset.m, td.dataset.f);
    }
  };
}

if ($('#vehDayList')) {
  $('#vehDayList').onclick = e => {
    const btn = e.target.closest('button[data-veh-open]');
    if (btn) openVehModal(+btn.dataset.vehOpen, sel);
  };
}

if ($('#vehGridWrap')) {
  $('#vehGridWrap').onclick = e => {
    const th = e.target.closest('th[data-d]');
    if (th) {
      sel = th.dataset.d;
      render();
      return;
    }
    const td = e.target.closest('td[data-veh-cell]');
    if (td) {
      openVehModal(+td.dataset.m, td.dataset.f);
    }
  };
}

// Botón de Cargar Simulación Completa
if ($('#ex')) {
  $('#ex').onclick = () => {
    generateSimulationData();
    toast('⚡ Simulacion completa de 324 visitas con horas extras (Colombia) cargada');
  };
}

let cf = 0;
if ($('#clr')) {
  $('#clr').onclick = async () => {
    const ks = [...D].filter(([, a]) => inMonth(a)).map(x => x[0]);
    if (!ks.length) return toast('El mes ya esta vacio');
    if (!cf) {
      cf = 1;
      $('#clr').textContent = '¿Seguro? Borra ' + ks.length;
      setTimeout(() => {
        cf = 0;
        $('#clr').textContent = 'Vaciar mes';
      }, 4000);
      return;
    }
    cf = 0;
    $('#clr').textContent = 'Vaciar mes';
    await many(del, ks);
    render();
    toast('Mes vaciado');
  };
}

// Botones de Respaldo y Restauración JSON
if ($('#btnExportJson')) $('#btnExportJson').onclick = exportJson;
if ($('#btnImportJson')) $('#btnImportJson').onclick = () => $('#fiJson').click();
if ($('#fiJson')) {
  $('#fiJson').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      importJsonData(parsed, 'archivo local');
    } catch (err) {
      toast('Error al leer el archivo JSON');
    }
  };
}
if ($('#btnSyncGh')) $('#btnSyncGh').onclick = () => loadFromGitHub(false);

// ==========================================================================
// 15. IMPORTACIÓN Y EXPORTACIÓN A EXCEL (.XLSX) CON NORMATIVA LABORAL
// ==========================================================================
const norm = s =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const fm = s => {
  const n = norm(s);
  return FL.findIndex(v => norm(v.n) == n || norm(v.csv) == n);
};

const kind = t => {
  t = norm(t);
  return /preventiv/.test(t)
    ? 'P'
    : /correctiv|falla|corte/.test(t)
    ? 'C'
    : /empalm|fusi|sangr/.test(t)
    ? 'E'
    : /medici|otdr|potencia/.test(t)
    ? 'M'
    : /enrutam|recorrido|ruta/.test(t)
    ? 'R'
    : /auditor|nodo/.test(t)
    ? 'A'
    : /depurac|limpieza|orden/.test(t)
    ? 'D'
    : 'O';
};

function tdate(v) {
  if (typeof v == 'number' && v > 40000 && v < 80000) {
    const o = XLSX.SSF.parse_date_code(v);
    return `${o.y}-${pad(o.m)}-${pad(o.d)}`;
  }
  if (typeof v == 'string') {
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  }
  return null;
}

if ($('#imp')) $('#imp').onclick = () => $('#fi').click();
if ($('#fi')) {
  $('#fi').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }),
        out = [],
        addedUnits = [];

      wb.SheetNames.forEach(sn => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
        if (!rows.length) return;
        let dc = {},
          hf = false,
          c = null;

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !row.length) continue;
          if (/^m[oó]viles$/i.test(String(row[0] || '').trim())) {
            dc = {};
            row.forEach((v, i) => {
              const d = tdate(v);
              if (d) dc[i] = d;
            });
            hf = /franja/i.test(String(row[1] || ''));
            c = null;
            continue;
          }
          if (r === 0 && !Object.keys(dc).length) {
            row.forEach((v, i) => {
              const d = tdate(v);
              if (d) dc[i] = d;
            });
            hf = /franja/i.test(String(row[1] || ''));
            if (Object.keys(dc).length) continue;
          }
          if (row[0]) {
            const rawName = String(row[0]).trim();
            c = fm(rawName);
            if (c < 0 && rawName) {
              const isMoto = /moto/i.test(rawName);
              const defaultP = isMoto ? 1 : /taraz|apartad/i.test(rawName) ? 4 : 3;
              FL.push({
                n: rawName,
                t: isMoto ? 'Moto' : 'Camioneta',
                c: isMoto ? '#f28c28' : '#2b7bff',
                z: 'Medellin',
                csv: rawName,
                p: defaultP
              });
              saveFleet();
              refreshFleetSelect();
              c = FL.length - 1;
              addedUnits.push(rawName);
            }
          }
          if (c == null || c < 0) continue;
          let s = 'DIA';
          if (hf) {
            const g = String(row[1] || '').toUpperCase();
            s = g.includes('PM') ? 'PM' : g.includes('AM') ? 'AM' : 'DIA';
          }
          for (const i in dc) {
            const t = row[i];
            if (t != null && String(t).trim()) {
              const start = s === 'PM' ? '13:00' : '08:00';
              const end = s === 'AM' ? '12:00' : '17:00';
              const dur = calcDuration(start, end, s);
              out.push({
                m: c,
                f: dc[i],
                s,
                t: String(t).trim(),
                k: kind(t),
                e: 'p',
                start,
                end,
                dur
              });
            }
          }
        }
      });

      if (!out.length && !addedUnits.length) {
        toast('No encontre actividades en el archivo');
        return;
      }
      if (out.length) {
        await many(put, out);
        const fs = out.map(a => a.f).sort();
        cur = { y: +fs[0].slice(0, 4), m: +fs[0].slice(5, 7) - 1 };
        sel = fs[0];
      }
      render();
      toast(
        out.length +
          ' actividades importadas' +
          (addedUnits.length ? ` · nuevas unidades: ${addedUnits.join(', ')}` : '')
      );
    } catch (x) {
      toast('No se pudo leer el archivo Excel/CSV');
    }
  };
}

if ($('#exp')) {
  $('#exp').onclick = () => {
    const n = dim(),
      ser = d => Math.round(Date.UTC(cur.y, cur.m, d) / 864e5) + 25569,
      rows = [['MOVILES', 'FRANJA', ...Array.from({ length: n }, (_, i) => ser(i + 1))]];

    FL.forEach((v, m) =>
      ['AM', 'PM'].forEach((s, r) =>
        rows.push([
          r ? null : v.n,
          'Actividad ' + s,
          ...Array.from({ length: n }, (_, i) => {
            const a = get(m, ds(i + 1), s) || get(m, ds(i + 1), 'DIA');
            return a ? a.t : null;
          })
        ])
      )
    );

    const w1 = XLSX.utils.aoa_to_sheet(rows);
    for (let i = 0; i < n; i++) w1[XLSX.utils.encode_cell({ r: 0, c: i + 2 })].z = 'd-mmm';
    w1['!cols'] = [{ wch: 24 }, { wch: 16 }, ...Array(n).fill({ wch: 22 })];

    // Hoja 2: Actividades Detalladas con Horarios, Duración y Horas Extras (Colombia)
    const A = [...D.values()]
      .filter(a => inMonth(a) && a.m < FL.length)
      .sort((a, b) => a.f.localeCompare(b.f) || a.m - b.m || a.s.localeCompare(b.s));

    const w2 = XLSX.utils.aoa_to_sheet([
      [
        'Fecha',
        'Movil / Motorizado',
        'Tipo Unidad',
        'Personal Requerido',
        'Personal Presente',
        'Franja',
        'Hora Inicio',
        'Hora Fin',
        'Duracion (Horas)',
        'Horas Ordinarias (CST)',
        'Horas Extras Diurnas (HED +25%)',
        'Horas Extras Nocturnas (HEN +75%)',
        'Tipo Actividad',
        'Estado',
        'Descripcion Actividad',
        'Zona',
        'Nodo / Tramo',
        'Ticket / TIK',
        'Prioridad',
        'Responsable',
        'Observaciones'
      ],
      ...A.map(a => {
        const px = getPax(a.m, a.f);
        const dur = a.dur || calcDuration(a.start, a.end, a.s);
        const lb = calcLaborBreakdown(dur, a.end);

        return [
          a.f,
          FL[a.m]?.n || '',
          FL[a.m]?.t || '',
          FL[a.m]?.p || 1,
          px.n,
          a.s,
          a.start || '',
          a.end || '',
          dur,
          lb.ordinarias,
          lb.extrasDiurnas,
          lb.extrasNocturnas,
          TP[a.k]?.[0] || '',
          ST[a.e] || a.e,
          a.t,
          a.loc || '',
          a.node || '',
          a.tik || '',
          a.prio || 'Normal',
          a.lead || '',
          a.notes || ''
        ];
      })
    ]);
    w2['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
      { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
      { wch: 18 }, { wch: 12 }, { wch: 45 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
      { wch: 10 }, { wch: 18 }, { wch: 30 }
    ];

    // Hoja 3: Asistencia de Personal
    const paxRows = [['Fecha', 'Movil / Motorizado', 'Tipo', 'Personal Requerido', 'Personal Disponible', 'Estado Dotacion', 'Integrantes', 'Observaciones']];
    for (let d = 1; d <= n; d++) {
      const fStr = ds(d);
      FL.forEach((v, m) => {
        const px = getPax(m, fStr);
        paxRows.push([fStr, v.n, v.t, v.p, px.n, px.st, px.names || '', px.note || '']);
      });
    }
    const w3 = XLSX.utils.aoa_to_sheet(paxRows);
    w3['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 35 }, { wch: 35 }];

    // Hoja 4: Inoperatividad Vehicular (Días que las camionetas dejan de trabajar)
    const vehRows = [['Fecha', 'Movil / Motorizado', 'Tipo Unidad', 'Estado Operativo', '¿Dejo de trabajar?', 'Causa / Justificacion', 'Observaciones']];
    for (let d = 1; d <= n; d++) {
      const fStr = ds(d);
      FL.forEach((v, m) => {
        const vSt = getVeh(m, fStr);
        const def = VEH_STATES[vSt.st] || VEH_STATES.Operativa;
        vehRows.push([fStr, v.n, v.t, def.label, def.isDown ? 'SI (Parada)' : 'NO (Operativa)', vSt.reason || '', vSt.note || '']);
      });
    }
    const w4 = XLSX.utils.aoa_to_sheet(vehRows);
    w4['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 36 }, { wch: 36 }];

    // Hoja 5: Horas Extras y Estadísticas Consolidadas (Normativa Colombia)
    const statsRows = [
      ['REPORTE CONSOLIDADO O&M Y HORAS EXTRAS (NORMATIVA LABORAL COLOMBIA)', ''],
      ['Mes', `${MN[cur.m]} ${cur.y}`],
      ['Total Visitas Tecnicas', A.length],
      ['Total Horas Tecnicas', A.reduce((acc, a) => acc + (a.dur || calcDuration(a.start, a.end, a.s)), 0).toFixed(1)],
      ['Total Horas Ordinarias (CST)', A.reduce((acc, a) => acc + calcLaborBreakdown(a.dur || calcDuration(a.start, a.end, a.s), a.end).ordinarias, 0).toFixed(1)],
      ['Total Horas Extras Diurnas (HED +25%)', A.reduce((acc, a) => acc + calcLaborBreakdown(a.dur || calcDuration(a.start, a.end, a.s), a.end).extrasDiurnas, 0).toFixed(1)],
      ['Total Horas Extras Nocturnas (HEN +75%)', A.reduce((acc, a) => acc + calcLaborBreakdown(a.dur || calcDuration(a.start, a.end, a.s), a.end).extrasNocturnas, 0).toFixed(1)],
      ['Cumplimiento General', (A.length ? Math.round((A.filter(a => a.e === 'h').length / A.length) * 100) : 0) + ' %'],
      [],
      ['DESGLOSE DE HORAS Y CUMPLIMIENTO CST POR MOVIL', 'Horas Ordinarias', 'Horas Extras', 'Promedio Semanal Extras', 'Tope CST (Max 12h/sem)'],
      ...FL.map((v, m) => {
        const actsM = A.filter(a => a.m === m);
        let mOrd = 0, mExt = 0;
        actsM.forEach(a => {
          const lb = calcLaborBreakdown(a.dur || calcDuration(a.start, a.end, a.s), a.end);
          mOrd += lb.ordinarias;
          mExt += lb.totalExtras;
        });
        const promSem = (mExt / (n / 7)).toFixed(1);
        const cumple = promSem <= 12.0 ? 'CUMPLE' : 'EXCEDE LIMITE LEGAL';
        return [v.n, mOrd.toFixed(1) + ' h', mExt.toFixed(1) + ' h', promSem + ' h/sem', cumple];
      })
    ];
    const w5 = XLSX.utils.aoa_to_sheet(statsRows);
    w5['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, w1, 'Cronograma_Mensual');
    XLSX.utils.book_append_sheet(wb, w2, 'Actividades_Detalladas');
    XLSX.utils.book_append_sheet(wb, w3, 'Personal_Diario');
    XLSX.utils.book_append_sheet(wb, w4, 'Inoperatividad_Flota');
    XLSX.utils.book_append_sheet(wb, w5, 'Horas_Extras_y_Estadisticas');
    XLSX.writeFile(wb, `cronograma_moviles_colombia_${MN[cur.m].toLowerCase()}_${cur.y}.xlsx`);
    toast('Archivo Excel con 5 hojas generado exitosamente');
  };
}

// ==========================================================================
// 14. PESTAÑA 5: GESTIÓN DE TICKET, PARADAS DE RELOJ Y PLANTILLA WHATSAPP
// ==========================================================================
function loadTicketState() {
  try {
    const rawTk = localStorage.getItem('ufco_ticket_data');
    if (rawTk) ticketData = Object.assign({}, DEFAULT_TICKET_DATA, JSON.parse(rawTk));
    const rawCs = localStorage.getItem('ufco_clock_stops');
    if (rawCs) clockStops = JSON.parse(rawCs);
  } catch (e) {}
}

function saveTicketState() {
  try {
    localStorage.setItem('ufco_ticket_data', JSON.stringify(ticketData));
    localStorage.setItem('ufco_clock_stops', JSON.stringify(clockStops));
  } catch (e) {}
}

function formatHoursMinutes(diffMs) {
  if (diffMs <= 0 || isNaN(diffMs)) return '0h 00m';
  const totalMins = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m < 10 ? '0' : ''}${m}m`;
}

function calcTicketTimes() {
  const tStart = new Date(ticketData.startFalla || '2026-11-01T00:40').getTime();
  const tEnd = new Date(ticketData.endFalla || '2026-11-01T18:30').getTime();
  const brutoMs = Math.max(0, tEnd - tStart);

  let paradasMs = 0;
  clockStops.forEach(cs => {
    const csStart = new Date(cs.start).getTime();
    const csEnd = new Date(cs.end).getTime();
    if (csEnd > csStart) {
      paradasMs += (csEnd - csStart);
    }
  });

  const netoMs = Math.max(0, brutoMs - paradasMs);
  const SLA_LIMIT_MS = 5 * 60 * 60 * 1000; // Límite contractual SLA de 5 horas
  const cumpleSla = netoMs <= SLA_LIMIT_MS;

  if ($('#tkKpiBruto')) $('#tkKpiBruto').textContent = formatHoursMinutes(brutoMs);
  if ($('#tkKpiParadas')) $('#tkKpiParadas').textContent = formatHoursMinutes(paradasMs);
  if ($('#tkKpiCantParadas')) $('#tkKpiCantParadas').textContent = `${clockStops.length} parada(s) registrada(s)`;
  if ($('#tkKpiNeto')) {
    $('#tkKpiNeto').textContent = formatHoursMinutes(netoMs);
    $('#tkKpiNeto').style.color = cumpleSla ? '#2fa84f' : '#d23b3b';
  }
  if ($('#tkKpiSla')) {
    if (cumpleSla) {
      const margen = SLA_LIMIT_MS - netoMs;
      $('#tkKpiSla').textContent = `Cumple SLA (${formatHoursMinutes(margen)} restantes)`;
      $('#tkKpiSla').style.color = '#2fa84f';
      if ($('#tkKpiSlaSub')) $('#tkKpiSlaSub').textContent = 'Dentro del límite contractual de 5h';
    } else {
      const exceso = netoMs - SLA_LIMIT_MS;
      $('#tkKpiSla').textContent = `Excede SLA (+${formatHoursMinutes(exceso)})`;
      $('#tkKpiSla').style.color = '#d23b3b';
      if ($('#tkKpiSlaSub')) $('#tkKpiSlaSub').textContent = 'Supera el límite contractual de 5h';
    }
  }
  if ($('#tkKpiRx')) $('#tkKpiRx').textContent = ticketData.potenciaRx || '-40.0 dBm';
  if ($('#tkNetoBadge')) {
    $('#tkNetoBadge').textContent = `${formatHoursMinutes(netoMs)} (${cumpleSla ? 'Cumple SLA 5h' : 'Excede SLA 5h'})`;
    $('#tkNetoBadge').style.background = cumpleSla ? 'rgba(47, 168, 79, 0.15)' : 'rgba(210, 59, 59, 0.15)';
    $('#tkNetoBadge').style.color = cumpleSla ? '#2fa84f' : '#d23b3b';
  }

  return { brutoMs, paradasMs, netoMs, cumpleSla, SLA_LIMIT_MS };
}

function renderClockStops() {
  const container = $('#clockStopList');
  if (!container) return;

  if (clockStops.length === 0) {
    container.innerHTML = `<div class="note" style="padding:10px 0;">No hay paradas de reloj registradas. Registra una parada para justificar tiempos muertos en el SLA.</div>`;
    return;
  }

  container.innerHTML = clockStops.map((cs, idx) => {
    const sTime = cs.start ? cs.start.replace('T', ' ') : '';
    const eTime = cs.end ? cs.end.replace('T', ' ') : '';
    const durMs = new Date(cs.end).getTime() - new Date(cs.start).getTime();
    const durStr = formatHoursMinutes(durMs);

    return `<div class="cs-card-item">
      <div class="cs-times">
        <b>#${idx + 1}. [${sTime} a ${eTime}] · <span style="color:#e0561b">${durStr}</span></b>
        <span><b>${esc(cs.reason)}:</b> ${esc(cs.detail || 'Sin detalle')}</span>
      </div>
      <button class="cs-del-btn" data-idx="${idx}" title="Eliminar parada de reloj">&times;</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.cs-del-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = +btn.getAttribute('data-idx');
      clockStops.splice(idx, 1);
      saveTicketState();
      calcTicketTimes();
      renderClockStops();
      generateWhatsAppTemplate();
    };
  });
}

function generateWhatsAppTemplate() {
  const times = calcTicketTimes();
  const v = FL[ticketData.unitM] || { n: 'Movil O&M Medellin 1' };

  let csText = '';
  if (clockStops.length === 0) {
    csText = '_Sin paradas de reloj reportadas_';
  } else {
    csText = clockStops.map((cs, i) => {
      const sT = cs.start.split('T')[1] || cs.start;
      const eT = cs.end.split('T')[1] || cs.end;
      const dMs = new Date(cs.end).getTime() - new Date(cs.start).getTime();
      return `${i + 1}. [${sT} - ${eT}] (${formatHoursMinutes(dMs)}) - ${cs.reason}${cs.detail ? ': ' + cs.detail : ''}`;
    }).join('\n');
  }

  const sF = ticketData.startFalla ? ticketData.startFalla.replace('T', ' ') : '';
  const sS = ticketData.startSitio ? ticketData.startSitio.replace('T', ' ') : '';
  const eF = ticketData.endFalla ? ticketData.endFalla.replace('T', ' ') : '';

  const tpl = `🎫 *REPORTE DE ATENCIÓN DE FALLA O&M*
━━━━━━━━━━━━━━━━━━━━━━
*No. Ticket:* ${ticketData.num}
*ID Cliente Ufinet:* ${ticketData.ufinet}
*Cliente:* ${ticketData.client}
*Cliente Final:* ${ticketData.finalClient}
*Contacto en Sitio:* ${ticketData.contact}
*Teléfono:* ${ticketData.phone}
*Dirección:* ${ticketData.address}
*Coordenadas:* ${ticketData.coords}

━━━━━━━━━━━━━━━━━━━━━━
⚠️ *DATOS TÉCNICOS DE LA FALLA*
*Tipo de Falla:* ${ticketData.type}
*Nodo:* ${ticketData.node}
*Equipo de Acceso:* ${ticketData.equipment}
*Puerto:* ${ticketData.port}
*Potencia Rx:* ${ticketData.potenciaRx || '-40.0 dBm (low-alarm)'}
*Cuadrilla Asignada:* ${v.n}

━━━━━━━━━━━━━━━━━━━━━━
⏱️ *CRONOMETRÍA Y PARADAS DE RELOJ*
*Inicio de Falla:* ${sF}
*Llegada a Sitio:* ${sS}
*Fin / Restablecimiento:* ${eF}
*Tiempo Bruto Total:* ${formatHoursMinutes(times.brutoMs)}

⏸️ *PARADAS DE RELOJ (TIEMPOS MUERTOS):*
${csText}
*Total Tiempos Muertos:* ${formatHoursMinutes(times.paradasMs)}

✅ *TIEMPO NETO DE ATENCIÓN O&M:* ${formatHoursMinutes(times.netoMs)}
🎯 *SLA CONTRACTUAL (LÍMITE 5H):* ${times.cumpleSla ? '✅ CUMPLE SLA (Dentro del límite de 5h)' : '⚠️ EXCEDE SLA (+ ' + formatHoursMinutes(times.netoMs - times.SLA_LIMIT_MS) + ' sobre límite de 5h)'}
*Diagnóstico:* ${ticketData.diagnostic}`;

  if ($('#waTemplateTextarea')) {
    $('#waTemplateTextarea').value = tpl;
  }
  if ($('#waTemplatePreview')) {
    $('#waTemplatePreview').textContent = tpl;
  }

  return tpl;
}

function bindTicketInputs() {
  if (ticketInputsBound) return;
  ticketInputsBound = true;

  const fields = [
    ['#tkNum', 'num'],
    ['#tkUfinet', 'ufinet'],
    ['#tkClient', 'client'],
    ['#tkFinalClient', 'finalClient'],
    ['#tkContact', 'contact'],
    ['#tkPhone', 'phone'],
    ['#tkAddress', 'address'],
    ['#tkCoords', 'coords'],
    ['#tkNode', 'node'],
    ['#tkEquipment', 'equipment'],
    ['#tkPort', 'port'],
    ['#tkPotenciaRx', 'potenciaRx'],
    ['#tkType', 'type'],
    ['#tkStartFalla', 'startFalla'],
    ['#tkStartSitio', 'startSitio'],
    ['#tkEndFalla', 'endFalla'],
    ['#tkUnitAssigned', 'unitM'],
    ['#tkDiagnostic', 'diagnostic']
  ];

  fields.forEach(([sel, prop]) => {
    const el = $(sel);
    if (!el) return;
    el.oninput = () => {
      ticketData[prop] = prop === 'unitM' ? +el.value : el.value;
      saveTicketState();
      calcTicketTimes();
      generateWhatsAppTemplate();
    };
  });

  if ($('#btnAddClockStop')) {
    $('#btnAddClockStop').onclick = () => {
      const start = $('#csStart').value;
      const end = $('#csEnd').value;
      const reason = $('#csReason').value;
      const detail = $('#csDetail').value;
      if (!start || !end) {
        toast('Ingresa la hora de inicio y fin de la parada de reloj');
        return;
      }
      clockStops.push({
        id: 'cs_' + Date.now(),
        start,
        end,
        reason,
        detail
      });
      $('#csDetail').value = '';
      saveTicketState();
      calcTicketTimes();
      renderClockStops();
      generateWhatsAppTemplate();
      toast('Parada de reloj agregada (tiempo muerto descontado)');
    };
  }

  if ($('#btnSaveClockStop')) {
    $('#btnSaveClockStop').onclick = () => {
      const start = $('#csStart').value;
      const end = $('#csEnd').value;
      const reason = $('#csReason').value;
      const detail = $('#csDetail').value;
      if (!start || !end) {
        toast('Ingresa la hora de inicio y fin de la parada de reloj');
        return;
      }
      clockStops.push({
        id: 'cs_' + Date.now(),
        start,
        end,
        reason,
        detail
      });
      $('#csDetail').value = '';
      saveTicketState();
      calcTicketTimes();
      renderClockStops();
      generateWhatsAppTemplate();
      toast('Parada de reloj guardada (tiempo muerto descontado)');
    };
  }

  const copyFn = async () => {
    const ta = $('#waTemplateTextarea');
    const text = (ta && ta.value) ? ta.value : generateWhatsAppTemplate();
    try {
      await navigator.clipboard.writeText(text);
      toast('¡Plantilla WhatsApp copiada al portapapeles!');
    } catch (e) {
      if (ta) {
        ta.select();
        document.execCommand('copy');
        toast('¡Plantilla WhatsApp copiada!');
      } else {
        const dummy = document.createElement('textarea');
        dummy.value = text;
        document.body.appendChild(dummy);
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        toast('¡Plantilla WhatsApp copiada!');
      }
    }
  };

  if ($('#btnCopyWaTemplate')) $('#btnCopyWaTemplate').onclick = copyFn;
  if ($('#btnCopyWaTemplate2')) $('#btnCopyWaTemplate2').onclick = copyFn;

  if ($('#btnPasteWaTemplate')) {
    $('#btnPasteWaTemplate').onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if ($('#waTemplateTextarea')) {
          $('#waTemplateTextarea').value = text;
          toast('Mensaje pegado exitosamente en el área de texto');
        }
      } catch (e) {
        toast('Usa Ctrl+V directamente dentro del área de texto para pegar');
        if ($('#waTemplateTextarea')) $('#waTemplateTextarea').focus();
      }
    };
  }

  if ($('#btnRegenWaTemplate')) {
    $('#btnRegenWaTemplate').onclick = () => {
      generateWhatsAppTemplate();
      toast('Plantilla regenerada con los datos del ticket y paradas de reloj');
    };
  }

  if ($('#btnResetTicketData')) {
    $('#btnResetTicketData').onclick = () => {
      ticketData = { ...DEFAULT_TICKET_DATA };
      clockStops = [...DEFAULT_CLOCK_STOPS];
      saveTicketState();
      if ($('#tkNum')) $('#tkNum').value = ticketData.num;
      if ($('#tkUfinet')) $('#tkUfinet').value = ticketData.ufinet;
      if ($('#tkClient')) $('#tkClient').value = ticketData.client;
      if ($('#tkFinalClient')) $('#tkFinalClient').value = ticketData.finalClient;
      if ($('#tkContact')) $('#tkContact').value = ticketData.contact;
      if ($('#tkPhone')) $('#tkPhone').value = ticketData.phone;
      if ($('#tkAddress')) $('#tkAddress').value = ticketData.address;
      if ($('#tkCoords')) $('#tkCoords').value = ticketData.coords;
      if ($('#tkNode')) $('#tkNode').value = ticketData.node;
      if ($('#tkEquipment')) $('#tkEquipment').value = ticketData.equipment;
      if ($('#tkPort')) $('#tkPort').value = ticketData.port;
      if ($('#tkPotenciaRx')) $('#tkPotenciaRx').value = ticketData.potenciaRx || '-40.0 dBm (low-alarm)';
      if ($('#tkType')) $('#tkType').value = ticketData.type;
      if ($('#tkStartFalla')) $('#tkStartFalla').value = ticketData.startFalla;
      if ($('#tkStartSitio')) $('#tkStartSitio').value = ticketData.startSitio;
      if ($('#tkEndFalla')) $('#tkEndFalla').value = ticketData.endFalla;
      if ($('#tkUnitAssigned')) $('#tkUnitAssigned').value = ticketData.unitM;
      if ($('#tkDiagnostic')) $('#tkDiagnostic').value = ticketData.diagnostic;
      calcTicketTimes();
      renderClockStops();
      generateWhatsAppTemplate();
      toast('Datos de ticket restablecidos a valores iniciales');
    };
  }
}

function renderTicketTab() {
  if (!$('#tabTicket')) return;
  loadTicketState();
  if ($('#tkUnitAssigned')) {
    $('#tkUnitAssigned').innerHTML = FL.map((v, idx) => `<option value="${idx}">${esc(v.n)} (${v.t} - ${v.z})</option>`).join('');
    $('#tkUnitAssigned').value = ticketData.unitM != null ? ticketData.unitM : 2;
  }
  bindTicketInputs();
  calcTicketTimes();
  renderClockStops();
  generateWhatsAppTemplate();
}

// ==========================================================================
// 15. INICIALIZACIÓN GLOBAL DEL APLICATIVO
// ==========================================================================
local('Modo local: los datos se guardan en este navegador.');
