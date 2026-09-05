"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weatherLocations } from "@/db/schema";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { logActivity } from "@/lib/activityLog/log";
import { backfillWeather } from "@/lib/weather/captureShiftWeather";
import { loadShiftsMissingWeather } from "@/lib/weather/loadWeather";
import { searchPlaces, type GeocodeResult } from "@/lib/weather/openMeteo";

const RESTAURANT_ID = 1;

/** Every action here returns its error rather than throwing it. A thrown
 * server action reaches production as "An error occurred in the Server
 * Components render" with the message stripped, which on this feature would
 * turn "type more than one letter" into a blank screen — the redaction
 * lesson from 2026-09-04. */
export interface WeatherActionState {
  error: string | null;
  saved: boolean;
  savedAt?: number;
  /** How many day-services the backfill wrote, for its result line. */
  filledCount?: number;
  /** How many it tried and could not fill — the weather service has no data
   * for those days. Reported plainly rather than left to show up as a count
   * that never reaches zero however many times the button is pressed. */
  unfilledCount?: number;
}

export interface PlaceSearchState {
  error: string | null;
  results: GeocodeResult[];
  query: string;
}

/** What a caught error is allowed to say on screen. An authorization refusal
 * is worth showing verbatim — it tells the manager to fetch someone who can.
 * Anything else becomes the caller's plain sentence, because the alternative
 * is raw `SQLITE_CONSTRAINT` text on a manager's screen, which is exactly the
 * blocker the invoice-delete audit found a day ago. */
function messageFor(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  return raw.startsWith("Not authorized") || raw.startsWith("You don't have") ? raw : fallback;
}

/** Place lookup for the Settings picker. Gated the same as saving: the list
 * itself is harmless, but an ungated action is an ungated action, and four
 * export routes served payroll to anonymous requests for four days on
 * exactly that reasoning. */
export async function searchWeatherPlaces(
  _prevState: PlaceSearchState,
  formData: FormData
): Promise<PlaceSearchState> {
  const query = String(formData.get("query") ?? "").trim();
  try {
    await requireCapability("EDIT_SETTINGS");
    if (query.length < 2) {
      return { error: "Type at least two letters of the town or city.", results: [], query };
    }
    const results = await searchPlaces(query);
    if (results.length === 0) {
      return { error: `No US town or city found for "${query}". Try the nearest larger town.`, results: [], query };
    }
    return { error: null, results, query };
  } catch (error) {
    return {
      error: messageFor(error, "Could not reach the weather service just now. Try again."),
      results: [],
      query,
    };
  }
}

export async function saveWeatherLocation(
  _prevState: WeatherActionState,
  formData: FormData
): Promise<WeatherActionState> {
  try {
    const session = await requireCapability("EDIT_SETTINGS");

    const label = String(formData.get("label") ?? "").trim();
    const latitude = Number(formData.get("latitude"));
    const longitude = Number(formData.get("longitude"));
    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { error: "Pick a place from the list before saving.", saved: false };
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return { error: "That place came back with coordinates we can't use. Pick another.", saved: false };
    }

    const [existing] = await db
      .select()
      .from(weatherLocations)
      .where(eq(weatherLocations.restaurantId, RESTAURANT_ID));

    const values = {
      restaurantId: RESTAURANT_ID,
      label,
      latitude,
      longitude,
      updatedAt: new Date().toISOString(),
      updatedByEmployeeId: session.id,
    };

    if (existing) {
      await db.update(weatherLocations).set(values).where(eq(weatherLocations.id, existing.id));
    } else {
      await db.insert(weatherLocations).values(values);
    }

    await logActivity({
      actorEmployeeId: session.id,
      type: "settings.weather_location_changed",
      entityType: "restaurant_settings",
      entityId: String(RESTAURANT_ID),
      summary: existing
        ? `Weather location changed from ${existing.label} to ${label}.`
        : `Weather location set to ${label}.`,
      detail: { from: existing?.label ?? null, to: label, latitude, longitude },
    });

    revalidatePath("/settings");
    revalidatePath("/");
    return { error: null, saved: true, savedAt: Date.now() };
  } catch (error) {
    return { error: messageFor(error, "Could not save the location. Try again."), saved: false };
  }
}

/** Fills in the weather for every closed shift that has none. Bounded by
 * what is actually missing, so pressing it twice does nothing the second
 * time — the insert ignores conflicts and the query finds nothing left.
 *
 * Takes no arguments at all. useActionState hands an action (state,
 * payload); this one reads neither, because what to fill in is decided
 * entirely by what is missing from the database, and a shorter signature is
 * one fewer unused parameter to explain. */
export async function runWeatherBackfill(): Promise<WeatherActionState> {
  try {
    const session = await requireCapability("EDIT_SETTINGS");

    const missing = await loadShiftsMissingWeather();
    if (missing.length === 0) {
      return { error: null, saved: true, savedAt: Date.now(), filledCount: 0 };
    }

    const { attempted, written } = await backfillWeather(missing);
    const unfilled = attempted - written;

    await logActivity({
      actorEmployeeId: session.id,
      type: "weather.backfilled",
      entityType: "restaurant_settings",
      entityId: String(RESTAURANT_ID),
      summary: `Filled in past weather for ${written} closed ${written === 1 ? "service" : "services"}.`,
      detail: { requested: attempted, written, unfilled },
    });

    revalidatePath("/settings");
    revalidatePath("/analytics");
    return {
      error: null,
      saved: true,
      savedAt: Date.now(),
      filledCount: written,
      unfilledCount: unfilled,
    };
  } catch (error) {
    // "Nothing was changed" is deliberately NOT said here. The backfill
    // writes in chunks, so a failure part-way through leaves the earlier
    // chunks written — telling the manager nothing changed would be a
    // comfortable lie, and pressing the button again is safe either way.
    return {
      error: messageFor(
        error,
        "Could not finish filling in past weather. Anything already filled in has been kept — press the button again to carry on."
      ),
      saved: false,
    };
  }
}
