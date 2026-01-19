// ============================================================================
// SNAPSTUDIO V2 - Edge Function /assets
// Gestion du catalogue de produits (poêles)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // À restreindre en prod: "https://mayer-energie.fr"
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// Types
interface Asset {
  id: string;
  reference: string | null;
  name: string;
  description: string | null;
  image_original: string | null;
  image_detouree: string;
  image_detouree_url?: string; // URL publique générée
  images_context: string[] | null;
  power_kw: number | null;
  efficiency_pct: number | null;
  fuel_type: string | null;
  height_mm: number | null;
  width_mm: number | null;
  depth_mm: number | null;
  price_from: number | null;
  style: string | null;
  size_category: string | null;
  min_room_size: number | null;
  max_room_size: number | null;
  suitable_multi_room: boolean | null;
  objective_match: string[] | null;
  product_url: string | null;
  datasheet_url: string | null;
  is_featured: boolean;
  sort_order: number;
  catalog: {
    id: string;
    slug: string;
    name: string;
  } | null;
  brand: {
    id: string;
    slug: string;
    name: string;
    logo_path: string | null;
  } | null;
}

interface AssetListResponse {
  assets: Asset[];
  total: number;
  filters: {
    catalogs: { slug: string; name: string; count: number }[];
    brands: { slug: string; name: string; count: number }[];
    fuel_types: { value: string; count: number }[];
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Seulement GET autorisé
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Méthode non supportée" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Créer le client Supabase
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Vérifier si on demande un asset spécifique: /assets/{id}
    // Le path sera comme: /functions/v1/assets/{id}
    const assetId = pathParts.length > 3 ? pathParts[3] : null;

    // ========================================================================
    // GET /assets/{id} - Récupérer un asset spécifique
    // ========================================================================
    if (assetId) {
      const { data: asset, error } = await supabase
        .from("assets")
        .select(`
          *,
          catalog:asset_catalogs!catalog_id (
            id,
            slug,
            name
          ),
          brand:brands!brand_id (
            id,
            slug,
            name,
            logo_path
          )
        `)
        .eq("id", assetId)
        .eq("is_active", true)
        .schema("snapstudio")
        .maybeSingle();

      if (error) {
        console.error("Error fetching asset:", error);
        throw error;
      }

      if (!asset) {
        return new Response(
          JSON.stringify({ 
            error: "Asset non trouvé",
            details: "Aucun produit ne correspond à cet identifiant" 
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Générer l'URL publique de l'image détourée
      const { data: publicUrlData } = supabase.storage
        .from("snapstudio")
        .getPublicUrl(asset.image_detouree);

      const assetWithUrl = {
        ...asset,
        image_detouree_url: publicUrlData?.publicUrl || null,
      };

      return new Response(
        JSON.stringify(assetWithUrl),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // GET /assets - Liste des assets avec filtres
    // ========================================================================
    
    // Récupérer les paramètres de filtre
    const catalogSlug = url.searchParams.get("catalog");
    const brandSlug = url.searchParams.get("brand");
    const fuelType = url.searchParams.get("fuel_type");
    const featured = url.searchParams.get("featured");
    const style = url.searchParams.get("style");
    const minPower = url.searchParams.get("min_power");
    const maxPower = url.searchParams.get("max_power");
    const roomSize = url.searchParams.get("room_size"); // Pour recommandations
    const multiRoom = url.searchParams.get("multi_room");
    const objective = url.searchParams.get("objective");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Construire la requête
    let query = supabase
      .from("assets")
      .select(`
        *,
        catalog:asset_catalogs!catalog_id (
          id,
          slug,
          name
        ),
        brand:brands!brand_id (
          id,
          slug,
          name,
          logo_path
        )
      `, { count: "exact" })
      .eq("is_active", true)
      .schema("snapstudio")
      .order("sort_order", { ascending: true })
      .order("is_featured", { ascending: false })
      .range(offset, offset + limit - 1);

    // Appliquer les filtres
    if (catalogSlug) {
      // Récupérer l'ID du catalogue par son slug
      const { data: catalogData } = await supabase
        .from("asset_catalogs")
        .select("id")
        .eq("slug", catalogSlug)
        .schema("snapstudio")
        .maybeSingle();
      
      if (catalogData) {
        query = query.eq("catalog_id", catalogData.id);
      }
    }

    if (brandSlug) {
      // Récupérer l'ID de la marque par son slug
      const { data: brandData } = await supabase
        .from("brands")
        .select("id")
        .eq("slug", brandSlug)
        .schema("snapstudio")
        .maybeSingle();
      
      if (brandData) {
        query = query.eq("brand_id", brandData.id);
      }
    }

    if (fuelType) {
      query = query.eq("fuel_type", fuelType);
    }

    if (featured === "true") {
      query = query.eq("is_featured", true);
    }

    if (style) {
      query = query.eq("style", style);
    }

    if (minPower) {
      query = query.gte("power_kw", parseFloat(minPower));
    }

    if (maxPower) {
      query = query.lte("power_kw", parseFloat(maxPower));
    }

    // Filtres pour recommandations basées sur le dimensionnement
    if (roomSize) {
      const size = parseInt(roomSize);
      query = query
        .lte("min_room_size", size)
        .gte("max_room_size", size);
    }

    if (multiRoom === "true") {
      query = query.eq("suitable_multi_room", true);
    }

    if (objective) {
      query = query.contains("objective_match", [objective]);
    }

    // Exécuter la requête
    const { data: assets, error, count } = await query;

    if (error) {
      console.error("Error fetching assets:", error);
      throw error;
    }

    // Générer les URLs publiques pour chaque asset
    const assetsWithUrls = (assets || []).map((asset) => {
      const { data: publicUrlData } = supabase.storage
        .from("snapstudio")
        .getPublicUrl(asset.image_detouree);

      return {
        ...asset,
        image_detouree_url: publicUrlData?.publicUrl || null,
      };
    });

    // ========================================================================
    // Récupérer les filtres disponibles (pour l'UI)
    // ========================================================================
    
    // Catalogues avec comptage
    const { data: catalogsData } = await supabase
      .from("asset_catalogs")
      .select(`
        slug,
        name,
        assets:assets!catalog_id (count)
      `)
      .eq("is_active", true)
      .schema("snapstudio")
      .order("sort_order", { ascending: true });

    const catalogs = (catalogsData || []).map((c) => ({
      slug: c.slug,
      name: c.name,
      count: Array.isArray(c.assets) ? c.assets.length : 0,
    }));

    // Marques avec comptage
    const { data: brandsData } = await supabase
      .from("brands")
      .select(`
        slug,
        name,
        assets:assets!brand_id (count)
      `)
      .eq("is_active", true)
      .schema("snapstudio")
      .order("sort_order", { ascending: true });

    const brands = (brandsData || []).map((b) => ({
      slug: b.slug,
      name: b.name,
      count: Array.isArray(b.assets) ? b.assets.length : 0,
    }));

    // Types de combustible avec comptage
    const { data: fuelTypesData } = await supabase
      .from("assets")
      .select("fuel_type")
      .eq("is_active", true)
      .not("fuel_type", "is", null)
      .schema("snapstudio");

    const fuelTypeCounts: Record<string, number> = {};
    (fuelTypesData || []).forEach((item) => {
      if (item.fuel_type) {
        fuelTypeCounts[item.fuel_type] = (fuelTypeCounts[item.fuel_type] || 0) + 1;
      }
    });

    const fuelTypes = Object.entries(fuelTypeCounts).map(([value, count]) => ({
      value,
      count,
    }));

    // Construire la réponse
    const response: AssetListResponse = {
      assets: assetsWithUrls,
      total: count || 0,
      filters: {
        catalogs,
        brands,
        fuel_types: fuelTypes,
      },
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Erreur serveur",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
