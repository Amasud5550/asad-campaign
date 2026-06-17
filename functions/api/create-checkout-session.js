/**
 * POST /api/create-checkout-session
 * Cloudflare Pages Function — creates a Stripe Checkout Session for a one-time
 * municipal campaign contribution.
 *
 * Required environment variable (set in Cloudflare Pages → Settings → Environment variables):
 *   STRIPE_SECRET_KEY   e.g. sk_live_xxx (use sk_test_xxx while testing)
 * Optional:
 *   SITE_URL            e.g. https://voteasad.ca  (used for success/cancel redirects)
 *
 * No npm packages required — talks to the Stripe REST API directly with fetch.
 */

const MAX_CAD = 1200; // Municipal Elections Act: max to one candidate
const MIN_CAD = 5;

export async function onRequestPost(context) {
  const { request, env } = context;

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" }
    });

  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Payment is not configured yet. Please contact the campaign." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const amount = Math.round(Number(body.amount));
  const first = (body.firstName || "").trim();
  const last = (body.lastName || "").trim();
  const email = (body.email || "").trim();
  const address = (body.address || "").trim();
  const city = (body.city || "").trim();
  const postal = (body.postal || "").trim();
  const province = (body.province || "").trim().toUpperCase();

  // ----- Server-side compliance checks (do not trust the browser) -----
  if (!amount || amount < MIN_CAD) return json({ error: `Minimum contribution is $${MIN_CAD}.` }, 400);
  if (amount > MAX_CAD) return json({ error: `Maximum contribution to one candidate is $${MAX_CAD}.` }, 400);
  if (province !== "ON") return json({ error: "Only Ontario residents may contribute." }, 400);
  if (!first || !last || !email || !address || !city || !postal) {
    return json({ error: "Please complete all contributor fields." }, 400);
  }

  const origin = env.SITE_URL || new URL(request.url).origin;

  // Stripe expects application/x-www-form-urlencoded
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${origin}/donate.html`);
  params.append("customer_email", email);
  params.append("submit_type", "donate");

  params.append("line_items[0][quantity]", "1");
  params.append("line_items[0][price_data][currency]", "cad");
  params.append("line_items[0][price_data][unit_amount]", String(amount * 100)); // cents
  params.append("line_items[0][price_data][product_data][name]", "Contribution — Asad Mahmood for Thorold City Council");

  // Records required for campaign financial filing — stored on the session.
  const contributor = `${first} ${last}`;
  const fullAddress = `${address}, ${city}, ON ${postal}`;
  params.append("metadata[contributor_name]", contributor);
  params.append("metadata[contributor_address]", fullAddress);
  params.append("metadata[contributor_email]", email);
  params.append("metadata[purpose]", "Municipal campaign contribution");
  params.append("payment_intent_data[metadata][contributor_name]", contributor);
  params.append("payment_intent_data[metadata][contributor_address]", fullAddress);
  params.append("payment_intent_data[description]", `Contribution from ${contributor}`);

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const data = await resp.json();

  if (!resp.ok) {
    return json({ error: (data.error && data.error.message) || "Stripe error." }, 502);
  }

  return json({ url: data.url });
}

// Reject non-POST methods politely.
export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  return onRequestPost(context);
}
