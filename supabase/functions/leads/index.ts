// ============================================================================
// SNAPSTUDIO V2 - Edge Function /leads
// Gestion des prospects (création et récupération)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // À restreindre en prod: "https://mayer-energie.fr"
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lead-Token, apikey, x-client-info",
};

// Types
interface CreateLeadRequest {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  address?: string;
  optin_newsletter?: boolean;
  dimensioning_id?: string;
  selected_asset_id?: string;
  source_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  is_test?: boolean;
}

interface LeadResponse {
  lead_token: string;
  simulations_remaining: number;
  is_existing: boolean;
}

interface LeadInfoResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address: string | null;
  simulations_count: number;
  simulations_limit: number;
  simulations_remaining: number;
  status: string;
  can_book_rdv: boolean;
  dimensioning: Record<string, unknown> | null;
  selected_asset: Record<string, unknown> | null;
  generations: Array<{
    id: string;
    result_image_path: string;
    asset: { name: string } | null;
    created_at: string;
  }>;
}

// Validation email simple
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Créer le client Supabase avec le service role
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
    // ========================================================================
    // POST: Créer un lead
    // ========================================================================
    if (req.method === "POST") {
      const body: CreateLeadRequest = await req.json();

      const {
        email,
        first_name,
        last_name,
        phone,
        address,
        optin_newsletter,
        dimensioning_id,
        selected_asset_id,
        source_url,
        utm_source,
        utm_medium,
        utm_campaign,
        is_test,
      } = body;

      // Validation des champs requis
      if (!email || !first_name || !last_name) {
        return new Response(
          JSON.stringify({ 
            error: "Champs requis manquants",
            details: "Email, prénom et nom sont obligatoires" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validation format email
      if (!isValidEmail(email)) {
        return new Response(
          JSON.stringify({ 
            error: "Email invalide",
            details: "Le format de l'email n'est pas valide" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Vérifier si le lead existe déjà
      const { data: existingLead, error: findError } = await supabase
        .from("leads")
        .select("id, lead_token, simulations_count, simulations_limit")
        .eq("email", normalizedEmail)
        .schema("snapstudio")
        .maybeSingle();

      if (findError) {
        console.error("Error finding lead:", findError);
        throw findError;
      }

      if (existingLead) {
        // Lead existe déjà → retourner le token existant
        console.log(`Lead already exists: ${normalizedEmail}`);
        
        const response: LeadResponse = {
          lead_token: existingLead.lead_token,
          simulations_remaining: existingLead.simulations_limit - existingLead.simulations_count,
          is_existing: true,
        };

        return new Response(
          JSON.stringify(response),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Créer le nouveau lead
      const { data: newLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          email: normalizedEmail,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          phone: phone?.trim() || null,
          address: address?.trim() || null,
          optin_newsletter: optin_newsletter || false,
          dimensioning_id: dimensioning_id || null,
          selected_asset_id: selected_asset_id || null,
          source_url: source_url || null,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          is_test: is_test || false,
        })
        .schema("snapstudio")
        .select("id, lead_token, simulations_limit")
        .single();

      if (insertError) {
        console.error("Error creating lead:", insertError);
        throw insertError;
      }

      console.log(`New lead created: ${normalizedEmail} (${newLead.id})`);

      // Lier le dimensioning au lead si fourni
      if (dimensioning_id) {
        const { error: updateDimError } = await supabase
          .from("dimensioning")
          .update({ lead_id: newLead.id })
          .eq("id", dimensioning_id)
          .schema("snapstudio");

        if (updateDimError) {
          console.error("Error linking dimensioning:", updateDimError);
          // Ne pas échouer pour ça, juste logger
        }
      }

      // Logger l'événement
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                       req.headers.get("cf-connecting-ip") || 
                       null;

      await supabase
        .from("events")
        .insert({
          lead_id: newLead.id,
          event_type: "lead_created",
          event_data: {
            source_url,
            utm_source,
            utm_medium,
            utm_campaign,
            has_phone: !!phone,
            has_address: !!address,
            optin_newsletter,
          },
          source_url: source_url || null,
          user_agent: req.headers.get("user-agent") || null,
          ip_address: clientIp,
        })
        .schema("snapstudio");

      const response: LeadResponse = {
        lead_token: newLead.lead_token,
        simulations_remaining: newLead.simulations_limit,
        is_existing: false,
      };

      return new Response(
        JSON.stringify(response),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // GET: Récupérer les infos d'un lead via son token
    // ========================================================================
    if (req.method === "GET") {
      const leadToken = req.headers.get("X-Lead-Token");

      if (!leadToken) {
        return new Response(
          JSON.stringify({ 
            error: "Token manquant",
            details: "Le header X-Lead-Token est requis" 
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Récupérer le lead avec ses relations
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select(`
          id, 
          email, 
          first_name, 
          last_name, 
          phone, 
          address,
          simulations_count, 
          simulations_limit, 
          status,
          dimensioning_id,
          selected_asset_id
        `)
        .eq("lead_token", leadToken)
        .schema("snapstudio")
        .maybeSingle();

      if (leadError) {
        console.error("Error fetching lead:", leadError);
        throw leadError;
      }

      if (!lead) {
        return new Response(
          JSON.stringify({ 
            error: "Lead non trouvé",
            details: "Aucun lead ne correspond à ce token" 
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Récupérer le dimensioning si existe
      let dimensioning = null;
      if (lead.dimensioning_id) {
        const { data: dimData } = await supabase
          .from("dimensioning")
          .select("*")
          .eq("id", lead.dimensioning_id)
          .schema("snapstudio")
          .maybeSingle();
        dimensioning = dimData;
      }

      // Récupérer l'asset sélectionné si existe
      let selectedAsset = null;
      if (lead.selected_asset_id) {
        const { data: assetData } = await supabase
          .from("assets")
          .select(`
            id, 
            name, 
            reference,
            image_detouree,
            price_from,
            power_kw,
            brands:brand_id (
              id,
              name
            )
          `)
          .eq("id", lead.selected_asset_id)
          .schema("snapstudio")
          .maybeSingle();
        selectedAsset = assetData;
      }

      // Récupérer les générations du lead
      const { data: generations } = await supabase
        .from("generations")
        .select(`
          id, 
          result_image_path, 
          created_at,
          status,
          assets:asset_id (
            name
          )
        `)
        .eq("lead_id", lead.id)
        .eq("status", "completed")
        .schema("snapstudio")
        .order("created_at", { ascending: false });

      const response: LeadInfoResponse = {
        id: lead.id,
        email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone: lead.phone,
        address: lead.address,
        simulations_count: lead.simulations_count,
        simulations_limit: lead.simulations_limit,
        simulations_remaining: lead.simulations_limit - lead.simulations_count,
        status: lead.status,
        can_book_rdv: !!(lead.phone && lead.address),
        dimensioning: dimensioning,
        selected_asset: selectedAsset,
        generations: generations?.map((g) => ({
          id: g.id,
          result_image_path: g.result_image_path,
          asset: g.assets,
          created_at: g.created_at,
        })) || [],
      };

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Méthode non supportée
    // ========================================================================
    return new Response(
      JSON.stringify({ error: "Méthode non supportée" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
