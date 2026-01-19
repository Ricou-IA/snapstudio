// ============================================================================
// SNAPSTUDIO V2 - Edge Function /calendar/slots
// Récupération des créneaux disponibles pour prise de RDV
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // À restreindre en prod: "https://mayer-energie.fr"
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// Configuration des créneaux par défaut
const DEFAULT_SLOT_CONFIG = {
  workingDays: [1, 2, 3, 4, 5], // Lundi à Vendredi (0 = Dimanche)
  startHour: 13,
  startMinute: 30,
  endHour: 18,
  endMinute: 0,
  slotDurationMinutes: 60,
  bufferMinutes: 30,
};

// Types
interface Commercial {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  google_calendar_id: string | null;
  google_refresh_token: string | null;
  google_access_token: string | null;
  google_token_expires_at: string | null;
  working_days: string[] | null;
  working_hours_start: string | null;
  working_hours_end: string | null;
  slot_duration_minutes: number | null;
  buffer_minutes: number | null;
}

interface BusySlot {
  start: Date;
  end: Date;
}

interface AvailableSlot {
  datetime: string;
  commercial_id: string;
  commercial_name: string;
}

interface SlotsResponse {
  slots: AvailableSlot[];
  config: {
    slot_duration_minutes: number;
    working_hours: string;
  };
  date_range: {
    start: string;
    end: string;
  };
}

// Convertir les jours de la semaine (MO, TU, etc.) en numéros (1, 2, etc.)
function dayStringToNumber(day: string): number {
  const mapping: Record<string, number> = {
    "SU": 0, "MO": 1, "TU": 2, "WE": 3, "TH": 4, "FR": 5, "SA": 6,
  };
  return mapping[day.toUpperCase()] ?? -1;
}

// Parser l'heure au format "HH:MM:SS" ou "HH:MM"
function parseTime(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(":");
  return {
    hour: parseInt(parts[0], 10),
    minute: parseInt(parts[1], 10),
  };
}

// Générer les créneaux d'une journée
function generateDaySlots(
  day: Date,
  config: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    slotDurationMinutes: number;
    bufferMinutes: number;
  }
): Date[] {
  const slots: Date[] = [];

  const current = new Date(day);
  current.setHours(config.startHour, config.startMinute, 0, 0);

  const dayEnd = new Date(day);
  dayEnd.setHours(config.endHour, config.endMinute, 0, 0);

  while (current.getTime() + config.slotDurationMinutes * 60000 <= dayEnd.getTime()) {
    slots.push(new Date(current));
    // Avancer de la durée du créneau + buffer
    current.setTime(current.getTime() + (config.slotDurationMinutes + config.bufferMinutes) * 60000);
  }

  return slots;
}

// Vérifier si un créneau chevauche une période occupée
function isSlotBusy(
  slotStart: Date,
  slotDurationMinutes: number,
  bufferMinutes: number,
  busySlots: BusySlot[]
): boolean {
  const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60000);

  for (const busy of busySlots) {
    // Ajouter le buffer autour de la période occupée
    const busyStart = new Date(busy.start.getTime() - bufferMinutes * 60000);
    const busyEnd = new Date(busy.end.getTime() + bufferMinutes * 60000);

    // Vérifier le chevauchement
    if (slotStart < busyEnd && slotEnd > busyStart) {
      return true;
    }
  }

  return false;
}

// Rafraîchir le token Google OAuth
async function refreshGoogleToken(
  commercial: Commercial,
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
    console.log(`No refresh token for commercial ${commercial.email}`);
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
      console.error(`Failed to refresh Google token for ${commercial.email}: ${response.status}`);
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

    console.log(`Google token refreshed for ${commercial.email}`);
    return data.access_token;
  } catch (error) {
    console.error(`Error refreshing Google token for ${commercial.email}:`, error);
    return null;
  }
}

// Récupérer les périodes occupées depuis Google Calendar
async function getGoogleCalendarBusy(
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<BusySlot[]> {
  try {
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: `${startDate}T00:00:00Z`,
        timeMax: `${endDate}T23:59:59Z`,
        items: [{ id: calendarId }],
      }),
    });

    if (!response.ok) {
      console.error(`Google Calendar API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const busy = data.calendars?.[calendarId]?.busy || [];

    return busy.map((b: { start: string; end: string }) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));
  } catch (error) {
    console.error("Error fetching Google Calendar busy times:", error);
    return [];
  }
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

    // Paramètres de date (défaut: aujourd'hui + 14 jours)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const defaultEndDate = new Date(today);
    defaultEndDate.setDate(defaultEndDate.getDate() + 14);

    const startDateParam = url.searchParams.get("start_date");
    const endDateParam = url.searchParams.get("end_date");

    const startDate = startDateParam || today.toISOString().split("T")[0];
    const endDate = endDateParam || defaultEndDate.toISOString().split("T")[0];

    console.log(`Fetching slots from ${startDate} to ${endDate}`);

    // ========================================================================
    // Récupérer tous les commerciaux actifs
    // ========================================================================
    const { data: commercials, error: commError } = await supabase
      .from("commercials")
      .select("*")
      .eq("is_active", true)
      .schema("snapstudio");

    if (commError) {
      console.error("Error fetching commercials:", commError);
      throw commError;
    }

    if (!commercials || commercials.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Aucun commercial disponible",
          message: "Veuillez nous contacter par téléphone pour prendre rendez-vous.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${commercials.length} active commercials`);

    // ========================================================================
    // Récupérer les RDV existants en BDD
    // ========================================================================
    const { data: existingAppointments, error: apptError } = await supabase
      .from("appointments")
      .select("start_time, end_time, commercial_id")
      .gte("start_time", `${startDate}T00:00:00`)
      .lte("start_time", `${endDate}T23:59:59`)
      .in("status", ["confirmed", "pending"])
      .schema("snapstudio");

    if (apptError) {
      console.error("Error fetching appointments:", apptError);
      throw apptError;
    }

    console.log(`Found ${existingAppointments?.length || 0} existing appointments`);

    // ========================================================================
    // Construire les périodes occupées par commercial
    // ========================================================================
    const busySlotsByCommercial: Record<string, BusySlot[]> = {};

    for (const commercial of commercials) {
      busySlotsByCommercial[commercial.id] = [];

      // Ajouter les RDV existants de la BDD
      existingAppointments
        ?.filter((a) => a.commercial_id === commercial.id)
        .forEach((a) => {
          busySlotsByCommercial[commercial.id].push({
            start: new Date(a.start_time),
            end: new Date(a.end_time),
          });
        });

      // Si le commercial a un token Google, récupérer son calendrier
      if (commercial.google_refresh_token) {
        try {
          const accessToken = await refreshGoogleToken(commercial, supabase);

          if (accessToken) {
            const calendarId = commercial.google_calendar_id || commercial.email;
            const googleBusy = await getGoogleCalendarBusy(
              accessToken,
              calendarId,
              startDate,
              endDate
            );
            busySlotsByCommercial[commercial.id].push(...googleBusy);
            console.log(`Fetched ${googleBusy.length} busy slots from Google Calendar for ${commercial.email}`);
          }
        } catch (e) {
          console.error(`Error fetching calendar for ${commercial.email}:`, e);
        }
      }
    }

    // ========================================================================
    // Générer les créneaux disponibles
    // ========================================================================
    const availableSlots: AvailableSlot[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Pour chaque jour de la période
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dayOfWeek = day.getDay();

      // Pour chaque commercial
      for (const commercial of commercials) {
        // Déterminer les jours de travail du commercial
        const workingDays = commercial.working_days
          ? commercial.working_days.map(dayStringToNumber)
          : DEFAULT_SLOT_CONFIG.workingDays;

        // Vérifier si c'est un jour de travail
        if (!workingDays.includes(dayOfWeek)) {
          continue;
        }

        // Déterminer les horaires du commercial
        const startTime = commercial.working_hours_start
          ? parseTime(commercial.working_hours_start)
          : { hour: DEFAULT_SLOT_CONFIG.startHour, minute: DEFAULT_SLOT_CONFIG.startMinute };

        const endTime = commercial.working_hours_end
          ? parseTime(commercial.working_hours_end)
          : { hour: DEFAULT_SLOT_CONFIG.endHour, minute: DEFAULT_SLOT_CONFIG.endMinute };

        const slotDuration = commercial.slot_duration_minutes || DEFAULT_SLOT_CONFIG.slotDurationMinutes;
        const buffer = commercial.buffer_minutes || DEFAULT_SLOT_CONFIG.bufferMinutes;

        // Générer les créneaux de la journée
        const daySlots = generateDaySlots(new Date(day), {
          startHour: startTime.hour,
          startMinute: startTime.minute,
          endHour: endTime.hour,
          endMinute: endTime.minute,
          slotDurationMinutes: slotDuration,
          bufferMinutes: buffer,
        });

        // Filtrer les créneaux occupés
        for (const slotStart of daySlots) {
          // Ignorer les créneaux passés
          if (slotStart <= new Date()) {
            continue;
          }

          const isBusy = isSlotBusy(
            slotStart,
            slotDuration,
            buffer,
            busySlotsByCommercial[commercial.id]
          );

          if (!isBusy) {
            availableSlots.push({
              datetime: slotStart.toISOString(),
              commercial_id: commercial.id,
              commercial_name: `${commercial.first_name} ${commercial.last_name}`,
            });
          }
        }
      }
    }

    // Trier par date
    availableSlots.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    console.log(`Generated ${availableSlots.length} available slots`);

    // ========================================================================
    // Construire la réponse
    // ========================================================================
    const response: SlotsResponse = {
      slots: availableSlots,
      config: {
        slot_duration_minutes: DEFAULT_SLOT_CONFIG.slotDurationMinutes,
        working_hours: `${DEFAULT_SLOT_CONFIG.startHour}:${DEFAULT_SLOT_CONFIG.startMinute.toString().padStart(2, "0")} - ${DEFAULT_SLOT_CONFIG.endHour}:${DEFAULT_SLOT_CONFIG.endMinute.toString().padStart(2, "0")}`,
      },
      date_range: {
        start: startDate,
        end: endDate,
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
        details: error instanceof Error ? error.message : "Erreur inconnue",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
