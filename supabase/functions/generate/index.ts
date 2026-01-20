import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// SNAPSTUDIO V3 - GENERATE FUNCTION
// Pipelines supportés:
//   A) FLUX Kontext Lora Inpaint → IC-Light V2 (original - input_image + mask_image)
//   B) Compositing Client-Side → IC-Light V2 (nouveau - composited_image)
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lead-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Configuration des endpoints fal.ai
const FAL_ENDPOINTS = {
  FLUX_KONTEXT_INPAINT: "https://fal.run/fal-ai/flux-kontext-lora/inpaint",
  ICLIGHT_V2: "https://fal.run/fal-ai/iclight-v2",
};

// Types
interface GenerateRequest {
  asset_id: string;
  input_image?: string; // Base64 ou URL de la photo de la pièce (Pipeline A)
  mask_image?: string; // Base64 ou URL du masque (Pipeline A)
  composited_image?: string; // Base64 ou URL de l'image compositée (Pipeline B - NOUVEAU)
  lead_token?: string; // Token du lead (pour quota B2C)
  is_test?: boolean;
  mock_mode?: boolean; // Mode mock pour dev sans appeler fal.ai
  skip_relighting?: boolean; // Optionnel: sauter l'étape IC-Light (économie)
  lighting_intensity?: number; // Intensité harmonisation 0.0-1.0 (défaut 0.6) - NOUVEAU
}

interface Asset {
  id: string;
  name: string;
  description: string;
  image_detouree: string; // Path du PNG détouré dans Storage
  brand: {
    id: string;
    name: string;
  };
}

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalResponse {
  images: FalImage[];
  seed?: number;
  prompt?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Upload une image base64 vers Supabase Storage et retourne l'URL publique
 */
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  base64Data: string,
  path: string,
  contentType: string = "image/png"
): Promise<string> {
  // Extraire les données base64 pures (sans le préfixe data:image/...)
  const base64Clean = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  // Convertir en Uint8Array
  const binaryString = atob(base64Clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Upload vers Storage
  const { error } = await supabase.storage
    .from("snapstudio")
    .upload(path, bytes, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Récupérer l'URL publique
  const {
    data: { publicUrl },
  } = supabase.storage.from("snapstudio").getPublicUrl(path);

  return publicUrl;
}

/**
 * Appelle l'API fal.ai
 */
async function callFalApi(
  endpoint: string,
  payload: Record<string, unknown>,
  falApiKey: string
): Promise<FalResponse> {
  console.log(`Calling fal.ai: ${endpoint}`);
  console.log("Payload:", JSON.stringify(payload, null, 2).substring(0, 500));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${falApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log(`fal.ai response status: ${response.status}`);

  if (!response.ok) {
    console.error("fal.ai error:", responseText);
    throw new Error(`fal.ai error (${response.status}): ${responseText}`);
  }

  const result = JSON.parse(responseText);

  if (!result.images || !result.images.length) {
    console.error("No images in response:", result);
    throw new Error("fal.ai returned no images");
  }

  return result;
}

/**
 * Étape 1: FLUX Kontext Lora Inpaint (Pipeline A uniquement)
 * Insère le poêle (reference_image) dans la zone masquée de la photo
 */
async function stepFluxKontextInpaint(
  roomImageUrl: string,
  maskUrl: string,
  stoveImageUrl: string,
  asset: Asset,
  falApiKey: string
): Promise<string> {
  console.log("=== STEP 1: FLUX Kontext Lora Inpaint ===");

  const prompt = `A ${asset.brand.name} ${asset.name} wood stove installed in this room. 
The stove is seamlessly integrated into the space with realistic shadows and reflections. 
Professional interior photography, photorealistic, natural lighting, high quality.
${asset.description || ""}`.trim();

  const payload = {
    image_url: roomImageUrl,
    mask_url: maskUrl,
    reference_image_url: stoveImageUrl,
    prompt: prompt,
    num_inference_steps: 30,
    guidance_scale: 2.5,
    strength: 0.88,
    num_images: 1,
    enable_safety_checker: true,
    output_format: "jpeg",
  };

  const result = await callFalApi(
    FAL_ENDPOINTS.FLUX_KONTEXT_INPAINT,
    payload,
    falApiKey
  );

  console.log("FLUX Kontext Inpaint completed, image URL:", result.images[0].url);
  return result.images[0].url;
}

/**
 * Étape 2: IC-Light V2
 * Harmonise l'éclairage du poêle avec la scène
 * @param lightingIntensity - Intensité de l'harmonisation (0.0 à 1.0, défaut 0.6)
 */
async function stepIcLightV2(
  inputImageUrl: string,
  asset: Asset,
  falApiKey: string,
  lightingIntensity: number = 0.6
): Promise<string> {
  console.log("=== STEP 2: IC-Light V2 Relighting ===");
  console.log("Lighting intensity:", lightingIntensity);

  const prompt = `Interior room with a ${asset.brand.name} ${asset.name} wood stove. 
Warm ambient lighting, natural window light, cozy atmosphere. 
The stove has realistic lighting that matches the room's illumination.
Professional interior design photography.`.trim();

  // Ajuster les paramètres selon l'intensité (0.0 à 1.0)
  // Plus l'intensité est élevée, plus l'harmonisation est forte
  const lowresDenoise = 0.9 + (lightingIntensity * 0.08);  // 0.90 à 0.98
  const highresDenoise = 0.85 + (lightingIntensity * 0.10); // 0.85 à 0.95

  const payload = {
    image_url: inputImageUrl,
    prompt: prompt,
    num_inference_steps: 28,
    guidance_scale: 5,
    num_images: 1,
    enable_safety_checker: true,
    output_format: "jpeg",
    lowres_denoise: lowresDenoise,
    highres_denoise: highresDenoise,
  };

  const result = await callFalApi(
    FAL_ENDPOINTS.ICLIGHT_V2,
    payload,
    falApiKey
  );

  console.log("IC-Light V2 completed, image URL:", result.images[0].url);
  return result.images[0].url;
}

/**
 * Télécharge une image depuis une URL et la stocke dans Supabase Storage
 */
async function downloadAndStore(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  storagePath: string
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error } = await supabase.storage
    .from("snapstudio")
    .upload(storagePath, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("snapstudio").getPublicUrl(storagePath);

  return publicUrl;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Vérifier la méthode
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Initialiser Supabase client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Parser la requête
    const body: GenerateRequest = await req.json();
    const {
      asset_id,
      input_image,
      mask_image,
      composited_image,
      lead_token,
      is_test = false,
      mock_mode = false,
      skip_relighting = false,
      lighting_intensity = 0.6,
    } = body;

    // ========================================================================
    // DÉTERMINER LE MODE DE PIPELINE
    // ========================================================================
    // Pipeline B (compositing) si composited_image est fourni
    // Pipeline A (flux-kontext) sinon (nécessite input_image + mask_image)
    const useCompositingPipeline = !!composited_image;
    console.log(`=== Pipeline mode: ${useCompositingPipeline ? 'B (COMPOSITING)' : 'A (FLUX-KONTEXT)'} ===`);

    // ========================================================================
    // VALIDATION
    // ========================================================================
    if (!asset_id) {
      return new Response(JSON.stringify({ error: "asset_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (useCompositingPipeline) {
      // Pipeline B: Juste besoin de composited_image (déjà vérifié via useCompositingPipeline)
      console.log("Using Pipeline B: composited_image provided");
    } else {
      // Pipeline A: Besoin de input_image ET mask_image
      if (!input_image) {
        return new Response(JSON.stringify({ error: "input_image is required (or provide composited_image for Pipeline B)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!mask_image) {
        return new Response(JSON.stringify({ error: "mask_image is required (or provide composited_image for Pipeline B)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("Using Pipeline A: input_image + mask_image provided");
    }

    // Récupérer la clé API fal.ai
    const falApiKey = Deno.env.get("FAL_AI_KEY");
    if (!falApiKey && !mock_mode) {
      console.error("FAL_AI_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error: FAL_AI_KEY missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // VÉRIFICATION QUOTA (si lead_token fourni)
    // ========================================================================
    let leadId: string | null = null;
    let simulationsRemaining = 999; // Mode commercial = illimité

    if (lead_token) {
      const { data: quotaCheck, error: quotaError } = await supabase.rpc(
        "increment_simulation_count",
        { p_lead_token: lead_token }
      );

      if (quotaError) {
        console.error("Quota check error:", quotaError);
        // Continuer sans vérification de quota en cas d'erreur
      } else if (quotaCheck && quotaCheck.length > 0) {
        const quota = quotaCheck[0];
        if (!quota.can_simulate) {
          return new Response(
            JSON.stringify({
              error: "limit_reached",
              message: "Vous avez utilisé vos 3 simulations gratuites.",
              cta: "Prenez rendez-vous pour continuer",
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        leadId = quota.lead_id;
        simulationsRemaining = quota.remaining;
      }
    }

    // ========================================================================
    // RÉCUPÉRER L'ASSET (poêle) - Utilise les vues public.snapstudio_*
    // ========================================================================
    const { data: asset, error: assetError } = await supabase
      .from("snapstudio_assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    if (assetError || !asset) {
      console.error("Asset error:", assetError);
      return new Response(
        JSON.stringify({ error: "Asset not found", details: assetError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Récupérer la marque séparément
    const { data: brand, error: brandError } = await supabase
      .from("snapstudio_brands")
      .select("id, name")
      .eq("id", asset.brand_id)
      .single();

    if (brandError || !brand) {
      console.error("Brand error:", brandError);
      return new Response(
        JSON.stringify({ error: "Brand not found", details: brandError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construire l'objet asset avec la marque
    const assetData: Asset = {
      id: asset.id,
      name: asset.name,
      description: asset.description || "",
      image_detouree: asset.image_detouree,
      brand: brand,
    };

    console.log("Asset loaded:", assetData.name, "by", assetData.brand.name);

    // ========================================================================
    // CRÉER L'ENREGISTREMENT DE GÉNÉRATION
    // ========================================================================
    const pipelineName = useCompositingPipeline
      ? "compositing + iclight-v2"
      : "flux-kontext-lora/inpaint + iclight-v2";

    const { data: generation, error: genError } = await supabase
      .from("snapstudio_generations")
      .insert({
        lead_id: leadId,
        asset_id: asset_id,
        input_image_path: "pending",
        mask_image_path: useCompositingPipeline ? "compositing-mode" : "pending",
        prompt_used: `Pipeline: ${pipelineName} for ${assetData.brand.name} ${assetData.name}`,
        fal_model: pipelineName,
        status: "processing",
        is_test: is_test,
        is_mock: mock_mode,
      })
      .select("id")
      .single();

    if (genError) {
      console.error("Generation insert error:", genError);
      throw new Error(`Failed to create generation record: ${genError.message}`);
    }

    const generationId = generation.id;
    console.log("Generation record created:", generationId);

    // ========================================================================
    // UPLOAD DES IMAGES VERS STORAGE
    // ========================================================================
    const basePath = `uploads/${leadId || "anonymous"}/${generationId}`;

    let inputImageUrl: string = "";
    let maskImageUrl: string = "";
    let compositedImageUrl: string = "";

    if (useCompositingPipeline) {
      // Pipeline B: Upload l'image compositée
      if (composited_image!.startsWith("http")) {
        compositedImageUrl = composited_image!;
      } else {
        compositedImageUrl = await uploadToStorage(
          supabase,
          composited_image!,
          `${basePath}/composited.jpg`,
          "image/jpeg"
        );
      }
      console.log("Composited image URL:", compositedImageUrl);

      // Optionnel: Upload aussi l'original si fourni (pour référence/debug)
      if (input_image) {
        if (input_image.startsWith("http")) {
          inputImageUrl = input_image;
        } else {
          inputImageUrl = await uploadToStorage(
            supabase,
            input_image,
            `${basePath}/input_original.jpg`,
            "image/jpeg"
          );
        }
        console.log("Original image also saved:", inputImageUrl);
      }

      // Mettre à jour les paths
      await supabase
        .from("snapstudio_generations")
        .update({
          input_image_path: `${basePath}/composited.jpg`,
          mask_image_path: "compositing-mode",
        })
        .eq("id", generationId);

    } else {
      // Pipeline A: Upload input + mask
      if (input_image!.startsWith("http")) {
        inputImageUrl = input_image!;
      } else {
        inputImageUrl = await uploadToStorage(
          supabase,
          input_image!,
          `${basePath}/input.jpg`,
          "image/jpeg"
        );
      }
      console.log("Input image URL:", inputImageUrl);

      if (mask_image!.startsWith("http")) {
        maskImageUrl = mask_image!;
      } else {
        maskImageUrl = await uploadToStorage(
          supabase,
          mask_image!,
          `${basePath}/mask.png`,
          "image/png"
        );
      }
      console.log("Mask image URL:", maskImageUrl);

      // Mettre à jour les paths dans la génération
      await supabase
        .from("snapstudio_generations")
        .update({
          input_image_path: `${basePath}/input.jpg`,
          mask_image_path: `${basePath}/mask.png`,
        })
        .eq("id", generationId);
    }

    // URL du PNG détouré du poêle (pour Pipeline A uniquement)
    const {
      data: { publicUrl: stoveImageUrl },
    } = supabase.storage.from("snapstudio").getPublicUrl(assetData.image_detouree);
    console.log("Stove image URL:", stoveImageUrl);

    // ========================================================================
    // MODE MOCK (pour développement sans fal.ai)
    // ========================================================================
    if (mock_mode) {
      console.log("=== MOCK MODE - Skipping fal.ai calls ===");

      const mockResultUrl = useCompositingPipeline
        ? "https://placehold.co/1024x768/4CAF50/white?text=MOCK+RESULT%0APipeline+B%0ACompositing+%2B+IC-Light"
        : "https://placehold.co/1024x768/E65100/white?text=MOCK+RESULT%0APipeline+A%0AFlux+Kontext+%2B+IC-Light";

      await supabase
        .from("snapstudio_generations")
        .update({
          status: "completed",
          result_image_path: "mock",
          generation_time_ms: 100,
          completed_at: new Date().toISOString(),
          fal_response: { 
            mock: true, 
            pipeline: useCompositingPipeline ? "compositing" : "flux-kontext",
            lighting_intensity: lighting_intensity,
          },
        })
        .eq("id", generationId);

      // Log event
      await supabase.from("snapstudio_events").insert({
        lead_id: leadId,
        generation_id: generationId,
        event_type: "simulation_completed",
        event_data: { 
          asset_id, 
          mock_mode: true, 
          pipeline: useCompositingPipeline ? "compositing" : "flux-kontext",
          lighting_intensity: lighting_intensity,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          generation_id: generationId,
          result_image_url: mockResultUrl,
          simulations_remaining: simulationsRemaining,
          asset: {
            id: assetData.id,
            name: assetData.name,
            brand: assetData.brand.name,
          },
          pipeline: useCompositingPipeline 
            ? ["client-compositing", "mock-iclight-v2"] 
            : ["mock-flux-kontext", "mock-iclight-v2"],
          cost_estimate_usd: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // PIPELINE RÉEL
    // ========================================================================
    const startTime = Date.now();
    let finalImageUrl: string;
    const pipelineSteps: string[] = [];

    try {
      if (useCompositingPipeline) {
        // ==================================================================
        // PIPELINE B: Compositing (côté client) → IC-Light V2
        // L'image compositée est déjà prête, on passe directement à IC-Light
        // ==================================================================
        console.log("=== PIPELINE B: Client Compositing + IC-Light V2 ===");
        pipelineSteps.push("client-compositing");

        if (!skip_relighting) {
          finalImageUrl = await stepIcLightV2(
            compositedImageUrl,
            assetData,
            falApiKey!,
            lighting_intensity
          );
          pipelineSteps.push("iclight-v2");
        } else {
          // Sans IC-Light, on retourne l'image compositée telle quelle
          finalImageUrl = compositedImageUrl;
          console.log("Skipping IC-Light V2 (skip_relighting=true)");
        }

      } else {
        // ==================================================================
        // PIPELINE A: FLUX Kontext Inpaint → IC-Light V2 (original)
        // ==================================================================
        console.log("=== PIPELINE A: FLUX Kontext Inpaint + IC-Light V2 ===");

        // ÉTAPE 1: FLUX Kontext Lora Inpaint
        const step1Result = await stepFluxKontextInpaint(
          inputImageUrl,
          maskImageUrl,
          stoveImageUrl,
          assetData,
          falApiKey!
        );
        pipelineSteps.push("flux-kontext-inpaint");

        // ÉTAPE 2: IC-Light V2 (sauf si skip_relighting)
        if (!skip_relighting) {
          finalImageUrl = await stepIcLightV2(
            step1Result,
            assetData,
            falApiKey!,
            lighting_intensity
          );
          pipelineSteps.push("iclight-v2");
        } else {
          finalImageUrl = step1Result;
          console.log("Skipping IC-Light V2 (skip_relighting=true)");
        }
      }
    } catch (pipelineError) {
      console.error("Pipeline error:", pipelineError);

      // Marquer la génération comme échouée
      await supabase
        .from("snapstudio_generations")
        .update({
          status: "failed",
          error_message: String(pipelineError),
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);

      throw pipelineError;
    }

    const generationTimeMs = Date.now() - startTime;
    console.log(`Pipeline completed in ${generationTimeMs}ms`);

    // ========================================================================
    // STOCKER LE RÉSULTAT FINAL
    // ========================================================================
    const resultPath = `results/${generationId}/result.jpg`;
    const storedResultUrl = await downloadAndStore(supabase, finalImageUrl, resultPath);
    console.log("Result stored at:", storedResultUrl);

    // Estimation du coût (approximatif)
    // Pipeline A: FLUX Kontext Inpaint (~$0.05/MP) + IC-Light V2 (~$0.10/MP) = ~$0.15
    // Pipeline B: IC-Light V2 seul (~$0.10/MP) = ~$0.10
    let costEstimateUsd: number;
    if (skip_relighting) {
      costEstimateUsd = useCompositingPipeline ? 0 : 0.05;
    } else {
      costEstimateUsd = useCompositingPipeline ? 0.10 : 0.15;
    }

    // Mettre à jour la génération
    await supabase
      .from("snapstudio_generations")
      .update({
        status: "completed",
        result_image_path: resultPath,
        generation_time_ms: generationTimeMs,
        fal_cost_usd: costEstimateUsd,
        completed_at: new Date().toISOString(),
        fal_response: {
          pipeline: pipelineSteps,
          final_url: finalImageUrl,
          lighting_intensity: lighting_intensity,
        },
      })
      .eq("id", generationId);

    // Log event
    await supabase.from("snapstudio_events").insert({
      lead_id: leadId,
      generation_id: generationId,
      event_type: "simulation_completed",
      event_data: {
        asset_id,
        pipeline: pipelineSteps,
        generation_time_ms: generationTimeMs,
        cost_estimate_usd: costEstimateUsd,
        lighting_intensity: lighting_intensity,
      },
    });

    // ========================================================================
    // RÉPONSE SUCCÈS
    // ========================================================================
    return new Response(
      JSON.stringify({
        success: true,
        generation_id: generationId,
        result_image_url: storedResultUrl,
        simulations_remaining: simulationsRemaining,
        asset: {
          id: assetData.id,
          name: assetData.name,
          brand: assetData.brand.name,
        },
        pipeline: pipelineSteps,
        generation_time_ms: generationTimeMs,
        cost_estimate_usd: costEstimateUsd,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({
        error: "Generation failed",
        details: String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
