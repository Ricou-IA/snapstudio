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
  
  /** Requête envoyée à l'API */
  export interface GenerateRequest {
    roomImage: string;
    asset: {
      id: string;
      name: string;
      description: string;
      imageUrl: string;
    };
    options?: GenerationOptions;
  }
  
  /** Réponse de l'API */
  export interface GenerateResponse {
    success: boolean;
    image?: {
      url: string;
      width: number;
      height: number;
    };
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
    roomImage: string | null;
    roomImagePreview: string | null;
    selectedAsset: Asset | null;
    options: GenerationOptions;
    result: GenerateResponse | null;
    error: string | null;
  }
  