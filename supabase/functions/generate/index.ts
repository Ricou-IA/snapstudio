// ============================================================================
// SNAPSTUDIO V2 - Edge Function /generate
// Génération d'images IA avec FLUX Kontext Lora Inpaint
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // À restreindre en prod: "https://mayer-energie.fr"
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lead-Token, apikey, x-client-info",
};

// URL du modèle fal.ai
const FAL_API_URL = "https://fal.run/fal-ai/flux-kontext-lora/inpaint";

// Types
interface GenerateRequest {
  asset_id: string;          // ID de l'asset (poêle) à insérer
  input_image: string;       // Image de la pièce en base64
  mask_image: string;        // Masque en base64 (blanc = zone à remplir)
  is_test?: boolean;         // Flag test
  mock_mode?: boolean;       // Mode mock (pas d'appel fal.ai)
}

interface GenerateResponse {
  success: boolean;
  generation_id: string;
  result_image_url: string;
  simulations_remaining: number;
  asset: {
    id: string;
    name: string;
    brand: string;
  };
}

// Fonction utilitaire pour décoder base64
function base64ToUint8Array(base64: string): Uint8Array {
  // Retirer le préfixe data:image/... si présent
  const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Fonction pour générer un nom de fichier unique
function generateFileName(prefix: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}.${extension}`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Seulement POST autorisé
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Méthode non supportée" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Créer le client Supabase
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const falApiKey = Deno.env.get("FAL_AI_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!falApiKey) {
    console.error("FAL_AI_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error: FAL_AI_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Récupérer le token du lead (optionnel pour mode commercial)
    const leadToken = req.headers.get("X-Lead-Token");
    
    // Parser la requête
    const body: GenerateRequest = await req.json();
    const { asset_id, input_image, mask_image, is_test, mock_mode } = body;

    // Validation des champs requis
    if (!asset_id) {
      return new Response(
        JSON.stringify({ error: "asset_id est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!input_image) {
      return new Response(
        JSON.stringify({ error: "input_image est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!mask_image) {
      return new Response(
        JSON.stringify({ error: "mask_image est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Vérification du quota si lead_token fourni (mode B2C)
    // ========================================================================
    let leadId: string | null = null;
    let simulationsRemaining = 999; // Mode commercial = illimité

    if (leadToken) {
      // Appeler la fonction pour vérifier et incrémenter le quota
      const { data: quotaResult, error: quotaError } = await supabase
        .rpc("increment_simulation_count", { p_lead_token: leadToken })
        .schema("snapstudio");

      if (quotaError) {
        console.error("Error checking quota:", quotaError);
        throw quotaError;
      }

      // La fonction retourne un tableau avec un seul résultat
      const quota = Array.isArray(quotaResult) ? quotaResult[0] : quotaResult;

      if (!quota || !quota.can_simulate) {
        return new Response(
          JSON.stringify({
            error: "limit_reached",
            message: "Vous avez utilisé vos 3 simulations gratuites.",
            cta: "Prenez rendez-vous pour continuer avec des simulations illimitées",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      leadId = quota.lead_id;
      simulationsRemaining = quota.remaining;
      console.log(`Lead ${leadId}: simulation authorized, ${simulationsRemaining} remaining`);
    }

    // ========================================================================
    // Récupérer l'asset (poêle) avec son image détourée
    // ========================================================================
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select(`
        id,
        name,
        description,
        image_detouree,
        brand:brands!brand_id (
          id,
          name
        )
      `)
      .eq("id", asset_id)
      .eq("is_active", true)
      .schema("snapstudio")
      .maybeSingle();

    if (assetError) {
      console.error("Error fetching asset:", assetError);
      throw assetError;
    }

    if (!asset) {
      return new Response(
        JSON.stringify({ error: "Asset non trouvé ou inactif" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brandName = asset.brand?.name || "Unknown";
    console.log(`Asset: ${brandName} ${asset.name}`);

    // Générer l'URL publique de l'image détourée
    const { data: publicUrlData } = supabase.storage
      .from("snapstudio")
      .getPublicUrl(asset.image_detouree);

    const referenceImageUrl = publicUrlData?.publicUrl;

    if (!referenceImageUrl) {
      return new Response(
        JSON.stringify({ error: "Image détourée non trouvée pour cet asset" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Reference image URL: ${referenceImageUrl}`);

    // ========================================================================
    // Créer l'enregistrement de génération (status: processing)
    // ========================================================================
    const prompt = `A ${brandName} ${asset.name} wood stove installed in this room, realistic lighting, professional interior photography, seamless integration, photorealistic, the stove fits naturally in the space with realistic shadows and reflections`;

    const { data: generation, error: genInsertError } = await supabase
      .from("generations")
      .insert({
        lead_id: leadId,
        asset_id: asset.id,
        mode: leadToken ? "public" : "commercial",
        input_image_path: "pending",
        mask_image_path: "pending",
        prompt_used: prompt,
        fal_model: "fal-ai/flux-kontext-lora/inpaint",
        status: "processing",
        is_test: is_test || false,
        is_mock: mock_mode || false,
      })
      .schema("snapstudio")
      .select("id")
      .single();

    if (genInsertError) {
      console.error("Error creating generation record:", genInsertError);
      throw genInsertError;
    }

    const generationId = generation.id;
    console.log(`Generation record created: ${generationId}`);

    // ========================================================================
    // Upload des images vers Storage
    // ========================================================================
    const folderPath = leadId ? `uploads/${leadId}/${generationId}` : `uploads/anonymous/${generationId}`;

    // Upload input image
    const inputFileName = generateFileName("input", "jpg");
    const inputPath = `${folderPath}/${inputFileName}`;
    const inputBuffer = base64ToUint8Array(input_image);

    const { error: inputUploadError } = await supabase.storage
      .from("snapstudio")
      .upload(inputPath, inputBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (inputUploadError) {
      console.error("Error uploading input image:", inputUploadError);
      throw inputUploadError;
    }

    // Upload mask image
    const maskFileName = generateFileName("mask", "png");
    const maskPath = `${folderPath}/${maskFileName}`;
    const maskBuffer = base64ToUint8Array(mask_image);

    const { error: maskUploadError } = await supabase.storage
      .from("snapstudio")
      .upload(maskPath, maskBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (maskUploadError) {
      console.error("Error uploading mask image:", maskUploadError);
      throw maskUploadError;
    }

    // Mettre à jour les paths dans la génération
    await supabase
      .from("generations")
      .update({
        input_image_path: inputPath,
        mask_image_path: maskPath,
      })
      .eq("id", generationId)
      .schema("snapstudio");

    // Obtenir les URLs publiques pour fal.ai
    const { data: inputUrlData } = supabase.storage.from("snapstudio").getPublicUrl(inputPath);
    const { data: maskUrlData } = supabase.storage.from("snapstudio").getPublicUrl(maskPath);

    const inputImageUrl = inputUrlData?.publicUrl;
    const maskImageUrl = maskUrlData?.publicUrl;

    console.log(`Input image uploaded: ${inputImageUrl}`);
    console.log(`Mask image uploaded: ${maskImageUrl}`);

    // ========================================================================
    // Mode Mock : retourner une image placeholder
    // ========================================================================
    let resultImageUrl: string;
    let generationTimeMs: number | null = null;
    let falResponse: Record<string, unknown> | null = null;

    if (mock_mode) {
      console.log("MOCK MODE: Skipping fal.ai call");
      resultImageUrl = "https://placehold.co/1024x768/E97451/white?text=MOCK+RESULT+-+" + encodeURIComponent(asset.name);

      // Mettre à jour la génération
      await supabase
        .from("generations")
        .update({
          status: "completed",
          result_image_path: "mock",
          generation_time_ms: 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId)
        .schema("snapstudio");

    } else {
      // ========================================================================
      // Appel fal.ai avec le modèle FLUX Kontext Lora Inpaint
      // ========================================================================
      console.log("Calling fal.ai FLUX Kontext Lora Inpaint...");
      const startTime = Date.now();

      const falRequestBody = {
        image_url: inputImageUrl,
        mask_url: maskImageUrl,
        reference_image_url: referenceImageUrl,
        prompt: prompt,
        num_inference_steps: 30,
        guidance_scale: 2.5,
        strength: 0.88,
        output_format: "jpeg",
        num_images: 1,
      };

      console.log("fal.ai request:", JSON.stringify(falRequestBody, null, 2));

      const falApiResponse = await fetch(FAL_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Key ${falApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(falRequestBody),
      });

      generationTimeMs = Date.now() - startTime;
      const responseText = await falApiResponse.text();

      console.log(`fal.ai response status: ${falApiResponse.status}`);
      console.log(`fal.ai response time: ${generationTimeMs}ms`);
      console.log(`fal.ai response: ${responseText.substring(0, 500)}`);

      if (!falApiResponse.ok) {
        console.error("fal.ai error:", responseText);

        // Mettre à jour la génération avec l'erreur
        await supabase
          .from("generations")
          .update({
            status: "failed",
            error_message: responseText.substring(0, 1000),
            generation_time_ms: generationTimeMs,
            completed_at: new Date().toISOString(),
          })
          .eq("id", generationId)
          .schema("snapstudio");

        return new Response(
          JSON.stringify({
            error: "Erreur lors de la génération",
            details: responseText,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parser la réponse fal.ai
      try {
        falResponse = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse fal.ai response:", e);

        await supabase
          .from("generations")
          .update({
            status: "failed",
            error_message: "Invalid JSON response from fal.ai",
            generation_time_ms: generationTimeMs,
            completed_at: new Date().toISOString(),
          })
          .eq("id", generationId)
          .schema("snapstudio");

        return new Response(
          JSON.stringify({
            error: "Réponse invalide du générateur",
            details: responseText,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Vérifier que des images ont été générées
      const images = (falResponse as { images?: { url: string }[] }).images;
      if (!images || images.length === 0) {
        console.error("No images in fal.ai response:", falResponse);

        await supabase
          .from("generations")
          .update({
            status: "failed",
            error_message: "No images generated",
            fal_response: falResponse,
            generation_time_ms: generationTimeMs,
            completed_at: new Date().toISOString(),
          })
          .eq("id", generationId)
          .schema("snapstudio");

        return new Response(
          JSON.stringify({
            error: "Aucune image générée",
            details: JSON.stringify(falResponse),
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const generatedImageUrl = images[0].url;
      console.log(`Generated image URL: ${generatedImageUrl}`);

      // ========================================================================
      // Télécharger et stocker le résultat
      // ========================================================================
      const resultResponse = await fetch(generatedImageUrl);
      if (!resultResponse.ok) {
        throw new Error(`Failed to download generated image: ${resultResponse.status}`);
      }

      const resultBuffer = new Uint8Array(await resultResponse.arrayBuffer());
      const resultFileName = generateFileName("result", "jpg");
      const resultPath = `results/${generationId}/${resultFileName}`;

      const { error: resultUploadError } = await supabase.storage
        .from("snapstudio")
        .upload(resultPath, resultBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (resultUploadError) {
        console.error("Error uploading result image:", resultUploadError);
        throw resultUploadError;
      }

      // Obtenir l'URL publique du résultat
      const { data: resultUrlData } = supabase.storage.from("snapstudio").getPublicUrl(resultPath);
      resultImageUrl = resultUrlData?.publicUrl || generatedImageUrl;

      console.log(`Result stored: ${resultImageUrl}`);

      // Mettre à jour la génération avec succès
      await supabase
        .from("generations")
        .update({
          status: "completed",
          result_image_path: resultPath,
          fal_response: falResponse,
          fal_request_id: (falResponse as { request_id?: string }).request_id || null,
          generation_time_ms: generationTimeMs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId)
        .schema("snapstudio");
    }

    // ========================================================================
    // Logger l'événement
    // ========================================================================
    await supabase
      .from("events")
      .insert({
        lead_id: leadId,
        generation_id: generationId,
        event_type: "simulation_completed",
        event_data: {
          asset_id: asset.id,
          asset_name: asset.name,
          brand_name: brandName,
          mock_mode: mock_mode || false,
          generation_time_ms: generationTimeMs,
        },
      })
      .schema("snapstudio");

    // ========================================================================
    // Retourner la réponse
    // ========================================================================
    const response: GenerateResponse = {
      success: true,
      generation_id: generationId,
      result_image_url: resultImageUrl,
      simulations_remaining: simulationsRemaining,
      asset: {
        id: asset.id,
        name: asset.name,
        brand: brandName,
      },
    };

    console.log(`Generation completed successfully: ${generationId}`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Erreur serveur",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
