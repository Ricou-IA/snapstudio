// ============================================
// Types SnapStudio Widget V3
// Support Pipeline A (legacy) et Pipeline B (Compositing + IC-Light)
// ============================================

// ============================================
// CONFIGURATION
// ============================================

/** Configuration du widget SnapStudio */
export interface SnapStudioConfig {
  supabaseUrl: string;
  supabaseAnonKey?: string;
  /** Mode mock pour développement (pas d'appel fal.ai) */
  mockMode?: boolean;
}

// ============================================
// ASSETS & CATALOGUE
// ============================================

/** Marque d'un asset */
export interface Brand {
  id: string;
  name: string;
  slug: string;
}

/** Catalogue d'assets */
export interface Catalog {
  id: string;
  name: string;
  slug: string;
}

/** Asset (poêle, produit) du catalogue */
export interface Asset {
  id: string;
  reference?: string;
  name: string;
  description?: string;
  /** Path du PNG détouré dans Storage */
  imageDetouree?: string;
  /** URL complète du PNG détouré (fond transparent) - REQUIS pour Pipeline B */
  imageDetoureeUrl?: string;
  /** Image originale (avec fond) */
  imageOriginal?: string;
  /** Puissance en kW */
  powerKw?: number;
  /** Rendement en % */
  efficiencyPct?: number;
  /** Type de combustible */
  fuelType?: string;
  /** Prix à partir de */
  priceFrom?: number;
  /** Style du poêle */
  style?: string;
  /** Catégorie de taille */
  sizeCategory?: string;
  /** Marque */
  brand: Brand;
  /** Catalogue */
  catalog?: Catalog;
  /** Métadonnées additionnelles */
  metadata?: {
    puissance_kw?: number;
    rendement_pct?: number;
    dimensions?: {
      h: number;
      l: number;
      p: number;
    };
    style?: string;
    couleur?: string;
    [key: string]: unknown;
  };
}

// ============================================
// LEADS
// ============================================

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
  status: string;
  canBookRdv: boolean;
  leadToken: string;
}

/** Données du questionnaire de dimensionnement */
export interface DimensioningData {
  houseType?: string;
  surfaceM2?: number;
  roomCount?: number;
  heatingType?: string;
  chimneyStatus?: string;
  budget?: string;
  preferences?: string[];
}

// ============================================
// GÉNÉRATION
// ============================================

/** Bounding box du masque dessiné */
export interface MaskBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** Options de génération */
export interface GenerationOptions {
  position?: "auto" | "left" | "center" | "right";
  style?: "realistic" | "magazine" | "warm";
  /** Mode d'éclairage IC-Light */
  lightingMode?: "auto" | "left" | "right" | "top" | "bottom";
  /** Intensité de l'harmonisation (0.0 - 1.0) */
  lightingIntensity?: number;
  /** Préserver les détails de l'image originale */
  preserveDetails?: boolean;
}

/** Requête envoyée à l'API de génération */
export interface GenerateRequest {
  /** Token du lead (pour quota) */
  leadToken: string;
  
  /** ID de l'asset (poêle) sélectionné */
  assetId: string;
  
  // ========================================
  // Pipeline A (legacy - FLUX Kontext Inpaint)
  // ⚠️ Peut modifier la pièce !
  // ========================================
  
  /** Image de la pièce en base64 */
  inputImage?: string;
  
  /** Masque dessiné en base64 (zones blanches = où placer le poêle) */
  maskImage?: string;
  
  // ========================================
  // Pipeline B (nouveau - Compositing + IC-Light)
  // ✅ La pièce reste 100% intacte
  // ========================================
  
  /** Image compositée (photo + poêle superposé) en base64 */
  compositedImage?: string;
  
  // ========================================
  // Options communes
  // ========================================
  
  /** Mode mock pour développement (pas d'appel fal.ai) */
  mockMode?: boolean;
  
  /** Sauter l'étape IC-Light (économie mais moins réaliste) */
  skipRelighting?: boolean;
  
  /** Intensité de l'harmonisation d'éclairage (0.0 à 1.0, défaut 0.6) */
  lightingIntensity?: number;
}

/** Réponse de l'API de génération */
export interface GenerateResponse {
  /** ID unique de la génération */
  generationId: string;
  
  /** URL de l'image résultat */
  resultImageUrl: string;
  
  /** Nombre de simulations restantes pour ce lead */
  simulationsRemaining: number;
  
  /** Info sur l'asset utilisé */
  asset: {
    id: string;
    name: string;
    brand: string;
  };
  
  /** Pipeline utilisé pour la génération */
  pipeline?: string[];
  
  /** Temps de génération en ms */
  generationTimeMs?: number;
  
  /** Coût estimé en USD */
  costEstimateUsd?: number;
}

/** Alias pour compatibilité */
export type GenerationResult = GenerateResponse;

/** État de la génération */
export type GenerationStatus = 
  | "idle" 
  | "uploading" 
  | "compositing"
  | "generating" 
  | "completed" 
  | "error"
  | "limit_reached";

/** Génération sauvegardée (historique) */
export interface Generation {
  id: string;
  resultImagePath: string;
  resultImageUrl: string;
  asset: {
    id: string;
    name: string;
    brand: string;
  };
  createdAt: string;
}

// ============================================
// CALENDRIER / RDV
// ============================================

/** Créneau horaire disponible */
export interface TimeSlot {
  datetime: string;
  commercialId: string;
  commercialName: string;
}

/** Rendez-vous réservé */
export interface Appointment {
  id: string;
  datetime: string;
  commercialName: string;
  address?: string;
}

// ============================================
// COMPOSANTS
// ============================================

/** Étapes du widget */
export type WidgetStep = 
  | "upload" 
  | "mask" 
  | "generating" 
  | "result" 
  | "limit";

/** Props du composant MaskCanvas V2 (avec compositing) */
export interface MaskCanvasProps {
  /** Image de fond (photo de la pièce) en base64 ou URL */
  backgroundImage: string;
  
  /** URL du PNG détouré du poêle (pour compositing) */
  assetImageUrl?: string;
  
  /** Callback quand le masque change */
  onMaskChange: (maskBase64: string) => void;
  
  /** Callback quand l'image compositée est prête */
  onCompositedImageReady?: (
    compositedBase64: string, 
    boundingBox: MaskBoundingBox | null
  ) => void;
  
  /** Callback pour lancer la génération */
  onGenerate: () => void;
  
  /** Le bouton "Générer" est-il actif ? */
  canGenerate: boolean;
  
  /** Génération en cours ? */
  isGenerating?: boolean;
}

/** Props du composant ResultViewer */
export interface ResultViewerProps {
  originalImage: string;
  resultImage: string;
  asset: Asset;
  simulationsRemaining?: number;
  onNewSimulation?: () => void;
  onDownload?: () => void;
  onReset?: () => void;
  ctaText?: string;
  ctaUrl?: string;
  onCtaClick?: () => void;
}

/** Props du composant LimitReached */
export interface LimitReachedProps {
  generations: Generation[];
  onBookAppointment?: () => void;
}

/** Props du composant principal SnapStudio */
export interface SnapStudioProps {
  /** Configuration Supabase */
  config: SnapStudioConfig;
  
  /** Token du lead connecté */
  leadToken: string;
  
  /** ID de l'asset pré-sélectionné */
  initialAssetId?: string;
  
  /** Liste des assets disponibles */
  assets: Asset[];
  
  /** Nombre de simulations restantes */
  simulationsRemaining: number;
  
  /** Callback après génération réussie */
  onSimulationComplete?: (result: GenerateResponse) => void;
  
  /** Callback quand la limite est atteinte */
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
    ctaText?: string;
    ctaUrl?: string;
    hidePoweredBy?: boolean;
  };
  
  /** Classe CSS additionnelle */
  className?: string;
}

/** État interne du widget */
export interface WidgetState {
  status: GenerationStatus;
  roomImage: string | null;
  roomImagePreview: string | null;
  selectedAsset: Asset | null;
  options: GenerationOptions;
  result: GenerateResponse | null;
  error: string | null;
  /** Image compositée (Pipeline B) */
  compositedImage: string | null;
  /** Bounding box du masque (Pipeline B) */
  maskBoundingBox: MaskBoundingBox | null;
}
