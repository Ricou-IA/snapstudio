import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ============================================
// Configuration
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FAL_ENDPOINT = "https://fal.run/fal-ai/nano-banana-pro/edit";

// Prompt validé pour l'insertion de poêle
const STOVE_INSERTION_PROMPT = `Place the wood stove in the area indicated by the green marker. Use the green zone as a guide for horizontal positioning - the stove must stand on the floor, grounded naturally against the wall. Remove the green highlight completely after placing.

Clear the installation area - remove or relocate any furniture or objects that would overlap with the stove placement to create a realistic, safe installation space around the stove.

Blend the stove naturally into the scene. Keep the stove appearance exactly unchanged. Add a black metal flue pipe connecting from the stove top going up through the ceiling. Add realistic floor shadow beneath the stove, warm orange light reflection from flames onto nearby floor and wall. Match room's ambient lighting. Do not alter room elements outside the stove installation area.`;

// ============================================
// Types
// ============================================

interface GenerateRequest {
  /** ID de l'asset (poêle) sélectionné */
  asset_id: string;
  /** Image avec le marqueur vert (base64 JPEG) */
  marked_image: string;
}

interface FalResponse {
  images: Array<{
    url: string;
    content_type: string;
    width?: number;
    height?: number;
  }>;
  description?: string;
}

interface Asset {
  id: string;
  name: string;
  brand_id: string;
  description: string;
  image_principale: string;
  image_detouree: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Génère un UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Extrait les données base64 d'une data URI
 */
function extractBase64Data(dataUri: string): { data: string; mimeType: string } {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Format base64 invalide");
  }
  return {
    mimeType: matches[1],
    data: matches[2],
  };
}

/**
 * Convertit une string base64 en Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ============================================
// Main Handler
// ============================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Vérifier la méthode
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parser la requête
    const body: GenerateRequest = await req.json();

    // ========================================
    // 1. Validation des inputs
    // ========================================
    
    if (!body.asset_id) {
      return new Response(
        JSON.stringify({ error: "asset_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.marked_image) {
      return new Response(
        JSON.stringify({ error: "marked_image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier que c'est bien du base64
    if (!body.marked_image.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "marked_image must be a base64 data URI" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // 2. Initialiser Supabase Client
    // ========================================

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const falApiKey = Deno.env.get("FAL_AI_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase configuration missing");
      return new Response(
        JSON.stringify({ error: "Server configuration error (Supabase)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!falApiKey) {
      console.error("FAL_AI_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error (fal.ai)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================
    // 3. Récupérer l'asset depuis la DB
    // ========================================

    console.log(`Fetching asset: ${body.asset_id}`);

    const { data: asset, error: assetError } = await supabase
      .from("snapstudio_assets")
      .select("id, name, brand_id, description, image_principale, image_detouree")
      .eq("id", body.asset_id)
      .single();

    if (assetError || !asset) {
      console.error("Asset not found:", assetError);
      return new Response(
        JSON.stringify({ error: "Asset not found", details: assetError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!asset.image_detouree) {
      console.error("Asset has no detoured image:", asset.id);
      return new Response(
        JSON.stringify({ error: "Asset has no detoured image (image_detouree)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Asset found: ${asset.name}`);

    // ========================================
    // 4. Upload l'image marquée vers Storage
    // ========================================

    const generationId = generateUUID();
    const timestamp = Date.now();
    const markedImagePath = `generations/${generationId}/marked_${timestamp}.jpg`;

    console.log(`Uploading marked image to: ${markedImagePath}`);

    // Extraire les données base64
    const { data: base64Data, mimeType } = extractBase64Data(body.marked_image);
    const imageBytes = base64ToUint8Array(base64Data);

    const { error: uploadError } = await supabase.storage
      .from("snapstudio")
      .upload(markedImagePath, imageBytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Failed to upload marked image:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload image", details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obtenir l'URL publique de l'image marquée
    const { data: markedImageUrlData } = supabase.storage
      .from("snapstudio")
      .getPublicUrl(markedImagePath);

    const markedImageUrl = markedImageUrlData.publicUrl;
    console.log(`Marked image uploaded: ${markedImageUrl}`);

    // Construire l'URL du PNG détouré
    // Si c'est un path relatif, construire l'URL complète
    let stoveImageUrl = asset.image_detouree;
    if (!stoveImageUrl.startsWith("http")) {
      const { data: stoveUrlData } = supabase.storage
        .from("snapstudio")
        .getPublicUrl(asset.image_detouree);
      stoveImageUrl = stoveUrlData.publicUrl;
    }

    console.log(`Stove image URL: ${stoveImageUrl}`);

    // ========================================
    // 5. Appeler fal.ai Nano Banana Pro Edit
    // ========================================

    console.log("Calling fal.ai Nano Banana Pro Edit...");

    const falPayload = {
      prompt: STOVE_INSERTION_PROMPT,
      image_urls: [
        markedImageUrl,  // Image avec marqueur vert
        stoveImageUrl,   // PNG du poêle détouré
      ],
      num_images: 1,
      aspect_ratio: "auto",
      output_format: "jpeg",
      resolution: "1K",
    };

    console.log("fal.ai payload:", JSON.stringify(falPayload, null, 2));

    const falResponse = await fetch(FAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Key ${falApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(falPayload),
    });

    const falResponseText = await falResponse.text();
    console.log("fal.ai response status:", falResponse.status);
    console.log("fal.ai response:", falResponseText.substring(0, 1000));

    if (!falResponse.ok) {
      console.error("fal.ai error:", falResponseText);
      return new Response(
        JSON.stringify({ error: "Image generation failed", details: falResponseText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parser la réponse
    let falResult: FalResponse;
    try {
      falResult = JSON.parse(falResponseText);
    } catch (e) {
      console.error("Failed to parse fal.ai response:", e);
      return new Response(
        JSON.stringify({ error: "Invalid response from image generator", details: falResponseText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier que la réponse contient des images
    if (!falResult.images || !falResult.images.length) {
      console.error("No images in fal.ai response:", falResult);
      return new Response(
        JSON.stringify({ error: "No images generated", details: JSON.stringify(falResult) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const generatedImageUrl = falResult.images[0].url;
    console.log("Image generated successfully:", generatedImageUrl);

    // ========================================
    // 6. Télécharger et stocker le résultat
    // ========================================

    const resultImagePath = `generations/${generationId}/result_${timestamp}.jpg`;

    console.log(`Downloading and storing result to: ${resultImagePath}`);

    // Télécharger l'image générée
    const resultImageResponse = await fetch(generatedImageUrl);
    if (!resultImageResponse.ok) {
      console.error("Failed to download generated image");
      // On retourne quand même l'URL fal.ai si on ne peut pas stocker
    } else {
      const resultImageBlob = await resultImageResponse.arrayBuffer();
      
      const { error: resultUploadError } = await supabase.storage
        .from("snapstudio")
        .upload(resultImagePath, resultImageBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (resultUploadError) {
        console.error("Failed to upload result image:", resultUploadError);
        // On continue avec l'URL fal.ai
      }
    }

    // Obtenir l'URL publique du résultat (ou utiliser l'URL fal.ai)
    let finalResultUrl = generatedImageUrl;
    const { data: resultUrlData } = supabase.storage
      .from("snapstudio")
      .getPublicUrl(resultImagePath);
    
    if (resultUrlData?.publicUrl) {
      finalResultUrl = resultUrlData.publicUrl;
    }

    // ========================================
    // 7. Logger dans snapstudio_generations
    // ========================================

    console.log("Logging generation...");

    const { error: logError } = await supabase
      .from("snapstudio_generations")
      .insert({
        id: generationId,
        asset_id: body.asset_id,
        input_image_url: markedImageUrl,
        output_image_url: finalResultUrl,
        prompt_used: STOVE_INSERTION_PROMPT,
        model_used: "fal-ai/nano-banana-pro/edit",
        status: "completed",
        created_at: new Date().toISOString(),
      });

    if (logError) {
      console.error("Failed to log generation:", logError);
      // On continue quand même, le log n'est pas critique
    }

    // ========================================
    // 8. Retourner le résultat
    // ========================================

    console.log("Generation complete!");

    return new Response(
      JSON.stringify({
        success: true,
        image: {
          url: finalResultUrl,
          width: falResult.images[0].width,
          height: falResult.images[0].height,
        },
        marked_image_url: markedImageUrl,
        generation_id: generationId,
        prompt: STOVE_INSERTION_PROMPT,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
