// ─────────────────────────────────────────────────────────────────────────────
// webhook/index.js — Meta webhook handler module
//
// This file is responsible for everything related to Meta's webhook:
//   - GET  /webhook/meta  → webhook verification (one-time setup handshake)
//   - POST /webhook/meta  → incoming lead events from Meta (added in Phase 9)
//
// WHY a separate file instead of putting this in server.js?
// server.js is growing. Keeping Meta-specific logic here means server.js
// stays clean — it just mounts this router, it doesn't know the details.
// This matches the architecture plan in docs/03-architecture.md Section 9:
//   backend/src/webhook/   ← receive and verify inbound Meta events
//
// HOW it connects to server.js:
// This file exports an Express Router. server.js imports that router and
// mounts it at '/webhook/meta'. Any route defined here as '/' becomes
// '/webhook/meta' when mounted.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// IMPORT EXPRESS ROUTER
// ─────────────────────────────────────────────────────────────────────────────
// express.Router() creates a mini Express application — it can define routes
// just like the main app, but it is self-contained. We export it so server.js
// can mount it at a specific path prefix.
const express = require('express');
const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT CRYPTO — built-in Node.js module for signature verification
// ─────────────────────────────────────────────────────────────────────────────
// Node.js ships with a 'crypto' module for cryptographic operations.
// We use it in the POST handler to verify the X-Hub-Signature-256 header
// that Meta attaches to every webhook event delivery.
// No install needed — it is part of Node.js core.
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT META API CLIENT AND LEAD NORMALIZER
// ─────────────────────────────────────────────────────────────────────────────
// WHY these are imported here:
// We created meta/index.js (Phase 19) and leads/index.js (Phase 20) as
// separate modules. Now that we have a real leadgen_id from the webhook,
// we wire them in here to complete the pipeline:
//
//   leadgen_id (from webhook)
//         ↓
//   retrieveLead() — calls Meta Graph API, returns raw field_data
//         ↓
//   normalizeLead() — maps Meta fields to our application Lead model
//         ↓
//   normalized Lead object (ready for Socket.IO emission in next phase)
const { retrieveLead } = require('../meta');
const { normalizeLead } = require('../leads');

// ─────────────────────────────────────────────────────────────────────────────
// RAW BODY MIDDLEWARE — for this router only
// ─────────────────────────────────────────────────────────────────────────────
// express.raw() reads the request body as a raw Buffer (raw bytes),
// not as a parsed object. We need the raw bytes to verify the HMAC signature.
//
// WHY this is here instead of in server.js:
// server.js uses express.json() for all other routes but skips /webhook/meta.
// This router applies express.raw() only to its own routes, so only webhook
// requests get raw body handling. No other route is affected.
//
// { type: '*/*' } means: treat ANY content-type as raw bytes.
// Meta sends Content-Type: application/json, but we want raw bytes, not parsed.
router.use(express.raw({ type: '*/*' }));


// ─────────────────────────────────────────────────────────────────────────────
// GET /webhook/meta — Webhook verification handler
// ─────────────────────────────────────────────────────────────────────────────
// WHY this route exists:
// Before Meta starts sending real webhook events (like lead notifications),
// it first verifies that the URL we gave it is actually under our control.
// It does this by sending a GET request with three query parameters.
// Our job is to prove we own this endpoint by responding correctly.
//
// This is a one-time handshake during webhook setup in the Meta Developer
// Dashboard. After it succeeds, Meta will use POST for real events.
//
// What Meta sends (as URL query parameters):
//   hub.mode         — always the string "subscribe" during verification
//   hub.verify_token — the token we configured in Meta's dashboard
//   hub.challenge    — a random number Meta wants us to echo back
//
// What we must do:
//   1. Check hub.mode === 'subscribe'
//   2. Check hub.verify_token matches our META_VERIFY_TOKEN env variable
//   3. If both match → respond with the hub.challenge value (plain text, 200)
//   4. If either fails → respond 403 Forbidden
//
// Meta reads our response. If it gets back the challenge, verification passes
// and the webhook subscription is activated. If not, setup fails.
//
// NOTE: query parameters in Express are accessed via req.query
// The parameter names use dots (hub.mode) — Express reads them fine.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {

    // Read the three parameters Meta sends as URL query strings.
    // Example URL Meta sends:
    //   GET /webhook/meta?hub.mode=subscribe&hub.verify_token=abc123&hub.challenge=1158201444
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook verification request received');
    console.log('  hub.mode:', mode);
    // We log that a token was received but NOT its value — tokens are secrets.
    console.log('  hub.verify_token received:', token ? 'YES' : 'NO');
    console.log('  hub.challenge:', challenge);

    // ── Validate both conditions ──────────────────────────────────────────
    // process.env.META_VERIFY_TOKEN was loaded from .env by dotenv in server.js.
    // We compare the incoming token against what we set in our .env file.
    // The same value must be entered in Meta's Developer Dashboard → Webhooks.
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {

        // Both conditions passed.
        // Respond with the challenge value — this is what Meta is waiting for.
        // res.send() sends plain text. Meta expects just the challenge number,
        // not a JSON object. HTTP 200 is sent automatically by res.send().
        console.log('Webhook verification successful — challenge returned');
        res.send(challenge);

    } else {

        // Something didn't match.
        // Either mode was not 'subscribe', or the token was wrong.
        // We respond 403 Forbidden. Meta will not activate the webhook.
        // We log which condition failed to help with debugging.
        if (mode !== 'subscribe') {
            console.warn('Webhook verification failed — unexpected mode:', mode);
        } else {
            console.warn('Webhook verification failed — token mismatch');
        }

        res.sendStatus(403);
    }

});


// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook/meta — Lead event receiver
// ─────────────────────────────────────────────────────────────────────────────
// WHY this route exists:
// After webhook verification (GET above) succeeds, Meta starts sending real
// lead-generation events as POST requests to this same URL.
// This handler receives those events, verifies they genuinely came from Meta,
// parses the payload, and extracts the lead-related information.
//
// What Meta sends:
//   Header: X-Hub-Signature-256: sha256=<hmac_signature>
//   Body:   JSON payload containing the leadgen event
//
// The payload structure (from docs/02-meta-integration-research.md):
// {
//   "object": "page",
//   "entry": [{
//     "id": "<page_id>",
//     "time": <unix_timestamp>,
//     "changes": [{
//       "field": "leadgen",
//       "value": {
//         "leadgen_id": <numeric_id>,
//         "page_id":   <numeric_id>,
//         "form_id":   <numeric_id>,
//         "created_time": <unix_timestamp>
//       }
//     }]
//   }]
// }
//
// Important: this payload does NOT contain the actual lead data (name, email,
// phone). It only tells us THAT a lead was created and gives us identifiers.
// The real lead data is fetched separately from Meta's Graph API — that is
// built in a later phase.
//
// For now this handler:
//   1. Verifies the X-Hub-Signature-256 signature
//   2. Responds 200 immediately (Meta requires a fast response)
//   3. Parses the payload and extracts the leadgen event(s)
//   4. Logs what was received for debugging
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {

    // ── STEP 1: Respond 200 to Meta immediately ───────────────────────────
    // Meta expects a 200 response quickly. If we wait too long (doing API
    // calls etc.), Meta considers it a failure and will retry the webhook.
    // We send the response first, then do our processing below.
    // res.sendStatus(200) sends "200 OK" with no body — that is all Meta needs.
    res.sendStatus(200);

    // ── STEP 2: Verify the signature ──────────────────────────────────────
    // Meta signs every webhook POST with HMAC-SHA256 using our App Secret
    // as the key. The result is sent in the X-Hub-Signature-256 header.
    // We compute the same signature ourselves and compare.
    // If they match → the request genuinely came from Meta.
    // If they don't → someone else sent this request — we ignore it.
    //
    // req.body here is a raw Buffer (because of express.raw() above),
    // not a parsed object. That is exactly what we need for signature verification.
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        // No signature header at all — log and stop.
        // This can happen during local curl testing (we don't send the header).
        // In production this would be suspicious.
        console.warn('Webhook POST received without X-Hub-Signature-256 header');
        return;
    }

    // Compute our own HMAC-SHA256 of the raw body using the App Secret.
    // crypto.createHmac(algorithm, key) creates an HMAC object.
    // .update(data) feeds in the data to sign.
    // .digest('hex') returns the result as a hex string.
    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET)
        .update(req.body)
        .digest('hex');

    // crypto.timingSafeEqual compares two Buffers in constant time.
    // We use it instead of === to prevent timing attacks.
    // (A timing attack can reveal the expected value by measuring how long
    // the comparison takes — timingSafeEqual prevents that.)
    // Both values must be Buffers of the same length for this to work.
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        console.warn('Webhook POST signature mismatch — ignoring request');
        return;
    }

    // ── STEP 3: Parse the raw body ─────────────────────────────────────────
    // req.body is a Buffer at this point. We convert it to a string and parse
    // it as JSON to work with the data as a JavaScript object.
    let payload;
    try {
        payload = JSON.parse(req.body.toString());
    } catch (err) {
        console.error('Webhook POST — failed to parse body as JSON:', err.message);
        return;
    }

    console.log('Webhook POST received — object type:', payload.object);

    // ── STEP 4: Check this is a Page-level event ───────────────────────────
    // Meta sends webhooks for many object types. We only care about 'page'
    // events because that is where Lead Ads live.
    if (payload.object !== 'page') {
        console.log('Webhook POST — not a page event, skipping');
        return;
    }

    // ── STEP 5: Walk through entries and changes ───────────────────────────
    // The payload can contain multiple entries (batched events).
    // Each entry can contain multiple changes.
    // We loop through all of them looking for 'leadgen' field events.
    //
    // Array.forEach() runs a function for each item in an array.
    // entry and change are each one item from the respective array.
    payload.entry.forEach((entry) => {
        entry.changes.forEach((change) => {

            // We only process leadgen events — ignore anything else.
            if (change.field !== 'leadgen') {
                console.log('Webhook POST — change field is not leadgen:', change.field);
                return;
            }

            // ── STEP 6: Extract lead identifiers ──────────────────────────
            // change.value contains the identifiers for this specific lead event.
            // These are what we will use later to fetch the actual lead data
            // from Meta's Graph API.
            const {
                leadgen_id,
                page_id,
                form_id,
                created_time,
            } = change.value;

            // Log what we received. This is the key debug output that tells
            // us the full webhook pipeline is working — from Meta all the
            // way to our server logs.
            // We do NOT log the full payload — just the identifiers we need.
            console.log('Lead event received:');
            console.log('  leadgen_id:   ', leadgen_id);
            console.log('  page_id:      ', page_id);
            console.log('  form_id:      ', form_id);
            console.log('  created_time: ', created_time);
            console.log('  → Ready for Graph API retrieval (next phase)');

            // ── STEP 7: Retrieve lead from Meta Graph API and normalize ──
            // WHY this is here:
            // We now have meta/index.js (retrieveLead) and leads/index.js
            // (normalizeLead) ready. The leadgen_id from the webhook is
            // the key we need to fetch the actual lead data from Meta.
            //
            // WHY async IIFE (immediately invoked function expression):
            // forEach callbacks cannot be async directly in a way that
            // propagates errors cleanly. We wrap the async work in an
            // immediately-invoked async function so we can use await
            // inside the forEach loop.
            //
            // WHY we don't await the forEach itself:
            // The 200 response was already sent to Meta in Step 1.
            // This processing happens after the response — Meta doesn't
            // wait for it. So using an async IIFE here is correct.
            (async () => {
                try {
                    // Call Meta Graph API with the leadgen_id.
                    // Returns raw response: { id, created_time, field_data }
                    const rawLead = await retrieveLead(leadgen_id);

                    // Transform Meta's field_data into our application Lead model:
                    // { id, name, email, phone, createdAt }
                    const lead = normalizeLead(rawLead);

                    // Log the normalized lead so we can confirm it during testing.
                    // We log name and email only — not the full object — to avoid
                    // printing sensitive personal data unnecessarily.
                    console.log('Normalized lead ready:');
                    console.log('  id:        ', lead.id);
                    console.log('  name:      ', lead.name);
                    console.log('  email:     ', lead.email);
                    console.log('  phone:     ', lead.phone || '(not provided)');
                    console.log('  createdAt: ', lead.createdAt);
                    console.log('  → Ready for Socket.IO emission (next phase)');

                    // ── PLACEHOLDER for Socket.IO emission ────────────────
                    // In the next feature (feat/meta-lead-to-realtime), we will:
                    //   io.emit('new-lead', lead)
                    // That will send the lead to the already-open React Native app.
                    // For now, we confirm the full retrieve + normalize pipeline works.

                } catch (err) {
                    // Log the error clearly so it's diagnosable from the terminal.
                    // Common causes:
                    //   - expired Page Access Token
                    //   - invalid leadgen_id (e.g. dummy 444444444444 from Test button)
                    //   - missing permission on the token
                    //   - Meta API temporarily unavailable
                    console.error('Failed to retrieve or normalize lead:', err.message);
                }
            })();
        });
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT THE ROUTER
// ─────────────────────────────────────────────────────────────────────────────
// server.js imports this and mounts it at '/webhook/meta'.
// The GET '/' route defined above then becomes GET '/webhook/meta'.
module.exports = router;
