// ============================================================================
// SNAPSTUDIO V2 - Edge Function /calendar/book
// Réservation d'un créneau de RDV
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // À restreindre en prod: "https://mayer-energie.fr"
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lead-Token, apikey, x-client-info",
};

// Types
interface BookRequest {
  slot_datetime: string;     // ISO datetime du créneau
  commercial_id: string;     // ID du commercial
  phone?: string;            // Téléphone (si pas déjà renseigné)
  address?: string;          // Adresse (si pas déjà renseignée)
  notes?: string;            // Notes optionnelles
}

interface BookResponse {
  success: boolean;
  appointment_id: string;
  datetime: string;
  commercial_name: string;
  address: string;
}

// Rafraîchir le token Google OAuth
async function refreshGoogleToken(
  commercial: {
    id: string;
    google_refresh_token: string | null;
    google_access_token: string | null;
    google_token_expires_at: string | null;
  },
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  // Si le token n'est pas expiré, le retourner
  if (
    commercial.google_access_token &&
    commercial.google_token_expires_at &&
    new Date(commercial.google_token_expires_at) > new Date()
  ) {
    return commercial.google_access_token;
  }

  // Si pas de refresh token, impossible de rafraîchir
  if (!commercial.google_refresh_token) {
    return null;
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    console.error("Missing Google OAuth credentials");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: commercial.google_refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error(`Failed to refresh Google token: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Sauvegarder le nouveau token
    await supabase
      .from("commercials")
      .update({
        google_access_token: data.access_token,
        google_token_expires_at: expiresAt.toISOString(),
      })
      .eq("id", commercial.id)
      .schema("snapstudio");

    return data.access_token;
  } catch (error) {
    console.error("Error refreshing Google token:", error);
    return null;
  }
}

// Créer un événement Google Calendar
async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  lead: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  },
  startTime: Date,
  endTime: Date,
  address: string
): Promise<string | null> {
  try {
    const event = {
      summary: `RDV SnapStudio - ${lead.first_name} ${lead.last_name}`,
      description: `
Client : ${lead.first_name} ${lead.last_name}
Email : ${lead.email}
Téléphone : ${lead.phone || "Non renseigné"}

Simulation poêle réalisée via SnapStudio
      `.trim(),
      location: address,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "Europe/Paris",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "Europe/Paris",
      },
      attendees: [
        { email: lead.email, displayName: `${lead.first_name} ${lead.last_name}` },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 24h avant
          { method: "email", minutes: 60 },      // 1h avant
        ],
      },
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Google Calendar API error: ${error}`);
      return null;
    }

    const created = await response.json();
    console.log(`Google Calendar event created: ${created.id}`);
    return created.id;
  } catch (error) {
    console.error("Error creating Google Calendar event:", error);
    return null;
  }
}

// Envoyer une notification Slack
async function sendSlackNotification(
  lead: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  },
  commercial: {
    first_name: string;
    last_name: string;
  },
  startTime: Date,
  address: string,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

  if (!webhookUrl) {
    console.log("SLACK_WEBHOOK_URL not configured, skipping notification");
    return false;
  }

  try {
    // Récupérer les infos de dimensionnement
    const { data: dimensioning } = await supabase
      .from("dimensioning")
      .select("*")
      .eq("lead_id", lead.id)
      .schema("snapstudio")
      .maybeSingle();

    // Récupérer les simulations
    const { data: generations } = await supabase
      .from("generations")
      .select(`
        id,
        assets:asset_id (
          name
        )
      `)
      .eq("lead_id", lead.id)
      .eq("status", "completed")
      .schema("snapstudio");

    // Formater la date en français
    const formattedDate = startTime.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const formattedTime = startTime.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const message = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🔥 Nouveau RDV SnapStudio",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Client :*\n${lead.first_name} ${lead.last_name}`,
            },
            {
              type: "mrkdwn",
              text: `*Assigné à :*\n${commercial.first_name} ${commercial.last_name}`,
            },
          ],
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*📧 Email :*\n${lead.email}`,
            },
            {
              type: "mrkdwn",
              text: `*📞 Téléphone :*\n${lead.phone || "Non renseigné"}`,
            },
          ],
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*📅 Date :*\n${formattedDate}`,
            },
            {
              type: "mrkdwn",
              text: `*🕐 Heure :*\n${formattedTime}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📍 Adresse :*\n${address}`,
          },
        },
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📋 Dimensionnement :*\n• Maison : ${dimensioning?.house_size || "?"}\n• Pièce : ${dimensioning?.room_size || "?"}\n• Multi-pièces : ${dimensioning?.multi_room ? "Oui" : "Non"}\n• Conduit : ${dimensioning?.has_chimney || "?"}\n• Objectif : ${dimensioning?.objective || "?"}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🖼️ Simulations réalisées :* ${generations?.length || 0}\n${generations?.map((g: { assets?: { name?: string } }) => `• ${g.assets?.name || "Inconnu"}`).join("\n") || "Aucune"}`,
          },
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`Slack webhook error: ${response.status}`);
      return false;
    }

    console.log("Slack notification sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending Slack notification:", error);
    return false;
  }
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

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Récupérer le token du lead
    const leadToken = req.headers.get("X-Lead-Token");

    if (!leadToken) {
      return new Response(
        JSON.stringify({
          error: "Token manquant",
          details: "Le header X-Lead-Token est requis",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parser la requête
    const body: BookRequest = await req.json();
    const { slot_datetime, commercial_id, phone, address, notes } = body;

    // Validation
    if (!slot_datetime || !commercial_id) {
      return new Response(
        JSON.stringify({
          error: "Champs requis manquants",
          details: "slot_datetime et commercial_id sont obligatoires",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Récupérer le lead
    // ========================================================================
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
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
          details: "Aucun lead ne correspond à ce token",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Vérifier/mettre à jour téléphone et adresse
    // ========================================================================
    const finalPhone = phone?.trim() || lead.phone;
    const finalAddress = address?.trim() || lead.address;

    if (!finalPhone || !finalAddress) {
      return new Response(
        JSON.stringify({
          error: "Informations manquantes",
          details: "Le téléphone et l'adresse sont requis pour confirmer le RDV",
          missing: {
            phone: !finalPhone,
            address: !finalAddress,
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mettre à jour le lead si nouvelles infos
    if (phone || address) {
      await supabase
        .from("leads")
        .update({
          phone: finalPhone,
          address: finalAddress,
        })
        .eq("id", lead.id)
        .schema("snapstudio");

      console.log(`Lead ${lead.id} updated with phone/address`);
    }

    // ========================================================================
    // Récupérer le commercial
    // ========================================================================
    const { data: commercial, error: commError } = await supabase
      .from("commercials")
      .select("*")
      .eq("id", commercial_id)
      .eq("is_active", true)
      .schema("snapstudio")
      .maybeSingle();

    if (commError) {
      console.error("Error fetching commercial:", commError);
      throw commError;
    }

    if (!commercial) {
      return new Response(
        JSON.stringify({
          error: "Commercial non trouvé",
          details: "Le commercial sélectionné n'est pas disponible",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Calculer les heures de début et fin
    // ========================================================================
    const startTime = new Date(slot_datetime);
    const slotDuration = commercial.slot_duration_minutes || 60;
    const endTime = new Date(startTime.getTime() + slotDuration * 60000);

    // Vérifier que le créneau est dans le futur
    if (startTime <= new Date()) {
      return new Response(
        JSON.stringify({
          error: "Créneau invalide",
          details: "Le créneau sélectionné est déjà passé",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Vérifier que le créneau n'est pas déjà pris
    // ========================================================================
    const { data: existingAppt } = await supabase
      .from("appointments")
      .select("id")
      .eq("commercial_id", commercial_id)
      .gte("start_time", startTime.toISOString())
      .lt("start_time", endTime.toISOString())
      .in("status", ["confirmed", "pending"])
      .schema("snapstudio")
      .maybeSingle();

    if (existingAppt) {
      return new Response(
        JSON.stringify({
          error: "Créneau indisponible",
          details: "Ce créneau vient d'être réservé. Veuillez en choisir un autre.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // Créer le RDV en BDD
    // ========================================================================
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .insert({
        lead_id: lead.id,
        commercial_id: commercial.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        address: finalAddress,
        notes: notes || null,
        status: "confirmed",
      })
      .schema("snapstudio")
      .select("id")
      .single();

    if (apptError) {
      console.error("Error creating appointment:", apptError);
      throw apptError;
    }

    console.log(`Appointment created: ${appointment.id}`);

    // ========================================================================
    // Mettre à jour le statut du lead
    // ========================================================================
    await supabase
      .from("leads")
      .update({ status: "rdv_booked" })
      .eq("id", lead.id)
      .schema("snapstudio");

    // ========================================================================
    // Créer l'événement Google Calendar
    // ========================================================================
    let googleEventId: string | null = null;

    if (commercial.google_refresh_token) {
      const accessToken = await refreshGoogleToken(commercial, supabase);

      if (accessToken) {
        const calendarId = commercial.google_calendar_id || commercial.email;
        googleEventId = await createGoogleCalendarEvent(
          accessToken,
          calendarId,
          {
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            phone: finalPhone,
          },
          startTime,
          endTime,
          finalAddress
        );

        if (googleEventId) {
          await supabase
            .from("appointments")
            .update({ google_event_id: googleEventId })
            .eq("id", appointment.id)
            .schema("snapstudio");
        }
      }
    }

    // ========================================================================
    // Envoyer la notification Slack
    // ========================================================================
    const slackSent = await sendSlackNotification(
      {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: finalPhone,
      },
      {
        first_name: commercial.first_name,
        last_name: commercial.last_name,
      },
      startTime,
      finalAddress,
      supabase
    );

    if (slackSent) {
      await supabase
        .from("appointments")
        .update({ slack_sent_at: new Date().toISOString() })
        .eq("id", appointment.id)
        .schema("snapstudio");
    }

    // ========================================================================
    // Logger l'événement
    // ========================================================================
    await supabase
      .from("events")
      .insert({
        lead_id: lead.id,
        appointment_id: appointment.id,
        event_type: "rdv_booked",
        event_data: {
          commercial_id: commercial.id,
          commercial_name: `${commercial.first_name} ${commercial.last_name}`,
          slot_datetime,
          address: finalAddress,
          google_event_id: googleEventId,
          slack_sent: slackSent,
        },
      })
      .schema("snapstudio");

    // ========================================================================
    // Retourner la réponse
    // ========================================================================
    const response: BookResponse = {
      success: true,
      appointment_id: appointment.id,
      datetime: startTime.toISOString(),
      commercial_name: `${commercial.first_name} ${commercial.last_name}`,
      address: finalAddress,
    };

    console.log(`Appointment booked successfully: ${appointment.id}`);

    return new Response(
      JSON.stringify(response),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
