// ============================================
// Types SnapStudio Widget V3
// Support complet Nano Banana Pro Edit + Pipeline B
// ============================================

// ============================================
// CONFIGURATION
// ============================================

/** Configuration du client SnapStudio */
export interface SnapStudioConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mockMode?: boolean;
}

// ============================================
// ENTITÉS MÉTIER
// ============================================

/** Marque (format objet) */
export interface Brand {
  id: string;
  name: string;
  slug: string;
}

/** Catalogue */
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
  description: string;
  /** Marque - peut être un objet Brand ou une simple string (rétrocompatibilité) */
  brand: Brand | string;
  /** Catalogue (objet complet) */
  catalog?: Catalog;
  /** Chemin de l'image détourée dans le storage */
  imageDetouree?: string;
  /** URL publique de l'image détourée */
  imageDetoureeUrl?: string;
  /** URL de l'image originale */
  imageOriginal?: string;
  /** URL de l'image (legacy) */
  imageUrl?: string;
  /** URL de la miniature (legacy) */
  imageThumbnail?: string;
  /** Puissance en kW */
  powerKw?: number;
  /** Rendement en % */
  efficiencyPct?: number;
  /** Type de combustible */
  fuelType?: 'bois' | 'granules' | string;
  /** Prix à partir de */
  priceFrom?: number;
  /** Style du poêle */
  style?: string;
  /** Catégorie de taille */
  sizeCategory?: string;
  /** Métadonnées additionnelles (legacy) */
  metadata?: {
    puissance_kw?: number;
    rendement_pct?: number;
    dimensions?: {
      h: number;
      l: number;
      p: number;
    };
    [key: string]: unknown;
  };
}

/** Helper pour extraire le nom de la marque */
export function getBrandName(brand: Brand | string): string {
  if (typeof brand === 'string') {
    return brand;
  }
  return brand.name;
}

/** Helper pour extraire l'ID de la marque */
export function getBrandId(brand: Brand | string): string {
  if (typeof brand === 'string') {
    return brand.toLowerCase().replace(/\s+/g, '-');
  }
  return brand.id;
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
  status: string;
  canBookRdv: boolean;
  leadToken: string;
}

/** Créneau horaire disponible */
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
  address?: string;
}

/** Génération (historique) */
export interface Generation {
  id: string;
  resultImageUrl: string;
  createdAt: string;
  asset?: Asset;
}

// ============================================
// API - REQUÊTES & RÉPONSES
// ============================================

/** Options de génération (legacy) */
export interface GenerationOptions {
  position?: "auto" | "left" | "center" | "right";
  style?: "realistic" | "magazine" | "warm";
}

/** Requête envoyée à l'API (format V3 - Nano Banana Pro Edit) */
export interface GenerateRequest {
  /** ID de l'asset (poêle) sélectionné */
  asset_id: string;
  /** Token du lead pour authentification */
  leadToken?: string;
  /** Image avec le marqueur vert (base64 JPEG) - Pipeline Nano Banana */
  marked_image?: string;
  /** Image compositée côté client (base64) - Pipeline B */
  compositedImage?: string;
  /** Image d'entrée originale (base64) - Pipeline A legacy */
  inputImage?: string;
  /** Masque pour inpainting (base64) - Pipeline A legacy */
  maskImage?: string;
  /** Ignorer le relighting IC-Light */
  skipRelighting?: boolean;
  /** Intensité du relighting (0-1) */
  lightingIntensity?: number;
  /** Mode mock pour les tests */
  mockMode?: boolean;
}

/** Réponse de l'API */
export interface GenerateResponse {
  success: boolean;
  /** Image générée */
  image?: {
    url: string;
    width?: number;
    height?: number;
  };
  /** ID de la génération */
  generationId?: string;
  /** URL de l'image résultat */
  resultImageUrl?: string;
  /** URL de l'image marquée stockée (pour historique) */
  marked_image_url?: string;
  /** Simulations restantes après génération */
  simulationsRemaining?: number;
  /** Asset utilisé */
  asset?: Asset;
  /** Pipeline utilisé */
  pipeline?: string[];
  /** Temps de génération en ms */
  generationTimeMs?: number;
  /** Estimation du coût en USD */
  costEstimateUsd?: number;
  /** Prompt utilisé */
  prompt?: string;
  /** Seed utilisé */
  seed?: number;
  /** Message d'erreur */
  error?: string;
  /** Détails de l'erreur */
  details?: string;
}

// ============================================
// ÉTATS & ÉTAPES
// ============================================

/** État de la génération */
export type GenerationStatus = 
  | "idle" 
  | "uploading" 
  | "generating" 
  | "completed" 
  | "error"
  | "limit_reached";

/** Étape du widget */
export type WidgetStep =
  | "upload"
  | "select"
  | "mask"
  | "ready"
  | "generating"
  | "result"
  | "error"
  | "limit_reached";

// ============================================
// PROPS DES COMPOSANTS
// ============================================

/** Props du composant principal SnapStudio */
export interface SnapStudioProps {
  /** Configuration Supabase */
  config?: SnapStudioConfig;
  /** Token du lead (si déjà authentifié) */
  leadToken?: string;
  /** Liste des assets disponibles */
  assets?: Asset[];
  /** Nombre de simulations restantes */
  simulationsRemaining?: number;
  /** Callback après génération réussie */
  onSimulationComplete?: (result: GenerateResponse) => void;
  /** Callback quand limite atteinte */
  onLimitReached?: () => void;
  /** Callback en cas d'erreur */
  onError?: (error: Error) => void;
  /** Callback pour réserver un RDV */
  onBookAppointment?: () => void;
  /** Callback quand l'utilisateur clique sur le CTA */
  onCtaClick?: (asset: Asset, resultImage: string) => void;
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
  
  // Props legacy (rétrocompatibilité)
  /** URL de l'API (Edge Function) - legacy */
  apiUrl?: string;
  /** Vertical métier - legacy */
  vertical?: "hvac" | "restaurant" | "immobilier" | "ecommerce";
  /** Catalogue personnalisé - legacy */
  catalog?: {
    id: string;
    name: string;
    vertical: string;
    assets: Asset[];
  };
  /** Callback après génération - legacy */
  onGenerated?: (result: GenerateResponse) => void;
}

/** Props du composant ImageUploader */
export interface ImageUploaderProps {
  onImageUpload: (base64: string, preview: string) => void;
  maxSizeMB?: number;
  acceptedFormats?: string[];
}

/** Props du composant AssetSelector */
export interface AssetSelectorProps {
  assets: Asset[];
  selectedAsset: Asset | null;
  onSelect: (asset: Asset) => void;
}

/** Props du composant MaskCanvas */
export interface MaskCanvasProps {
  /** Image de la pièce en base64 ou URL */
  roomImage: string;
  /** Callback quand le masque est validé */
  onMaskComplete: (maskBase64: string, previewBase64: string) => void;
  /** Callback pour annuler */
  onCancel: () => void;
  /** Taille du pinceau en pixels */
  brushSize?: number;
  /** Couleur de prévisualisation du masque */
  maskColor?: string;
  /** Opacité de la prévisualisation */
  maskOpacity?: number;
}

/** Props du composant ResultViewer */
export interface ResultViewerProps {
  /** Image originale */
  originalImage: string;
  /** Image générée */
  resultImage: string;
  /** Asset utilisé */
  asset: Asset;
  /** Texte du CTA */
  ctaText?: string;
  /** URL du CTA */
  ctaUrl?: string;
  /** Callback CTA */
  onCtaClick?: () => void;
  /** Callback reset */
  onReset: () => void;
  /** Callback réservation RDV */
  onBookAppointment?: () => void;
}

/** Props du composant LimitReached */
export interface LimitReachedProps {
  /** Générations précédentes à afficher */
  generations: Generation[];
  /** Callback pour réserver un RDV */
  onBookAppointment: () => void;
}

/** Props du composant LoadingState */
export interface LoadingStateProps {
  /** Message personnalisé */
  message?: string;
}

// ============================================
// ÉTAT INTERNE DU WIDGET
// ============================================

/** État interne du widget */
export interface WidgetState {
  status: GenerationStatus;
  /** Image originale uploadée (base64) */
  roomImage: string | null;
  /** Preview de l'image originale */
  roomImagePreview: string | null;
  /** Image avec le marqueur vert (base64 JPEG) */
  markedImage: string | null;
  /** Asset sélectionné */
  selectedAsset: Asset | null;
  /** Options de génération (legacy) */
  options: GenerationOptions;
  /** Résultat de la génération */
  result: GenerateResponse | null;
  /** Message d'erreur */
  error: string | null;
}

// ============================================
// EXPORTS LEGACY (rétrocompatibilité)
// ============================================

/** Requête legacy (déprécié) */
export interface GenerateRequestLegacy {
  roomImage: string;
  asset: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
  };
  options?: GenerationOptions;
}
