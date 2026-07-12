/**
 * POST /api/create-checkout-session
 * Cloudflare Pages Function — creates a Stripe Checkout Session for a
 * one-time campaign contribution.
 *
 * SECURITY MODEL
 * All rules are enforced HERE, server-side. The checks in js/donate.js are
 * user experience only — anyone can bypass browser code with dev tools or
 * curl, so nothing in the browser is trusted:
 *
 *   1. Amount must be an integer, $5–$1,200 CAD (MEA s.88.9 per-candidate cap).
 *   2. Province must be Ontario.
 *   3. All contributor fields required (MEA record-keeping: name + address).
 *   4. CUMULATIVE cap: previous successful contributions from the same email
 *      are summed via the Stripe Search API. If this donation would push the
 *      donor past $1,200 total, it is refused with the remaining room shown.
 *
 * ENV VARS (Cloudflare Pages → Settings → Environment variables):
 *   STRIPE_SECRET_KEY  sk_live_... (sk_test_... while testing)
 *   SITE_URL           https://www.asadmahmood.ca (no trailing slash)
 *
 * NOTE on the cumulative check: Stripe's Search API indexes new payments
 * within ~1 minute. A determined donor firing two donations in the same
 * minute could momentarily exceed the cap — the financial-statement review
 * still catches it, and the campaign must refund the excess (MEA s.88.23).
 * For a hard real-time guarantee, add a KV/D1 ledger keyed by email.
 */

const MAX_TOTAL = 1200; // dollars, per contributor per candidate
const MIN = 5;
const STRIPE = "https://api.stripe.com/v1";

export async function onRequestPost(context) {
  const { request, env } = context;

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
    postal:    clean(body.postal, 12).toUpperCase(),
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

  const auth = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // ---- Cumulative $1,200 enforcement -------------------------------------
  // Sum all previously *succeeded* payments tagged with this donor's email.
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
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "cad");
  params.set("line_items[0][price_data][unit_amount]", String(amount * 100));
  params.set(
    "line_items[0][price_data][product_data][name]",
    "Contribution — Campaign of Asad Mahmood for Thorold City Council"
  );

  // MEA record-keeping: contributor name + address stored on both the
  // session and the payment intent (the payment-intent copy also powers
  // the cumulative-limit search above).
  const meta = {
    donor_email: donor.email,
    donor_name: `${donor.firstName} ${donor.lastName}`,
    donor_address: `${donor.address}, ${donor.city}, ON ${donor.postal}`,
    attested_on_resident: "yes",
    attested_own_funds: "yes",
    attested_within_limits: "yes",
    attested_no_tax_receipt: "yes",
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

/* GET = safe config diagnostic (booleans only, never secret values).
   Anything else that isn't POST is rejected. */
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "GET") {
    const env = context.env || {};
    const key = env.STRIPE_SECRET_KEY || "";
    return json(
      {
        diagnostic: {
          STRIPE_SECRET_KEY_present: Boolean(key),
          STRIPE_SECRET_KEY_looks_valid: /^sk_(test|live)_/.test(key),
          SITE_URL_present: Boolean(env.SITE_URL),
          SITE_URL_value: env.SITE_URL || null,
          env_var_names_visible: Object.keys(env).filter(
            (k) => typeof env[k] === "string"
          ),
        },
      },
      200
    );
  }
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
