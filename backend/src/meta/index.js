// ─────────────────────────────────────────────────────────────────────────────
// meta/index.js — Meta Graph API client
//
// This module has one job: communicate with Meta's Graph API.
// It does not handle webhooks, does not emit Socket.IO events, and does not
// know anything about React Native. It is purely the layer that talks to Meta.
//
// WHY a separate module:
// The webhook handler (webhook/index.js) receives events from Meta.
// The lead normalizer (leads/index.js) transforms data into our app model.
// This module sits between them — it fetches the raw data from Meta.
// Keeping these three concerns separate means each file has one clear job.
//
// HOW it is used:
// webhook/index.js extracts the leadgen_id from the webhook payload,
// then calls retrieveLead(leadgenId) from this module to get the actual data.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// GRAPH API CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
// The base URL and version for all Graph API calls.
// v26.0 is the current stable version confirmed during Phase 18 testing.
// If Meta releases a new version, only this constant needs to change.
const GRAPH_API_BASE = 'https://graph.facebook.com/v26.0';


// ─────────────────────────────────────────────────────────────────────────────
// retrieveLead — fetch lead data from Meta Graph API
// ─────────────────────────────────────────────────────────────────────────────
// This is the only exported function from this module.
//
// What it does:
//   1. Builds the Graph API URL for the given leadgen_id
//   2. Makes an authenticated GET request using the Page Access Token
//   3. Returns the raw API response as a JavaScript object
//   4. Throws an error if the API call fails so the caller can handle it
//
// Parameters:
//   leadgenId — the numeric lead ID extracted from the webhook payload
//               (received as a number, converted to string for the URL)
//
// Returns:
//   A plain JavaScript object with the Graph API response, which includes:
//     id           — the leadgen_id (string)
//     created_time — ISO timestamp string
//     field_data   — array of { name, values } objects
//                    e.g. [{ name: 'full_name', values: ['Rahul'] }]
//
// WHY async/await:
//   Network requests take time — the function can't return immediately.
//   async makes the function return a Promise.
//   await pauses execution until the fetch completes, then continues.
//   This is cleaner than callbacks or raw .then() chains.
//
// WHY the Page Access Token comes from process.env and not a parameter:
//   The token is a server-side secret. It should never travel through the
//   webhook payload, the webhook handler parameters, or any client-facing code.
//   Keeping it in process.env and reading it here means the token never
//   leaves the server side. The webhook handler doesn't even need to know it.
// ─────────────────────────────────────────────────────────────────────────────
async function retrieveLead(leadgenId) {

    // Read the Page Access Token from environment variables.
    // This was loaded from .env by dotenv at the top of server.js.
    // It must never be logged, returned to a client, or embedded in a response.
    const token = process.env.META_PAGE_ACCESS_TOKEN;

    if (!token) {
        // If the token isn't set, fail immediately with a clear message.
        // This is a configuration problem, not a runtime problem.
        throw new Error('META_PAGE_ACCESS_TOKEN is not set in environment variables');
    }

    // Build the full URL for this specific lead.
    // The Graph API identifies resources by ID — the leadgen_id IS the resource.
    // Conceptually: "give me the lead object at this ID"
    const url = `${GRAPH_API_BASE}/${leadgenId}?access_token=${token}`;

    console.log(`Retrieving lead ${leadgenId} from Meta Graph API...`);

    // Make the HTTP GET request to Meta.
    // fetch() is built into Node 24 — no external library needed.
    // It returns a Response object. We then call .json() to parse the body.
    const response = await fetch(url);
    const data = await response.json();

    // ── Check for Meta API errors ──────────────────────────────────────────
    // Meta returns HTTP 200 even for errors — the error is inside the JSON body.
    // If there's an error key in the response, something went wrong on Meta's side.
    // Common causes: invalid/expired token, invalid leadgen_id, missing permission.
    if (data.error) {
        throw new Error(
            `Meta Graph API error: ${data.error.message} (code ${data.error.code})`
        );
    }

    console.log(`Lead ${leadgenId} retrieved successfully`);

    // Return the raw response data.
    // The caller (leads/index.js normalizer) is responsible for transforming
    // this into the application's Lead model.
    return data;
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
// Export only what other modules need. Nothing else is exposed.
module.exports = { retrieveLead };
