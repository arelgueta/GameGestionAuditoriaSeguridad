import type { GameId } from './session.js';

export interface ConfigField {
  key: string;
  label: string;
  type: 'boolean' | 'number';
  default: boolean | number;
  min?: number;
  max?: number;
  help?: string;
}

export interface CatalogEntry {
  id: GameId;
  title: string;
  tagline: string;
  objective: string;
  durationMin: number;
  priority: 'alta' | 'media' | 'baja';
  phases: { id: string; title: string; durationSec: number | null }[];
  config: ConfigField[];
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'phish',
    title: 'Phish or Fish',
    tagline: 'Concurso tipo Kahoot para reconocer ingeniería social',
    objective:
      'Distinguir mensajes legítimos de engaños, identificar la señal clave y diseñar una campaña de concientización.',
    durationMin: 50,
    priority: 'alta',
    phases: [
      { id: 'osint', title: 'Mini OSINT', durationSec: 180 },
      { id: 'concurso', title: 'Concurso (12 rondas)', durationSec: null },
      { id: 'campana', title: 'Diseño de campaña', durationSec: 1200 },
      { id: 'galeria', title: 'Galería y votación', durationSec: 300 },
      { id: 'cierre', title: 'Cierre y debriefing', durationSec: null },
    ],
    config: [
      {
        key: 'answerSec',
        label: 'Segundos para PHISH/FISH',
        type: 'number',
        default: 25,
        min: 10,
        max: 120,
      },
      {
        key: 'signalSec',
        label: 'Segundos para elegir la señal',
        type: 'number',
        default: 15,
        min: 5,
        max: 120,
      },
    ],
  },
  {
    id: 'crisis',
    title: 'Crisis Room: el lunes del ransomware',
    tagline: 'Comité de crisis en tiempo real con 9 noticias urgentes',
    objective:
      'Tomar decisiones bajo presión cuidando la confianza del mercado, y comunicar con claridad.',
    durationMin: 60,
    priority: 'alta',
    phases: [
      { id: 'comite', title: 'Comité de crisis', durationSec: null },
      { id: 'cierre', title: 'Comunicado y lecciones', durationSec: 600 },
      { id: 'debrief', title: 'Debriefing', durationSec: null },
    ],
    config: [
      {
        key: 'injectSec',
        label: 'Segundos para decidir cada inject',
        type: 'number',
        default: 240,
        min: 30,
        max: 900,
      },
      {
        key: 'autoMode',
        label: 'Modo automático (un inject cada N segundos)',
        type: 'boolean',
        default: false,
      },
      {
        key: 'autoIntervalSec',
        label: 'Intervalo del modo automático (segundos)',
        type: 'number',
        default: 300,
        min: 60,
        max: 1800,
      },
      {
        key: 'showImmediate',
        label: 'Mostrar el efecto de cada decisión en el momento',
        type: 'boolean',
        default: false,
      },
    ],
  },
  {
    id: 'subasta',
    title: 'La subasta de controles',
    tagline: 'Presupuesto escaso, controles en subasta y dados que no perdonan',
    objective:
      'Priorizar inversiones de seguridad según el riesgo y ver el efecto de cada control.',
    durationMin: 50,
    priority: 'alta',
    phases: [
      { id: 'matriz', title: 'Matriz de riesgos', durationSec: 600 },
      { id: 'subasta', title: 'Subasta', durationSec: 900 },
      { id: 'incidentes', title: 'Incidentes', durationSec: 900 },
      { id: 'cierre', title: 'Cierre y debriefing', durationSec: null },
    ],
    config: [
      { key: 'lotSec', label: 'Segundos por lote', type: 'number', default: 45, min: 15, max: 300 },
      {
        key: 'bidResetSec',
        label: 'Segundos mínimos tras cada oferta',
        type: 'number',
        default: 10,
        min: 5,
        max: 60,
      },
      {
        key: 'incidentCount',
        label: 'Cantidad de incidentes a revelar',
        type: 'number',
        default: 6,
        min: 1,
        max: 8,
      },
    ],
  },
  {
    id: 'escape',
    title: 'Escape room: la oficina comprometida',
    tagline: 'Encuentren las 8 fallas, consigan las letras y abran el candado',
    objective: 'Reconocer fallas cotidianas de personas, procesos y tecnología, y su control.',
    durationMin: 40,
    priority: 'media',
    phases: [
      { id: 'escape', title: 'Escape room', durationSec: 1800 },
      { id: 'debrief', title: 'Debriefing', durationSec: null },
    ],
    config: [
      {
        key: 'penaltySec',
        label: 'Segundos de penalidad por error',
        type: 'number',
        default: 30,
        min: 0,
        max: 300,
      },
    ],
  },
  {
    id: 'boardroom',
    title: 'El Boardroom 2.0',
    tagline: 'Contratar un pentest con presupuesto limitado y traducir un hallazgo',
    objective:
      'Elegir un proveedor de forma ética, traducir un hallazgo técnico a impacto de negocio y responder a imprevistos.',
    durationMin: 45,
    priority: 'media',
    phases: [
      { id: 'seleccion', title: 'Elegir proveedor', durationSec: 600 },
      { id: 'hallazgo', title: 'Traducir el hallazgo', durationSec: 600 },
      { id: 'giro', title: 'Giro de trama', durationSec: 300 },
      { id: 'regla', title: 'Regla de oro', durationSec: 300 },
      { id: 'debrief', title: 'Presentación y debriefing', durationSec: null },
    ],
    config: [],
  },
  {
    id: 'shadowit',
    title: 'Shadow IT y la IA del empleado',
    tagline: 'Herramientas no autorizadas, due diligence y política semáforo',
    objective:
      'Gestionar el uso de herramientas no aprobadas ofreciendo alternativas y reglas claras.',
    durationMin: 50,
    priority: 'media',
    phases: [
      { id: 'inventario', title: 'Inventario', durationSec: 600 },
      { id: 'diligencia', title: 'Due diligence', durationSec: 1200 },
      { id: 'semaforo', title: 'Política semáforo', durationSec: 900 },
      { id: 'debrief', title: 'Debriefing', durationSec: null },
    ],
    config: [],
  },
  {
    id: 'juicio',
    title: 'El juicio de la filtración',
    tagline: 'Soporte para un juicio simulado: expediente, oradores, preguntas y jurado',
    objective:
      'Analizar responsabilidades legales y contractuales ante una filtración de datos personales.',
    durationMin: 80,
    priority: 'baja',
    phases: [
      { id: 'expediente', title: 'Lectura del expediente', durationSec: 900 },
      { id: 'alegatos', title: 'Alegatos', durationSec: 1200 },
      { id: 'preguntas', title: 'Preguntas cruzadas', durationSec: 900 },
      { id: 'veredicto', title: 'Alegatos finales y veredicto', durationSec: 900 },
      { id: 'cierre', title: 'Cierre', durationSec: null },
    ],
    config: [
      { key: 'parallel', label: 'Dos juicios en paralelo', type: 'boolean', default: false },
    ],
  },
];

export function catalogEntry(id: GameId): CatalogEntry {
  const e = CATALOG.find((c) => c.id === id);
  if (!e) throw new Error(`Dinámica desconocida: ${id}`);
  return e;
}
