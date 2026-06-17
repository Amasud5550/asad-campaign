# Asad Mahmood for Thorold City Council — campaign website

A fast, accessible, non-partisan static site with a compliant Stripe donation flow.
Built to deploy free on **Cloudflare Pages**, with one serverless function for Stripe.

---

## What's in here

```
index.html              Home (hero, meet, priorities, inclusion, community voices, volunteer, contact)
donate.html             Donation page with Ontario compliance attestations
success.html            Thank-you page after a contribution
privacy.html            Privacy statement
accessibility.html      Accessibility statement (WCAG 2.1 AA / AODA)
css/styles.css          All styling (teal / charcoal / gold; canal-lock motif)
js/main.js              Mobile nav + volunteer/community-voices form handling
js/donate.js            Donation validation + Stripe handoff
functions/api/create-checkout-session.js   Cloudflare Pages Function → creates a Stripe Checkout Session
_headers                Basic security headers for Cloudflare Pages
```

---

## Before you go live — fill these in

Search the files for square brackets and replace them:

- `[campaign email]`, `[campaign phone]`, `[campaign mailing address ...]`
- `[facebook url]`, `[instagram url]` (or delete the social buttons)
- Add real photos: replace the `.hero__photo` / `.portrait` placeholders with
  `<img src="images/asad.jpg" alt="Asad Mahmood">` and create an `images/` folder.
- In **js/main.js**, set `FORM_ENDPOINT` so the volunteer/contact forms email you
  (easiest: a free [Formspree](https://formspree.io) form — paste its URL).
- Tighten the biography in `index.html` (“Meet Asad”) with **accurate, checkable** details.

---

## Deploy (free) — Cloudflare Pages

1. Put this folder in a GitHub repository.
2. In Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, pick the repo.
3. Build settings: **Framework preset: None**, **Build command: (leave blank)**,
   **Build output directory: `/`** (the repo root, since this is plain HTML).
4. Deploy. Cloudflare gives you a free `*.pages.dev` URL with HTTPS.
5. Add your custom domain (e.g. `asadmahmood.ca`) under.

The `functions/` folder is picked up automatically — `/api/create-checkout-session`
becomes a live endpoint. No separate server needed.

---

## Stripe setup (donations)

1. Create a Stripe account and activate it (you'll provide the campaign's bank account —
   this must be the **dedicated campaign account**, see compliance below).
2. Get your **Secret key** (starts with `sk_live_…`; use `sk_test_…` while testing).
3. In Cloudflare → your Pages project → **Settings → Environment variables**, add:
   - `STRIPE_SECRET_KEY` = your secret key
   - `SITE_URL` = `https://asadmahmood.ca` (your final domain)
4. Redeploy. Test with Stripe test mode first (card `4242 4242 4242 4242`).

**Why a function instead of pure front-end?** Stripe payments require a secret key that
must never live in browser code. The Cloudflare Pages Function keeps it server-side and
also re-checks the $1,200 limit so the rule can't be bypassed from the browser.

**Simpler no-code alternative:** Stripe **Payment Links** (one link per amount, embedded
as buttons). Easier, but it won't capture the contributor address/attestations as cleanly —
so the function approach here is better for keeping compliant records.

> **Recurring/monthly donations were intentionally left off.** A monthly charge can quietly
> push a donor past the $1,200 legal cap over a long campaign. Keep contributions one-time
> unless you build in a hard per-donor running total. (You can ask me to add monthly with
> that guard if you want it.)

---

## Ontario / City of Thorold compliance checklist

This site is built to support the rules, but **you must confirm the specifics with the
Thorold City Clerk** — they are the legal authority for your campaign.

- **Election day:** Monday, **October 26, 2026**. Nominations open May 1, 2026 and close
  in August 2026 — **confirm the exact nomination-day date and your filing requirements
  with the Thorold Clerk.**
- **Register first.** Do **not** raise or spend any money — including turning on donations —
  until you have **filed your nomination** and **opened a dedicated campaign bank account**.
  Co-mingling with a personal account is an offence.
- **Contribution limits** (built into the donate page): max **$1,200** to this candidate;
  max **$5,000** total from one person to all Thorold council candidates.
- **Eligible contributors only:** individuals who **normally reside in Ontario**, using
  their **own funds**. **No corporations or unions.** No anonymous contributions.
- **Records:** name + address required for any contribution over $25 (the form collects
  these and Stripe stores them in each payment's metadata for your financial statement).
- **No tax receipts.** Municipal contributions are **not** tax-deductible; the site says so.
  (Check whether Thorold has a contribution-**rebate** by-law — most small municipalities
  don't, but confirm.)
- **Your spending limit** is set by the Clerk based on the number of electors — ask for it.
- **Advertising authorization:** every page footer carries *“Authorized by the Campaign of
  Asad Mahmood for Thorold City Council.”* Keep this on all ads, signs, and mailers too.
- **Surplus:** unused contributions generally can't be refunded (except your/your spouse's
  own money) and any surplus is turned over to the municipality.
- **Financial statement:** all contributions and expenses must be filed after the election;
  an audit may be required above set thresholds. Keep every record Stripe generates.

> This is general information to help you set up correctly, not legal advice. The Thorold
> City Clerk and the Province's candidate guide are the authoritative sources — verify
> limits, dates, and forms with them before launch.

---

## Accessibility & design notes

- WCAG 2.1 AA: contrast-checked palette, keyboard nav, visible focus, skip link,
  labelled fields, reduced-motion support, responsive to mobile.
- Palette is deliberately non-partisan: **teal #0F766E / charcoal #1F2937 / gold accent**.
- The stepped “lock” motif in the header mark, hero, and dividers nods to the Welland
  Canal flight locks that run through Thorold — local identity without partisanship.
