"use client";

import { useActionState, useState } from "react";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import {
  runWeatherBackfill,
  saveWeatherLocation,
  searchWeatherPlaces,
  type PlaceSearchState,
  type WeatherActionState,
} from "@/lib/actions/weather";

/** "Where is the restaurant" plus the one-press backfill (2026-09-05).
 *
 * A SEARCH-AND-PICK, never a typed latitude. The person setting this up runs
 * a restaurant on a shared terminal; asking them for coordinates would be
 * asking them to be wrong in a way nothing downstream could detect — the app
 * would happily record the weather in the Atlantic for a year. Picking off a
 * list cannot produce a coordinate that is not a real US town.
 *
 * Its own component and its own submit, not part of the big Settings form:
 * searching, picking and backfilling are three separate actions, and a page
 * whose single Save button sometimes means "search" is the error-prone shape
 * this app has already had to unpick once.
 */
const searchInitial: PlaceSearchState = { error: null, results: [], query: "" };
const saveInitial: WeatherActionState = { error: null, saved: false };

export function WeatherLocationSection({
  location,
  missingCount,
  canEdit,
}: {
  location: { label: string; updatedAt: string } | null;
  missingCount: number;
  canEdit: boolean;
}) {
  const [search, searchAction, searching] = useActionState(searchWeatherPlaces, searchInitial);
  const [save, saveAction, saving] = useActionState(saveWeatherLocation, saveInitial);
  const [backfill, backfillAction, backfilling] = useActionState(runWeatherBackfill, saveInitial);
  const [changing, setChanging] = useState(false);
  // `true`, not `!!search.error`: React 19 resets a form's uncontrolled
  // fields once its action completes, success included, so without this the
  // search box empties the moment results appear and refining "Brookl" into
  // "Brooklyn" means retyping the whole thing.
  const searchFormRef = useKeepValuesOnError(searching, true);

  // Close the picker once a save lands, by adjusting state during render —
  // React's own documented alternative to an effect that calls setState, and
  // the reason this is not a useEffect (react-hooks/set-state-in-effect).
  // Keyed on savedAt rather than the boolean: two saves in a row both leave
  // `saved` true, and a boolean would only close the picker the first time.
  const [lastSavedAt, setLastSavedAt] = useState(save.savedAt);
  if (save.savedAt !== lastSavedAt) {
    setLastSavedAt(save.savedAt);
    setChanging(false);
  }

  const showPicker = !location || changing;

  return (
    <fieldset className="border rounded-[var(--radius-md)] p-4">
      <legend className="text-sm font-medium px-1">Weather</legend>
      <p className="text-xs text-[var(--ink-500)] mb-3">
        The town Mohom checks the weather for. It shows the week ahead on your home page and the
        schedule, and records what each lunch and dinner actually got when you close the shift — so
        a slow day can say why later.
      </p>

      {location && (
        <p className="text-sm text-[var(--ink-900)] mb-3">
          Currently <span className="font-medium">{location.label}</span>
        </p>
      )}
      {save.saved && <p className="text-sm text-[var(--success-700)] mb-3">Location saved.</p>}

      {canEdit && !showPicker && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setChanging(true)}>
          {location ? "Change town" : "Set the town"}
        </Button>
      )}

      {canEdit && showPicker && (
        <>
          {/* Two sibling forms, never nested — one searches, one saves. */}
          <form ref={searchFormRef} action={searchAction} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[12rem]">
              <TextInput
                name="query"
                label="Town or city"
                defaultValue={search.query}
                placeholder="Brooklyn"
                className="min-h-9 py-1.5"
              />
            </div>
            <Button type="submit" size="sm" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </Button>
          </form>

          {search.error && (
            <p className="mt-2 text-sm text-[var(--danger-700)]">{search.error}</p>
          )}

          {search.results.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {search.results.map((place) => (
                <li key={`${place.latitude},${place.longitude}`}>
                  <form action={saveAction}>
                    <input type="hidden" name="label" value={place.label} />
                    <input type="hidden" name="latitude" value={place.latitude} />
                    <input type="hidden" name="longitude" value={place.longitude} />
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 text-left text-sm text-[var(--ink-900)] outline-offset-2 hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-60"
                    >
                      {place.label}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {save.error && <p className="mt-2 text-sm text-[var(--danger-700)]">{save.error}</p>}
        </>
      )}

      {canEdit && location && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          {missingCount > 0 ? (
            <>
              <p className="text-xs text-[var(--ink-500)] mb-2">
                {missingCount} closed {missingCount === 1 ? "service has" : "services have"} no weather
                recorded — days you closed before this was set up. Filling them in is safe: it only
                adds what is missing and never changes a service that already has weather.
              </p>
              <form action={backfillAction}>
                <Button type="submit" variant="secondary" size="sm" disabled={backfilling}>
                  {backfilling ? "Filling in…" : "Fill in past weather"}
                </Button>
              </form>
            </>
          ) : (
            <p className="text-xs text-[var(--ink-500)]">
              Every closed service has its weather recorded.
            </p>
          )}
          {backfill.error && (
            <p className="mt-2 text-sm text-[var(--danger-700)]">{backfill.error}</p>
          )}
          {backfill.saved && backfill.filledCount != null && (
            <p className="mt-2 text-sm text-[var(--success-700)]">
              {backfill.filledCount === 0
                ? "Nothing left to fill in."
                : `Filled in ${backfill.filledCount} ${backfill.filledCount === 1 ? "service" : "services"}.`}
            </p>
          )}
          {/* Said out loud rather than left as a count that never reaches
              zero: some days genuinely have no weather to fetch, and a
              manager pressing the button a fourth time deserves to know
              why the number is stuck. */}
          {backfill.saved && !!backfill.unfilledCount && (
            <p className="mt-1 text-sm text-[var(--ink-500)]">
              {backfill.unfilledCount} {backfill.unfilledCount === 1 ? "service" : "services"} had no
              weather available for {backfill.unfilledCount === 1 ? "its" : "their"} date. Those will
              stay blank.
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--ink-500)]">Weather data by Open-Meteo.com.</p>
    </fieldset>
  );
}
