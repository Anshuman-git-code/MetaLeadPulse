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
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
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
// EXPORT THE ROUTER
// ─────────────────────────────────────────────────────────────────────────────
// server.js imports this and mounts it at '/webhook/meta'.
// The GET '/' route defined above then becomes GET '/webhook/meta'.
module.exports = router;
