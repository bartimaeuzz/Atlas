"use server";

import { requireCapability } from "@/lib/permissions/requireCapability";

/** US address verification via Smarty (2026-08-24, Oliver: "can we get
 * address verification"). Provider decision recorded in the plan file:
 * Smarty over USPS's own portal (CASS-certified data, terms that cover
 * non-shipping use, free tier far above a restaurant's volume) and over
 * Google Places (paid, not USPS-standardized).
 *
 * Verify, never block: this action only ANSWERS; the form decides
 * nothing on its own and Save works regardless. Gated by
 * PEOPLE_HR_SENSITIVE — the address fields only render for holders of
 * that tier, and the server re-checks rather than trusting that.
 *
 * Credentials are SMARTY_AUTH_ID / SMARTY_AUTH_TOKEN in Vercel env
 * (Oliver set them himself, 2026-08-24). Missing env — e.g. a local dev
 * run — degrades to a plain "not configured" answer, not a crash. */

export interface AddressVerifyResult {
  error: string | null;
  status?: "verified" | "corrected" | "not_found";
  /** Smarty's standardized form, present for verified/corrected. */
  standardized?: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

export async function verifyUsAddress(input: {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}): Promise<AddressVerifyResult> {
  try {
    await requireCapability("PEOPLE_HR_SENSITIVE");

    const authId = process.env.SMARTY_AUTH_ID;
    const authToken = process.env.SMARTY_AUTH_TOKEN;
    if (!authId || !authToken) {
      return { error: "Address verification isn't configured on this server." };
    }
    if (!input.addressLine1.trim()) {
      return { error: "Enter at least Address line 1 before verifying." };
    }

    const params = new URLSearchParams({
      "auth-id": authId,
      "auth-token": authToken,
      street: input.addressLine1.trim(),
      candidates: "1",
    });
    if (input.addressLine2.trim()) params.set("street2", input.addressLine2.trim());
    if (input.city.trim()) params.set("city", input.city.trim());
    if (input.state.trim()) params.set("state", input.state.trim());
    if (input.zipCode.trim()) params.set("zipcode", input.zipCode.trim());

    const res = await fetch(`https://us-street.api.smarty.com/street-address?${params}`, {
      // Never cache: a verification answer must reflect the query made now.
      cache: "no-store",
    });
    if (!res.ok) {
      return { error: `Verification service answered ${res.status} — try again in a moment.` };
    }
    const candidates = (await res.json()) as Array<{
      delivery_line_1?: string;
      delivery_line_2?: string;
      components?: {
        city_name?: string;
        state_abbreviation?: string;
        zipcode?: string;
        plus4_code?: string;
      };
      analysis?: { dpv_match_code?: string };
    }>;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { error: null, status: "not_found" };
    }

    const c = candidates[0];
    const standardized = {
      addressLine1: c.delivery_line_1 ?? input.addressLine1.trim(),
      addressLine2: c.delivery_line_2 ?? "",
      city: c.components?.city_name ?? input.city.trim(),
      state: c.components?.state_abbreviation ?? input.state.trim(),
      zipCode: c.components?.zipcode
        ? c.components.plus4_code
          ? `${c.components.zipcode}-${c.components.plus4_code}`
          : c.components.zipcode
        : input.zipCode.trim(),
    };

    const sameAsTyped =
      standardized.addressLine1.toLowerCase() === input.addressLine1.trim().toLowerCase() &&
      standardized.city.toLowerCase() === input.city.trim().toLowerCase() &&
      standardized.state.toLowerCase() === input.state.trim().toLowerCase() &&
      standardized.zipCode === input.zipCode.trim();

    return { error: null, status: sameAsTyped ? "verified" : "corrected", standardized };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
