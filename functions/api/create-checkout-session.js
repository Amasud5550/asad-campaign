/**
 * POST /api/create-checkout-session
 * Cloudflare Pages Function — creates a Stripe Checkout Session for a
 * one-time campaign contribution.
 *
 * SECURITY & COMPLIANCE MODEL (Municipal Elections Act, 1996 — Ontario)
 * All rules are enforced HERE, server-side. Browser checks are UX only.
 *
 *   1. Amount: integer, $5–$1,200 CAD (s.88.9 per-candidate cap).
 *   2. Province must be Ontario; postal code must be a valid Canadian
 *      postal code with an Ontario prefix (K, L, M, N, P).
 *   3. All contributor fields required (record-keeping: name + address).
 *   4. All four attestations must be checked — verified server-side, and
 *      the donor's actual answers are stored in Stripe metadata.
 *   5. CUMULATIVE cap: previous successful contributions from the same
 *      email are summed via the Stripe Search API; the donation is refused
 *      if it would exceed $1,200 total. (Refunded/returned contributions
 *      still appear in this sum — if the campaign refunds an ineligible
 *      contribution, review the donor's true total manually before
 *      accepting more from them.)
 *   6. Kill switch: set DONATIONS_ENABLED=false in Cloudflare to stop
 *      accepting contributions instantly (e.g. outside the campaign
 *      period) without touching code.
 *
 * ENV VARS (Cloudflare Pages → Settings → Variables and secrets):
 *   STRIPE_SECRET_KEY   sk_live_... (sk_test_... while testing)  [Secret]
 *   SITE_URL            https://www.asadmahmood.ca (no trailing slash)
 *   DONATIONS_ENABLED   optional; set to "false" to pause donations
 *
 * NOTE: Stripe's Search API indexes new payments within ~1 minute, so two
 * donations fired in the same minute could momentarily exceed the cap.
 * The campaign's record review remains the legal backstop (s.88.23 —
 * ineligible contributions must be returned or turned over to the clerk).
 */

const MAX_TOTAL = 1200; // dollars, per contributor per candidate
const MIN = 5;
const STRIPE = "https://api.stripe.com/v1";
const ON_POSTAL_PREFIXES = ["K", "L", "M", "N", "P"]; // Ontario FSA first letters

export async function onRequestPost(context) {
  const { request, env } = context;

  if (String(env.DONATIONS_ENABLED).toLowerCase() === "false") {
    return json(
      { error: "The campaign is not accepting contributions at this time. Thank you for your support — please check back soon." },
      503
    );
  }

  if (!env.STRIPE_SECRET_KEY || !env.SITE_URL) {
    return json({ error: "Payment service is not configured yet." }, 503);
  }

  // ---- Parse body defensively -------------------------------------------
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // ---- Server-side validation (the authoritative copy) ------------------
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < MIN || amount > MAX_TOTAL) {
    return json(
      { error: `Contribution must be a whole amount between $${MIN} and $${MAX_TOTAL} CAD.` },
      400
    );
  }

  const clean = (v, max) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const donor = {
    firstName: clean(body.firstName, 60),
    lastName:  clean(body.lastName, 60),
    email:     clean(body.email, 120).toLowerCase(),
    address:   clean(body.address, 120),
    city:      clean(body.city, 60),
    postal:    clean(body.postal, 12).toUpperCase().replace(/\s+/g, " "),
    province:  clean(body.province, 8).toUpperCase(),
  };

  if (donor.province !== "ON") {
    return json(
      { error: "Only individuals who normally live in Ontario may contribute to a municipal campaign." },
      400
    );
  }
  for (const [k, v] of Object.entries(donor)) {
    if (!v) return json({ error: `Missing required field: ${k}.` }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donor.email)) {
    return json({ error: "Please provide a valid email address." }, 400);
  }
  if (!/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(donor.postal)) {
    return json({ error: "Please provide a valid Canadian postal code." }, 400);
  }
  if (!ON_POSTAL_PREFIXES.includes(donor.postal[0])) {
    return json(
      { error: "That postal code is outside Ontario. Only individuals who normally live in Ontario may contribute." },
      400
    );
  }

  // ---- Attestations: must be affirmed, verified server-side --------------
  const att = body.attestations || {};
  const required = ["resident", "ownFunds", "withinLimits", "noTaxReceipt"];
  for (const k of required) {
    if (att[k] !== true) {
      return json(
        { error: "All confirmation checkboxes are required before contributing. Please review and confirm each statement." },
        400
      );
    }
  }

  const auth = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // ---- Cumulative $1,200 enforcement -------------------------------------
  try {
    const query = `metadata['donor_email']:'${donor.email.replace(/'/g, "")}' AND status:'succeeded'`;
    const searchRes = await fetch(
      `${STRIPE}/payment_intents/search?limit=100&query=${encodeURIComponent(query)}`,
      { headers: auth }
    );
    if (searchRes.ok) {
      const found = await searchRes.json();
      const priorCents = (found.data || []).reduce(
        (sum, pi) => sum + (pi.amount_received || 0),
        0
      );
      const priorDollars = Math.round(priorCents / 100);
      if (priorDollars + amount > MAX_TOTAL) {
        const room = Math.max(0, MAX_TOTAL - priorDollars);
        return json(
          {
            error:
              room > 0
                ? `Our records show previous contributions from this email totalling $${priorDollars}. ` +
                  `Ontario's Municipal Elections Act caps total contributions to one candidate at $${MAX_TOTAL}, ` +
                  `so the most you can still contribute is $${room}.`
                : `Our records show this email has already contributed the legal maximum of $${MAX_TOTAL} ` +
                  `to this candidate under Ontario's Municipal Elections Act. Thank you for your generous support — ` +
                  `consider volunteering instead!`,
          },
          400
        );
      }
    }
    // If Stripe Search is unavailable we still proceed — the per-transaction
    // cap holds, and the campaign's record review remains the legal backstop.
  } catch {
    /* non-fatal: fall through to per-transaction cap */
  }

  // ---- Create the Checkout Session ---------------------------------------
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${env.SITE_URL}/success.html`);
  params.set("cancel_url", `${env.SITE_URL}/donate.html`);
  params.set("customer_email", donor.email);
  params.set("submit_type", "donate");
  params.set("locale", "en");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "cad");
  params.set("line_items[0][price_data][unit_amount]", String(amount * 100));
  params.set(
    "line_items[0][price_data][product_data][name]",
    "Contribution — Campaign of Asad Mahmood for Thorold City Council"
  );

  // Always email the donor a Stripe receipt (the campaign's own official
  // contribution receipt under the MEA is issued separately from records).
  params.set("payment_intent_data[receipt_email]", donor.email);
  // Card-statement label so donors recognize the charge (fewer disputes).
  params.set("payment_intent_data[statement_descriptor_suffix]", "THOROLD 2026");

  // MEA record-keeping: contributor name + address + attestations stored on
  // both the session and the payment intent (the payment-intent copy also
  // powers the cumulative-limit search above).
  const meta = {
    donor_email: donor.email,
    donor_name: `${donor.firstName} ${donor.lastName}`,
    donor_address: `${donor.address}, ${donor.city}, ON ${donor.postal}`,
    attested_on_resident: String(att.resident === true),
    attested_own_funds: String(att.ownFunds === true),
    attested_within_limits: String(att.withinLimits === true),
    attested_no_tax_receipt: String(att.noTaxReceipt === true),
  };
  for (const [k, v] of Object.entries(meta)) {
    params.set(`metadata[${k}]`, v);
    params.set(`payment_intent_data[metadata][${k}]`, v);
  }

  const stripeRes = await fetch(`${STRIPE}/checkout/sessions`, {
    method: "POST",
    headers: auth,
    body: params.toString(),
  });

  if (!stripeRes.ok) {
    return json(
      { error: "Could not start the secure payment session. Please try again shortly." },
      502
    );
  }

  const session = await stripeRes.json();
  return json({ url: session.url }, 200);
}

/* Reject anything that isn't a POST.
   (The temporary GET diagnostic has been removed for launch.) */
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "Method not allowed." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
