import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GenerateRequest {
  roomImage: string;
  asset: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
  };
  options?: {
    position?: "auto" | "left" | "center" | "right";
    style?: "realistic" | "magazine" | "warm";
  };
}

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

    // Validation
    if (!body.roomImage) {
      return new Response(
        JSON.stringify({ error: "roomImage is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.asset || !body.asset.name) {
      return new Response(
        JSON.stringify({ error: "asset with name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Récupérer la clé API fal.ai
    const falApiKey = Deno.env.get("FAL_AI_KEY");
    if (!falApiKey) {
      console.error("FAL_AI_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construire le prompt optimisé pour HVAC
    const position = body.options?.position || "auto";
    const style = body.options?.style || "realistic";

    const positionPrompt = position === "auto" 
      ? "naturally positioned in an appropriate location"
      : `positioned on the ${position} side of the room`;

    const stylePrompt = style === "magazine"
      ? "professional interior design photography, magazine quality"
      : style === "warm"
      ? "warm cozy atmosphere, soft lighting"
      : "photorealistic, natural lighting";

    const prompt = `A modern living room interior with a ${body.asset.name} wood stove ${positionPrompt}. 
The stove is ${body.asset.description || "a contemporary black wood-burning stove with visible flames through the glass door"}. 
${stylePrompt}, high quality, detailed, the stove fits naturally in the space, 
realistic shadows and reflections, interior design photography.`;

    console.log("Generated prompt:", prompt);

    // Préparer l'image en base64
    const imageData = body.roomImage.startsWith("data:") 
      ? body.roomImage 
      : `data:image/jpeg;base64,${body.roomImage}`;

    // Appeler fal.ai avec l'endpoint SYNCHRONE (fal.run au lieu de queue.fal.run)
    console.log("Calling fal.ai (sync mode)...");
    
    const falResponse = await fetch("https://fal.run/fal-ai/flux/dev/image-to-image", {
      method: "POST",
      headers: {
        "Authorization": `Key ${falApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        image_url: imageData,
        strength: 0.75,
        num_images: 1,
        enable_safety_checker: true,
        output_format: "jpeg",
        guidance_scale: 3.5,
        num_inference_steps: 28,
      }),
    });

    const responseText = await falResponse.text();
    console.log("fal.ai response status:", falResponse.status);
    console.log("fal.ai response:", responseText.substring(0, 500));

    if (!falResponse.ok) {
      console.error("fal.ai error:", responseText);
      return new Response(
        JSON.stringify({ error: "Image generation failed", details: responseText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parser la réponse
    let falResult;
    try {
      falResult = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse fal.ai response:", e);
      return new Response(
        JSON.stringify({ error: "Invalid response from image generator", details: responseText }),
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

    console.log("Image generated successfully!");

    // Retourner le résultat
    return new Response(
      JSON.stringify({
        success: true,
        image: falResult.images[0],
        prompt: prompt,
        seed: falResult.seed,
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
