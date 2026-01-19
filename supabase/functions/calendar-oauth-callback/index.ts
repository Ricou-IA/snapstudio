// ============================================================================
// SNAPSTUDIO V2 - Edge Function /calendar-oauth-callback
// Callback OAuth2 pour connexion Google Calendar des commerciaux
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  // Cette fonction reçoit le callback de Google OAuth après autorisation
  // Elle est appelée avec ?code=xxx&state=commercial_id

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // commercial_id
  const error = url.searchParams.get("error");

  // URL de redirection après traitement (à configurer selon votre admin)
  const successRedirectUrl = Deno.env.get("OAUTH_SUCCESS_REDIRECT_URL") || "https://mayer-energie.fr/admin/calendar-connected?success=true";
  const errorRedirectUrl = Deno.env.get("OAUTH_ERROR_REDIRECT_URL") || "https://mayer-energie.fr/admin/calendar-connected?error=true";

  // Gestion des erreurs OAuth
  if (error) {
    console.error("OAuth error:", error);
    return new Response(null, {
      status: 302,
      headers: { Location: `${errorRedirectUrl}&reason=${encodeURIComponent(error)}` },
    });
  }

  // Validation des paramètres
  if (!code || !state) {
    console.error("Missing code or state parameter");
    return new Response(null, {
      status: 302,
      headers: { Location: `${errorRedirectUrl}&reason=missing_params` },
    });
  }

  // Récupérer les variables d'environnement
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!supabaseUrl || !supabaseServiceKey || !googleClientId || !googleClientSecret) {
    console.error("Missing environment variables");
    return new Response(null, {
      status: 302,
      headers: { Location: `${errorRedirectUrl}&reason=config_error` },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ========================================================================
    // Échanger le code contre des tokens
    // ========================================================================
    const redirectUri = `${supabaseUrl}/functions/v1/calendar-oauth-callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return new Response(null, {
        status: 302,
        headers: { Location: `${errorRedirectUrl}&reason=token_exchange_failed` },
      });
    }

    const tokens = await tokenResponse.json();
    console.log("Tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    // ========================================================================
    // Récupérer les informations du compte Google
    // ========================================================================
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error("Failed to get user info");
      return new Response(null, {
        status: 302,
        headers: { Location: `${errorRedirectUrl}&reason=userinfo_failed` },
      });
    }

    const userInfo = await userInfoResponse.json();
    console.log("Google user:", userInfo.email);

    // ========================================================================
    // Vérifier que le commercial existe
    // ========================================================================
    const { data: commercial, error: fetchError } = await supabase
      .from("commercials")
      .select("id, email")
      .eq("id", state)
      .schema("snapstudio")
      .maybeSingle();

    if (fetchError || !commercial) {
      console.error("Commercial not found:", state);
      return new Response(null, {
        status: 302,
        headers: { Location: `${errorRedirectUrl}&reason=commercial_not_found` },
      });
    }

    // ========================================================================
    // Mettre à jour le commercial avec les tokens
    // ========================================================================
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const { error: updateError } = await supabase
      .from("commercials")
      .update({
        google_refresh_token: tokens.refresh_token || null,
        google_access_token: tokens.access_token,
        google_token_expires_at: expiresAt.toISOString(),
        google_calendar_id: userInfo.email, // Par défaut, le calendrier principal
        updated_at: new Date().toISOString(),
      })
      .eq("id", state)
      .schema("snapstudio");

    if (updateError) {
      console.error("Failed to update commercial:", updateError);
      return new Response(null, {
        status: 302,
        headers: { Location: `${errorRedirectUrl}&reason=update_failed` },
      });
    }

    console.log(`Google Calendar connected for commercial ${commercial.email}`);

    // ========================================================================
    // Rediriger vers la page de succès
    // ========================================================================
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${successRedirectUrl}&email=${encodeURIComponent(userInfo.email)}`,
      },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${errorRedirectUrl}&reason=unexpected_error`,
      },
    });
  }
});
