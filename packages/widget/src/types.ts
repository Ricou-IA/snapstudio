// ============================================
// Types SnapStudio Widget
// ============================================

/** Asset (poêle, produit) du catalogue */
export interface Asset {
  id: string;
  name: string;
  brand: string;
  description: string;
  imageUrl: string;
  imageThumbnail?: string;
  /** URL du PNG détouré pour l'insertion IA */
  imageDetouree?: string;
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

/** Catalogue d'assets */
export interface Catalog {
  id: string;
  name: string;
  vertical: string;
  assets: Asset[];
}

/** Options de génération */
export interface GenerationOptions {
  position?: "auto" | "left" | "center" | "right";
  style?: "realistic" | "magazine" | "warm";
}

/** Requête envoyée à l'API (ancien format - déprécié) */
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

/** Requête envoyée à l'API (nouveau format - Nano Banana Pro Edit) */
export interface GenerateRequest {
  /** ID de l'asset (poêle) sélectionné */
  asset_id: string;
  /** Image avec le marqueur vert (base64 JPEG) */
  marked_image: string;
}

/** Réponse de l'API */
export interface GenerateResponse {
  success: boolean;
  image?: {
    url: string;
    width?: number;
    height?: number;
  };
  /** URL de l'image marquée stockée (pour historique) */
  marked_image_url?: string;
  prompt?: string;
  seed?: number;
  error?: string;
  details?: string;
}

/** État de la génération */
export type GenerationStatus = 
  | "idle" 
  | "uploading" 
  | "generating" 
  | "completed" 
  | "error";

/** Étape du widget */
export type WidgetStep =
  | "upload"
  | "select"
  | "mask"
  | "ready"
  | "generating"
  | "result"
  | "error";

/** Props du composant principal */
export interface SnapStudioProps {
  /** URL de l'API (Edge Function) */
  apiUrl: string;
  
  /** Vertical métier */
  vertical?: "hvac" | "restaurant" | "immobilier" | "ecommerce";
  
  /** Catalogue personnalisé (sinon utilise le catalogue par défaut) */
  catalog?: Catalog;
  
  /** Callback après génération réussie */
  onGenerated?: (result: GenerateResponse) => void;
  
  /** Callback en cas d'erreur */
  onError?: (error: Error) => void;
  
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
}

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
