# Meta Lead Integration Research

This document captures what needs to be understood about the Meta side of this project before implementation starts. It covers the entities involved, how a lead submission becomes an event that our backend receives, how the backend then gets the actual lead data, and what role authorization plays throughout. It also notes what is still unresolved.

This is not the architecture document. Implementation decisions live in `docs/03-architecture.md`.

---

## 1. Objective

Understand how a lead submitted through Meta's platform can reach our Node.js backend in real time, how the backend retrieves the actual lead data after receiving that notification, and how that data can then be pushed to an already-open React Native app.

---

## 2. Meta Ecosystem Involved

### 2.1 Meta

In this project, "Meta" refers to the company and developer platform behind services like Facebook and Instagram. Meta exposes a developer-facing ecosystem that lets external applications register for events, interact with platform data through APIs, and configure integrations via a developer dashboard.

We are not integrating with Meta the company as a whole — we are integrating with two specific parts of Meta's developer platform: **Webhooks** (for event notification) and the **Graph API** (for data retrieval).

### 2.2 Meta Developer App

This is not the same as our React Native app, and not the same as our Node.js backend.

The Meta Developer App is a project registered inside Meta's developer platform at [developers.facebook.com](https://developers.facebook.com). It gives our integration an identity in Meta's ecosystem. Configuration lives here — things like webhook endpoints, subscribed events, API products, permissions, and credentials (App ID, App Secret).

To be clear about what's what:

| Entity | What it is |
|---|---|
| Meta Developer App | Configuration/identity registered in Meta's developer dashboard |
| Node.js backend | Our server that receives webhook events and makes API calls |
| React Native app | Our mobile client that displays leads |

These are three separate things. The Meta Developer App doesn't run code — it's a configuration entry point.

### 2.3 Facebook Page

A Facebook Page is the business/public presence on Facebook associated with lead-generation activity. In this integration, the Page is the entity that lead forms are attached to. When a lead is submitted through a form tied to a Page, the lead-generation event comes from that Page.

The Page has a numeric identifier (Page ID) that appears in webhook payloads and is used in some API calls. We'll need to know our Page ID during setup.

A Facebook Page is not the same as:
- the Meta Developer App
- the Lead Form
- the Lead
- the React Native app

### 2.4 Lead Ad

A Lead Ad is an advertisement type on Meta's platform designed to collect contact or interest information from someone who sees the ad. The person doesn't need to leave Facebook or Instagram — the form appears inline.

For this PoC, we are not running a real ad. The assignment explicitly says to use the Meta Lead Testing Tool instead.

### 2.5 Lead Form

The Lead Form is the form associated with a lead-generation campaign. It defines what fields are collected, for example:

- Full name
- Email address
- Phone number

The relationship is:

```
Lead Ad
  → Lead Form
  → Person fills it out
  → Lead is created
```

The form itself is a template. The resulting submission is the lead.

### 2.6 Lead

A lead is the captured record of a person who submitted a lead form. Conceptually:

```
{
  full_name: "Rahul Sharma",      ← example, not real data
  email: "rahul@example.com",
  phone: "+91 9876543210"
}
```

This is what we ultimately want to display in the React Native app.

### 2.7 Lead ID / `leadgen_id`

When a lead is created, Meta assigns it a unique numeric identifier. This identifier appears in the webhook notification as `leadgen_id`.

The key concept: **the webhook notification does not contain the full lead data**. It contains identifiers — including `leadgen_id` — which the backend can then use to fetch the actual lead data from the Graph API.

Notification and data retrieval are two separate steps.

---

## 3. Integration Mechanisms

### 3.1 Webhook

A webhook is an HTTP endpoint that our backend exposes and that Meta calls when a subscribed event occurs.

The alternative would be polling — our backend repeatedly asks Meta "are there any new leads?" That's wasteful and doesn't meet the assignment's requirement for real-time delivery.

With a webhook, the model flips:

```
Polling:  our backend → Meta  ("any new leads?")   [repeated]
Webhook:  Meta → our backend  ("here's a new lead") [on event]
```

The webhook is a URL (HTTPS endpoint) that we register in the Meta Developer App dashboard. When the subscribed event fires, Meta sends a POST request to that URL.

### 3.2 Webhook Verification

Before Meta starts sending events to a new endpoint, it runs a one-time verification handshake. According to current Meta documentation:

1. Meta sends a GET request to the configured callback URL with three query parameters: `hub.mode` (always `subscribe`), `hub.challenge` (a number), and `hub.verify_token` (a string we configure in the dashboard).
2. Our backend checks that `hub.verify_token` matches the value we configured.
3. Our backend responds with the `hub.challenge` value.
4. If it matches, Meta confirms the subscription.

This verification only proves that we control the endpoint. It is separate from the security of actual event payloads.

### 3.3 Event Delivery

After the webhook is configured and our Page is subscribed, Meta sends a POST request to our callback URL whenever a subscribed event occurs.

The payload for a `leadgen` event looks like this (from current official Meta documentation):

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<page_id>",
      "time": 1438292065,
      "changes": [
        {
          "field": "leadgen",
          "value": {
            "leadgen_id": 123123123123,
            "page_id": 123123123,
            "form_id": 12312312312,
            "adgroup_id": 12312312312,
            "ad_id": 12312312312,
            "created_time": 1440120384
          }
        }
      ]
    }
  ]
}
```

Important notes from official docs:
- Entries can be batched (multiple changes in one POST).
- Meta may retry failed deliveries, so the backend should handle duplicate events gracefully.
- Our backend must respond with HTTP 200 promptly. If it doesn't, Meta will retry.
- There is also an `X-Hub-Signature-256` header in event notifications that can be used to verify the payload's authenticity (see Section 8.4).

### 3.4 `leadgen` Event

The `leadgen` field/event is the specific event type relevant to this PoC. It fires when a person submits a lead form associated with the subscribed Page.

```
Person submits lead form
  → Meta records the lead
  → Meta fires a leadgen event
  → Webhook delivers the notification to our backend
```

`leadgen` is the event/notification. It is not the lead record itself.

### 3.5 Graph API

The Meta Graph API is Meta's HTTP API for programmatic access to Meta platform resources. Our backend uses it for one specific purpose in this PoC: after receiving a webhook notification with a `leadgen_id`, retrieve the actual lead data.

The call looks like:

```
GET https://graph.facebook.com/v<version>/<leadgen_id>?access_token=<token>
```

The response contains the lead's `field_data` — an array of name/value pairs corresponding to what the person filled out on the form.

The division of responsibility is clean:

- **Webhook** → Meta tells us something happened, gives us identifiers
- **Graph API** → We ask Meta for the actual data using those identifiers

### 3.6 Access Token

An access token is a credential passed with Graph API requests to prove authorization. Without a valid token, the API will reject the request.

There are different types:

| Type | Description |
|---|---|
| App ID | Identifies the Meta Developer App |
| App Secret | Sensitive credential associated with the App. Not an access token — do not confuse them |
| User Access Token | Short-lived token tied to a user who authorized the app |
| Page Access Token | Token scoped to a specific Facebook Page. Required for Page-level operations including lead retrieval and webhook subscription |

For lead retrieval and webhook subscription, current Meta documentation specifies a **Page Access Token** from a user who can perform the ADVERTISE task on the Page. The exact token type and lifetime (short-lived vs. long-lived) will need to be verified during implementation. Long-lived Page access tokens are mentioned in Meta documentation for CRM-style integrations to avoid frequent re-authorization.

### 3.7 Permissions

Meta permissions control what API operations a token can perform. The current official Meta documentation lists the following permissions as required for the lead retrieval and webhook integration:

```
leads_retrieval
pages_manage_metadata
pages_show_list
pages_read_engagement
ads_management
```

Source: [Meta Webhooks for Lead Ads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/quickstart/webhooks-integration) and [Retrieving Leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving) — both updated May 2026.

**Important caveat from official documentation:** Starting with Marketing API v9.0, apps in Development mode cannot retrieve leads submitted by users outside the app. In Development mode, leads can only be retrieved by someone with a role in the same app. This is relevant for testing — our test accounts (the ones simulating lead submission) need to be added to the Meta Developer App.

Whether all of the listed permissions require App Review for a PoC used under Development mode is something to verify during setup. Production use would require App Review for `leads_retrieval` and related permissions.

---

## 4. End-to-End Event Flow

```
Person submits lead form (or developer uses Lead Testing Tool)
              ↓
    Meta creates the lead record
              ↓
    Meta fires a `leadgen` event
              ↓
    Meta sends POST to our webhook callback URL
              ↓
    Node.js backend receives the notification
              ↓
    Backend extracts `leadgen_id` from the payload
              ↓
    Backend makes a GET request to Graph API
    (using `leadgen_id` + authorized Page access token)
              ↓
    Meta returns the lead's field_data
              ↓
    Backend normalizes the lead data
              ↓
    Backend emits a real-time event to connected clients
              ↓
    React Native app receives the event
              ↓
    Lead appears in the leads list screen
```

A few things to note:

- Our backend does not create the lead. It only receives a notification and retrieves data.
- Meta is the external source and acts as the authority on the lead data.
- The backend is the integration boundary — it talks to both Meta and the React Native client.
- The React Native app never talks to Meta directly and should never hold sensitive Meta credentials.

---

## 5. Webhook vs API Responsibility

| Mechanism | Direction | Purpose | In this project |
|---|---|---|---|
| Webhook | Meta → our backend | Notification that an event occurred | Meta POSTs a `leadgen` notification to our backend endpoint |
| Graph API | Our backend → Meta | Request/retrieve data or perform an authorized operation | Backend fetches lead field data using `leadgen_id` |

The mental model:

- **Webhook says:** "A lead was submitted, its ID is X."
- **`leadgen_id` says:** "This is which specific lead."
- **Graph API says:** "Give me the data for lead X."
- **Access token says:** "This request is authorized."

These are four different things and should not be confused with each other.

---

## 6. Authentication and Authorization

### 6.1 Why authorization is needed

Lead data contains personal information — name, email, phone. Meta won't let anyone with an internet connection read it. The backend must prove it is authorized to access leads on behalf of the Page.

### 6.2 Credential flow

Our backend stores a Page access token (obtained during setup, not from the mobile app) and includes it with every Graph API call. The token carries the permissions granted during authorization.

### 6.3 Token vs App Secret

These are different things:

- **App Secret:** Sensitive application credential stored in the Meta Developer App. Used to generate tokens and to verify webhook payload signatures. Should never be exposed publicly or put in client-side code.
- **Access Token / Page Access Token:** Credential passed with API requests to authorize them. Can expire (short-lived) or be made long-lived through a token exchange.

An App Secret is not an access token. An access token is not an App Secret.

### 6.4 Development vs production

In Development mode, the Meta app has access to data only for users with roles in that same app. For this PoC, as long as we're testing with accounts that have roles in the Meta Developer App, Development mode should be sufficient.

For a production deployment, `leads_retrieval` and related permissions would require Meta App Review and Business Verification. That is out of scope for this PoC.

---

## 7. Real-Time Communication Requirement

The assignment requires the lead to appear in the React Native app without any manual interaction. This means a simple "fetch leads on app open or refresh" approach doesn't work.

The required behavior:

```
Backend receives and processes lead
  → Backend pushes event to connected clients immediately
  → React Native client receives it
  → Client updates local state
  → UI re-renders with the new lead
```

The app must be listening for updates when the lead comes in. This requires a persistent or long-lived connection between the backend and the app.

Possible approaches:

| Approach | Notes |
|---|---|
| WebSocket | Full-duplex, widely supported, requires connection management |
| Socket.IO | Built on WebSocket with fallbacks and reconnection logic. Common in Node.js ecosystems |
| Server-Sent Events (SSE) | Server-to-client only, simpler but less flexible |
| Long polling | Works but inefficient; not appropriate here |

For this PoC, simplicity matters more than scalability. Socket.IO is a natural fit for a Node.js + React Native setup because it handles reconnection and has a well-maintained React Native client library. But this is our implementation decision — it has nothing to do with what Meta requires.

The trade-off: real-time connections introduce connection lifecycle concerns (reconnects, timeouts, what happens if the client was offline when a lead arrived). For a PoC demo, this is manageable — we just need the app open and connected during the demonstration.

---

## 8. Security Considerations

### 8.1 Secrets

Never commit to Git:
- App Secret
- Access tokens (any type)
- Any credential value

Use environment variables. Provide a `.env.example` file with placeholder values so another developer knows what's needed without the actual secrets being committed.

### 8.2 Backend vs mobile

The React Native app should not contain Meta credentials. All Meta API calls must go through our backend. The mobile client only talks to our backend, not to Meta directly.

### 8.3 HTTPS

Meta requires HTTPS for webhook callback URLs. During local development, a tunnelling tool (ngrok or similar) can expose the local server over HTTPS to a public URL. This is standard practice for webhook development and not a production infrastructure concern.

### 8.4 Webhook payload validation

When Meta sends an event notification, it includes an `X-Hub-Signature-256` header containing a SHA-256 HMAC signature of the payload, computed using the App Secret as the key. According to the official Meta documentation:

> "You don't have to validate the payload, but you should."

For this PoC, we should at minimum implement this validation for correctness and to demonstrate good practice. The process: compute the HMAC-SHA256 of the raw request body using the App Secret, compare it against the header value.

This is a security best practice, not an explicit requirement stated in the assignment.

### 8.5 Logging

Development logs should be useful but should not include:
- Access tokens or App Secret values
- Unnecessary personal data from lead payloads (don't log full lead records unnecessarily)

---

## 9. Development / Test Environment

The assignment explicitly requires using the **Meta Lead Testing Tool** instead of a real ad campaign. This is available at `developers.facebook.com/tools/lead-ads-testing`.

According to current Meta documentation (updated Sep 2025):

- The tool lets you select a Page and a Lead Form, then create a test lead with dummy data.
- Only one test lead can exist per form at a time. You delete it before creating a new one.
- Leads created this way are **organic leads** — not associated with any ad, so `ad_id` and `adgroup_id` in the payload may be absent or empty.
- The tool shows the webhook delivery status (pending → success or failed), which is useful for debugging.
- **The tool cannot be used in developer mode apps.** This means the Meta Developer App must be in a state where it can receive test leads, which needs to be verified during setup.

For local development, the webhook callback URL needs to be publicly reachable over HTTPS. A tunnelling tool like ngrok is the standard approach here. The URL will look something like `https://<random>.ngrok.io/webhook`.

One practical implication: every time the tunnel restarts, the public URL changes, and the webhook callback URL in the Meta Developer App needs to be updated. This is just a local dev inconvenience.

---

## 10. Project-Specific Mental Model

Four separate worlds involved:

**Meta's platform**
Facebook Pages, Lead Forms, Lead records, Meta's data systems

**Meta Developer Platform**
Meta Developer App, webhook configuration, Graph API, access tokens, permissions

**Our backend (Node.js)**
Webhook endpoint, Graph API client, lead processing, real-time push

**Our mobile client (React Native / Expo)**
Leads list screen, real-time client, local state management

The connection between them:

```
Meta
  ↓ (webhook — Meta notifies backend)
Our Backend
  ↓ (real-time — backend notifies app)
React Native
```

And separately, for data retrieval:

```
Our Backend
  → (Graph API request with token)
Meta
  ← (lead field_data response)
```

---

## 11. Important Concepts and Terminology

| Term | Meaning |
|---|---|
| Meta | Company/platform ecosystem behind Facebook, Instagram, and their developer APIs |
| Meta Developer App | Developer-side application registered in Meta's developer dashboard representing our integration |
| Facebook Page | Business/public Facebook presence associated with the lead-generation activity |
| Lead Ad | Advertisement intended to collect potential-customer information |
| Lead Form | Form used to collect information from the submitter |
| Lead | Captured submission record from a person who filled out a Lead Form |
| `leadgen_id` | Unique identifier assigned to a lead record by Meta |
| Webhook | HTTP callback endpoint our backend exposes for Meta to send event notifications |
| `leadgen` event | Lead-generation event fired by Meta when a Lead Form is submitted |
| Access Token | Credential passed with Graph API requests to authorize them |
| Page Access Token | Access token scoped to a specific Facebook Page |
| App Secret | Sensitive credential for the Meta Developer App; used for token generation and payload signature verification |
| Graph API | Meta's HTTP API for programmatic interaction with platform resources |
| Backend | Our Node.js server — integration boundary between Meta and the React Native app |
| React Native | Our mobile client application |
| Real-time transport | Mechanism (WebSocket / Socket.IO / SSE) used to push lead updates from backend to the open app |

---

## 12. Failure / Edge Cases to Consider

Not implementing these now — just noting them as things to think about during implementation:

- **Lead retrieval fails after webhook received:** Backend got the notification but the Graph API call failed (network error, token expired, rate limit). The lead would be lost unless there's a retry mechanism.
- **Access token expired:** If using a short-lived token, the backend will start getting 401 errors. Long-lived tokens (or a token refresh flow) are needed for anything beyond a short demo.
- **Unexpected webhook payload:** The `leadgen` event might have a different structure than expected, or a different event type might arrive. Backend should validate the payload before processing.
- **React Native client disconnected:** If the app closes or loses connection just before a lead arrives, it won't receive the event. For the demo, this is manageable — just make sure the app is connected before submitting the test lead.
- **Duplicate event delivery:** Meta may retry failed deliveries. The same `leadgen_id` could arrive more than once. Backend should handle this (idempotency) to avoid duplicate entries in the UI.
- **Meta API temporarily unavailable:** The backend receives the webhook but can't retrieve the lead. This would need a queue or retry strategy in production — for the PoC, logging the failure is probably sufficient.
- **Lead Testing Tool "organic lead" behavior:** Leads from the testing tool have no associated ad. The `adgroup_id` and `ad_id` fields in the payload may be zero or absent. The backend should not fail if those fields are missing.

---

## 13. Open Questions / Uncertainties

Things to verify during implementation rather than assuming:

- **App mode for the testing tool:** Confirmed by official docs that the Lead Testing Tool cannot be used in Development mode. What exactly does this require — Standard mode, or something else? Need to verify the steps to enable it.
- **Required permissions in the test environment:** The official docs list five permissions for the full integration. Do all five need to be enabled for a single-developer test scenario where we're accessing our own Page's leads?
- **Page Access Token type and lifetime:** Short-lived vs. long-lived. For a PoC demo, a manually obtained long-lived token might be fine — but the process needs to be verified.
- **Exact `leadgen` webhook payload from the testing tool:** The official sample payload includes `adgroup_id` and `ad_id`, but the testing tool docs say leads are organic and not associated with ads. Need to confirm whether those fields are present or absent when using the testing tool.
- **Graph API version:** The lead retrieval endpoint currently shows `v26.0` in official docs. Need to confirm the current stable version during implementation.
- **React Native real-time library:** Socket.IO's React Native client has had compatibility issues with newer versions of React Native / Expo in the past. Need to verify the current compatible version before committing to it.
- **Token storage for the PoC:** Best approach for storing the Page access token server-side in a simple local/tunnelled deployment — environment variable should be sufficient, but worth confirming.

---

## 14. Sources / References

All technical claims in this document are based on current official Meta documentation:

- [Webhooks for Lead Ads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/) — Verified payload structure, subscription setup, permissions required
- [Getting Started with Meta Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) — Verified verification handshake, `X-Hub-Signature-256`, event notification format
- [Retrieving Leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving) — Verified Graph API lead retrieval endpoint, `field_data` response shape, permissions, Development mode limitation (updated May 2026)
- [Meta Webhooks for Lead Ads — CRM Integration Guide](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/quickstart/webhooks-integration) — Verified full permission list, Page subscription setup (updated May 2026)
- [Testing and Troubleshooting Lead Ads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/testing-troubleshooting) — Verified Lead Testing Tool behavior, one-lead-per-form limitation, organic lead note (updated Sep 2025)
- [leads_retrieval permission reference](https://developers.facebook.com/docs/permissions/reference/leads_retrieval/) — Cross-referenced permission purpose

Non-official sources were not used for any technical claims about Meta API behavior.
