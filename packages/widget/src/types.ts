// ============================================
// Types SnapStudio Widget V2
// ============================================

/** Configuration du widget */
export interface SnapStudioConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mockMode?: boolean;
}

/** Asset (poêle) du catalogue */
export interface Asset {
  id: string;
  reference: string;
  name: string;
  description: string;
  imageDetouree: string;      // Path dans Storage (PNG transparent)
  imageDetoureeUrl?: string;  // URL publique complète
  imageOriginal?: string;
  powerKw?: number;
  efficiencyPct?: number;
  fuelType: 'granules' | 'bois';
  priceFrom?: number;
  style?: string;
  sizeCategory?: string;
  brand: {
    id: string;
    name: string;
    slug: string;
  };
  catalog: {
    id: string;
    name: string;
    slug: string;
  };
}

/** Lead (prospect) */
export interface Lead {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
  simulationsCount: number;
  simulationsLimit: number;
  simulationsRemaining: number;
  status: 'new' | 'simulated' | 'rdv_booked' | 'converted' | 'lost';
  canBookRdv: boolean;
  leadToken: string;
}

/** Données de dimensionnement */
export interface DimensioningData {
  houseSize: '<80' | '80-120' | '120-180' | '>180';
  roomSize: '<30' | '30-50' | '50-80' | '>80';
  multiRoom: boolean;
  hasChimney: 'yes' | 'no' | 'unknown';
  isReplacement: boolean;
  currentBrand?: string;
  currentModel?: string;
  objective: 'performance' | 'performance_design';
}

/** Résultat d'une génération */
export interface GenerationResult {
  generationId: string;
  resultImageUrl: string;
  simulationsRemaining: number;
  asset: {
    id: string;
    name: string;
    brand: string;
  };
}

/** Génération historique */
export interface Generation {
  id: string;
  resultImagePath: string;
  resultImageUrl?: string;
  asset: {
    id: string;
    name: string;
    brand: string;
  };
  createdAt: string;
}

/** Créneau disponible */
export interface TimeSlot {
  datetime: string;
  commercialId: string;
  commercialName: string;
}

/** Rendez-vous confirmé */
export interface Appointment {
  id: string;
  datetime: string;
  commercialName: string;
  address: string;
}

/** État de la génération */
export type GenerationStatus =
  | 'idle'
  | 'uploading'
  | 'drawing'
  | 'generating'
  | 'completed'
  | 'error'
  | 'limit_reached';

/** Étapes du widget */
export type WidgetStep =
  | 'upload'
  | 'mask'
  | 'generating'
  | 'result'
  | 'limit';

/** Props du composant principal */
export interface SnapStudioProps {
  /** Configuration API */
  config: SnapStudioConfig;
  
  /** Token du lead (après formulaire) */
  leadToken: string;
  
  /** Asset pré-sélectionné */
  initialAssetId?: string;
  
  /** Liste des assets disponibles */
  assets: Asset[];
  
  /** Nombre de simulations restantes */
  simulationsRemaining: number;
  
  /** Callback après génération réussie */
  onSimulationComplete?: (result: GenerationResult) => void;
  
  /** Callback quand limite atteinte */
  onLimitReached?: () => void;
  
  /** Callback en cas d'erreur */
  onError?: (error: Error) => void;
  
  /** Callback pour prise de RDV */
  onBookAppointment?: () => void;
  
  /** Configuration du branding */
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logo?: string;
  };
  
  /** Classe CSS additionnelle */
  className?: string;
}

/** Props du MaskCanvas */
export interface MaskCanvasProps {
  /** Image de fond (base64 ou URL) */
  backgroundImage: string;
  
  /** Callback quand le masque change */
  onMaskChange: (maskData: string) => void;
  
  /** Callback pour lancer la génération */
  onGenerate: () => void;
  
  /** Peut-on générer ? */
  canGenerate: boolean;
  
  /** Génération en cours ? */
  isGenerating?: boolean;
}

/** Props du ResultViewer */
export interface ResultViewerProps {
  /** Image originale */
  originalImage: string;
  
  /** Image générée */
  resultImage: string;
  
  /** Asset utilisé */
  asset: Asset;
  
  /** Simulations restantes */
  simulationsRemaining: number;
  
  /** Callback nouvelle simulation */
  onNewSimulation: () => void;
  
  /** Callback téléchargement */
  onDownload: () => void;
}

/** Props du LimitReached */
export interface LimitReachedProps {
  /** Générations effectuées */
  generations: Generation[];
  
  /** Callback prise de RDV */
  onBookAppointment: () => void;
}

/** Requête de génération */
export interface GenerateRequest {
  leadToken: string;
  assetId: string;
  inputImage: string;   // Base64
  maskImage: string;    // Base64
  mockMode?: boolean;
}

/** Réponse de génération */
export interface GenerateResponse {
  generationId: string;
  resultImageUrl: string;
  simulationsRemaining: number;
  asset: {
    id: string;
    name: string;
    brand: string;
  };
}

/** Réponse erreur limite */
export interface LimitReachedResponse {
  error: 'limit_reached';
  message: string;
  cta: string;
}
