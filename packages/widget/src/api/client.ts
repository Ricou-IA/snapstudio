// ============================================
// Client API SnapStudio V3
// Support Pipeline A (FLUX Kontext) et Pipeline B (Compositing + IC-Light)
// ============================================

import type {
  SnapStudioConfig,
  Asset,
  Lead,
  GenerateRequest,
  GenerateResponse,
  TimeSlot,
  Appointment,
} from '../types';

/**
 * Client API pour communiquer avec Supabase Edge Functions
 */
export class SnapStudioClient {
  private baseUrl: string;
  private storageUrl: string;

  constructor(config: SnapStudioConfig) {
    this.baseUrl = `${config.supabaseUrl}/functions/v1`;
    this.storageUrl = `${config.supabaseUrl}/storage/v1/object/public/snapstudio`;
  }

  /**
   * Construit l'URL publique d'une image dans le Storage
   */
  getPublicImageUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return `${this.storageUrl}/${path}`;
  }

  // ============================================
  // LEADS
  // ============================================

  /**
   * Créer un nouveau lead
   */
  async createLead(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    address?: string;
    optinNewsletter?: boolean;
    dimensioningId?: string;
    selectedAssetId?: string;
    sourceUrl?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    isTest?: boolean;
  }): Promise<{ leadToken: string; simulationsRemaining: number; isExisting: boolean }> {
    const response = await fetch(`${this.baseUrl}/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
        address: data.address,
        optin_newsletter: data.optinNewsletter,
        dimensioning_id: data.dimensioningId,
        selected_asset_id: data.selectedAssetId,
        source_url: data.sourceUrl,
        utm_source: data.utmSource,
        utm_medium: data.utmMedium,
        utm_campaign: data.utmCampaign,
        is_test: data.isTest,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la création du lead');
    }

    const result = await response.json();
    return {
      leadToken: result.lead_token,
      simulationsRemaining: result.simulations_remaining,
      isExisting: result.is_existing,
    };
  }

  /**
   * Récupérer les infos d'un lead
   */
  async getLead(leadToken: string): Promise<Lead> {
    const response = await fetch(`${this.baseUrl}/leads`, {
      method: 'GET',
      headers: {
        'X-Lead-Token': leadToken,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Lead non trouvé');
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      phone: data.phone,
      address: data.address,
      simulationsCount: data.simulations_count,
      simulationsLimit: data.simulations_limit,
      simulationsRemaining: data.simulations_remaining,
      status: data.status,
      canBookRdv: data.can_book_rdv,
      leadToken: leadToken,
    };
  }

  // ============================================
  // ASSETS
  // ============================================

  /**
   * Récupérer la liste des assets
   */
  async getAssets(filters?: {
    catalogSlug?: string;
    brandSlug?: string;
    fuelType?: string;
    style?: string;
    isActive?: boolean;
  }): Promise<Asset[]> {
    const params = new URLSearchParams();
    if (filters?.catalogSlug) params.append('catalog', filters.catalogSlug);
    if (filters?.brandSlug) params.append('brand', filters.brandSlug);
    if (filters?.fuelType) params.append('fuel_type', filters.fuelType);
    if (filters?.style) params.append('style', filters.style);
    if (filters?.isActive !== undefined) params.append('is_active', String(filters.isActive));

    const url = `${this.baseUrl}/assets${params.toString() ? '?' + params : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la récupération des assets');
    }

    const data = await response.json();
    return data.assets.map((asset: any) => this.mapAsset(asset));
  }

  /**
   * Mapper un asset de l'API vers notre type
   */
  private mapAsset(data: any): Asset {
    return {
      id: data.id,
      reference: data.reference,
      name: data.name,
      description: data.description,
      imageDetouree: data.image_detouree,
      imageDetoureeUrl: this.getPublicImageUrl(data.image_detouree),
      imageOriginal: data.image_original,
      powerKw: data.power_kw ? parseFloat(data.power_kw) : undefined,
      efficiencyPct: data.efficiency_pct ? parseFloat(data.efficiency_pct) : undefined,
      fuelType: data.fuel_type,
      priceFrom: data.price_from ? parseFloat(data.price_from) : undefined,
      style: data.style,
      sizeCategory: data.size_category,
      brand: {
        id: data.brand?.id || data.brand_id,
        name: data.brand?.name || '',
        slug: data.brand?.slug || '',
      },
      catalog: {
        id: data.catalog?.id || data.catalog_id,
        name: data.catalog?.name || '',
        slug: data.catalog?.slug || '',
      },
    };
  }

  // ============================================
  // GÉNÉRATION
  // ============================================

  /**
   * Générer une simulation
   * 
   * Pipeline B (recommandé) : Si compositedImage est fourni
   *   → La pièce reste 100% intacte, seul l'éclairage est harmonisé
   * 
   * Pipeline A (legacy) : Si inputImage + maskImage sont fournis
   *   → FLUX Kontext Inpaint (peut modifier la pièce)
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    // Déterminer le pipeline à utiliser
    const usePipelineB = !!request.compositedImage;
    
    console.log(`[SnapStudioClient] Using Pipeline ${usePipelineB ? 'B (Compositing + IC-Light)' : 'A (FLUX Kontext Inpaint)'}`);

    // Construire le body selon le pipeline
    const body: Record<string, unknown> = {
      asset_id: request.asset_id,
      mock_mode: request.mockMode ?? false,
    };

    if (usePipelineB) {
      // Pipeline B : Compositing côté client + IC-Light V2
      body.composited_image = request.compositedImage;
      // Optionnel : envoyer aussi l'image originale pour référence/debug
      if (request.inputImage) {
        body.input_image = request.inputImage;
      }
      // Options d'éclairage
      if (request.skipRelighting !== undefined) {
        body.skip_relighting = request.skipRelighting;
      }
      if (request.lightingIntensity !== undefined) {
        body.lighting_intensity = request.lightingIntensity;
      }
    } else {
      // Pipeline A : FLUX Kontext Inpaint (legacy)
      body.input_image = request.inputImage;
      body.mask_image = request.maskImage;
    }

    // Construire les headers avec leadToken optionnel
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (request.leadToken) {
      headers['X-Lead-Token'] = request.leadToken;
    }

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.error === 'limit_reached') {
        const error = new Error(data.message || 'Limite de simulations atteinte');
        (error as any).code = 'limit_reached';
        throw error;
      }
      throw new Error(data.error || 'Erreur lors de la génération');
    }

    return {
      success: true,
      generationId: data.generation_id,
      resultImageUrl: data.result_image_url,
      simulationsRemaining: data.simulations_remaining,
      asset: data.asset,
      pipeline: data.pipeline,
      generationTimeMs: data.generation_time_ms,
      costEstimateUsd: data.cost_estimate_usd,
    };
  }

  // ============================================
  // CALENDRIER
  // ============================================

  /**
   * Récupérer les créneaux disponibles
   */
  async getAvailableSlots(startDate: string, endDate: string): Promise<TimeSlot[]> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    const response = await fetch(`${this.baseUrl}/calendar-slots?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la récupération des créneaux');
    }

    const data = await response.json();
    return data.slots.map((slot: any) => ({
      datetime: slot.datetime,
      commercialId: slot.commercial_id,
      commercialName: slot.commercial_name,
    }));
  }

  /**
   * Réserver un rendez-vous
   */
  async bookAppointment(
    leadToken: string,
    slotDatetime: string,
    commercialId: string,
    phone?: string,
    address?: string
  ): Promise<Appointment> {
    const response = await fetch(`${this.baseUrl}/calendar-book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lead-Token': leadToken,
      },
      body: JSON.stringify({
        slot_datetime: slotDatetime,
        commercial_id: commercialId,
        phone,
        address,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la réservation');
    }

    const data = await response.json();
    return {
      id: data.appointment_id,
      datetime: data.datetime,
      commercialName: data.commercial_name,
      address: data.address,
    };
  }
}

/**
 * Instance singleton du client
 */
let clientInstance: SnapStudioClient | null = null;

export function initClient(config: SnapStudioConfig): SnapStudioClient {
  clientInstance = new SnapStudioClient(config);
  return clientInstance;
}

export function getClient(): SnapStudioClient {
  if (!clientInstance) {
    throw new Error('SnapStudioClient not initialized. Call initClient() first.');
  }
  return clientInstance;
}
