# System Architecture

This document describes the design of the PoC system. The goal is to demonstrate one specific end-to-end behavior: a test lead submitted through Meta's Lead Testing Tool appears live in an already-open React Native app — without any manual interaction on the device.

The system has three main parts we own (backend, realtime layer, mobile client) and two external Meta services we integrate with (webhook delivery, Graph API). This document explains what each part does, how they connect, and why the design is the way it is.

Background on Meta's platform is in `docs/02-meta-integration-research.md`. Requirements and acceptance criteria are in `docs/01-problem-understanding.md`. This document focuses on the design itself.

---

## 1. Architecture Goals

The architecture is designed to:

- Prove the complete Meta → backend → React Native event flow end to end
- Receive the Meta `leadgen` event through a webhook
- Retrieve the corresponding lead data from Meta's Graph API
- Normalize the lead into a clean application-level model
- Push the processed lead to a connected React Native client in real time
- Display the lead in the app without any manual refresh or device interaction

Constraints we're designing around:

- Meta credentials and Meta-specific integration logic stay on the backend — not in the mobile app
- The React Native client is responsible only for UI and state, not for Meta integration
- The design should be easy to run locally, easy to debug, and easy to walk through in a Loom

Not goals for this PoC:
- Production reliability, scalability, or uptime
- Persistent lead storage
- Multi-user or multi-tenant scenarios
- Performance targets or load handling

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────┐
│              META PLATFORM              │
│                                         │
│   Lead Testing Tool  ─►  Lead Created   │
│                               │         │
│                          leadgen event  │
└───────────────────────────────┼─────────┘
                                │ POST /webhook (HTTPS)
                                ▼
┌─────────────────────────────────────────┐
│           NODE.JS BACKEND               │
│                                         │
│  ┌─────────────────┐                    │
│  │ Webhook Handler │                    │
│  └────────┬────────┘                    │
│           │ extract leadgen_id          │
│           ▼                             │
│  ┌─────────────────┐   GET /{leadgen_id}│
│  │  Meta API Client│ ──────────────────►│──► Meta Graph API
│  └────────┬────────┘ ◄──────────────────│    (external)
│           │ field_data                  │
│           ▼                             │
│  ┌─────────────────┐                    │
│  │  Lead Processor │                    │
│  └────────┬────────┘                    │
│           │ normalized lead             │
│           ▼                             │
│  ┌─────────────────┐                    │
│  │   Socket.IO     │                    │
│  │   Server        │                    │
│  └────────┬────────┘                    │
└───────────┼─────────────────────────────┘
            │ new-lead event (Socket.IO)
            ▼
┌─────────────────────────────────────────┐
│         REACT NATIVE / EXPO APP         │
│                                         │
│  Socket.IO Client ─► Update State       │
│                            │            │
│                       Render List       │
└─────────────────────────────────────────┘
```

**External components** (we integrate with, don't own):
- Meta Platform (Lead Testing Tool, webhook delivery)
- Meta Graph API

**Backend components** (we own):
- Webhook handler
- Meta API client
- Lead processor/normalizer
- Socket.IO server

**Mobile components** (we own):
- React Native / Expo app
- Socket.IO client
- Leads list screen

The backend is the integration boundary. It talks to Meta on one side and to the React Native app on the other. These two sides never talk to each other directly.

---

## 3. System Components

### 3.1 Meta Lead Ads / Lead Testing Tool

**What it is:** The source of the lead event. In a real scenario, a person submits a Lead Form on Meta. For this PoC, we use the Meta Lead Testing Tool at `developers.facebook.com/tools/lead-ads-testing` to simulate a submission.

**Why the testing tool:** The assignment explicitly requires it. No real ads or ad spend are needed. The testing tool fires the same `leadgen` webhook event as a real submission (with the difference that leads from the tool are organic and not tied to an ad).

**Constraint (assignment):** The Meta Lead Testing Tool must be used.

### 3.2 Meta Webhook Integration

**What it is:** The inbound communication channel from Meta to our backend. Meta POSTs a JSON payload to our webhook callback URL whenever a `leadgen` event occurs on the subscribed Page.

**How it works:**
- Setup: one-time verification handshake where Meta sends a GET request with `hub.verify_token` and we respond with `hub.challenge`
- After setup: Meta sends a POST with the `leadgen` event payload whenever a lead is submitted

**What the payload contains:** The event notification includes a `leadgen_id`, `page_id`, `form_id`, and a timestamp. It does not contain the full lead data.

**Who owns this:** Meta controls webhook delivery. We own and operate the endpoint that receives it.

### 3.3 Node.js / Express Backend

**What it is:** The main integration boundary. All Meta-specific logic lives here.

Responsibilities in order of execution:

1. **Receive** the inbound POST from Meta on `/webhook`
2. **Verify** the request — validate `hub.verify_token` during setup; validate `X-Hub-Signature-256` on event delivery
3. **Parse** the payload — extract relevant fields, handle batched entries
4. **Extract** the `leadgen_id`
5. **Retrieve** lead data — call Meta's Graph API using the `leadgen_id` and a stored Page access token
6. **Normalize** — map Meta's `field_data` response to the application's internal Lead model
7. **Publish** — emit a `new-lead` event to all connected Socket.IO clients
8. **Respond** to Meta with HTTP 200 promptly (before or concurrently with the retrieval, so Meta doesn't time out)

**What it does not own:**
- The lead data (that lives in Meta's systems)
- Client state or UI logic
- Any frontend/display responsibilities

**Architecture choice:** Node.js + Express. Natural fit given the company's known stack and the existing project context.

### 3.4 Meta Graph API

**What it is:** An external Meta API. Not owned by us.

**Our use of it:** After receiving a webhook notification with a `leadgen_id`, the backend calls:

```
GET https://graph.facebook.com/<version>/<leadgen_id>?access_token=<token>
```

This returns the `field_data` array — name/value pairs of the form fields the lead submitted.

**Crucial distinction:**

| | Webhook | Graph API |
|---|---|---|
| Direction | Meta → Backend | Backend → Meta |
| Purpose | Notification | Data retrieval |
| Triggered by | Meta, on event | Our backend, after event |

These are two separate communication paths. The webhook tells us something happened. The Graph API is how we find out what exactly.

### 3.5 Realtime Transport (Socket.IO)

**What it is:** The communication channel between the backend and the React Native app.

**Why it's needed:** The assignment requires the lead to appear without manual refresh. The only way to do that is to push the event from the backend to the already-open app. The app must be connected and listening.

**Architecture decision:** Use Socket.IO. See [ADR-001](./decisions/001-realtime-communication.md) for the full rationale. Short version: Socket.IO is a natural fit for Node.js, has a clean event API, handles reconnection automatically, and has a React Native client library.

**How it works in the PoC:**
- The Socket.IO server runs in the same process as the Express server
- React Native app connects on app launch
- When the backend has a normalized lead, it calls `io.emit('new-lead', lead)`
- All connected clients receive the event

**Not a Meta requirement.** Socket.IO has nothing to do with Meta. It's purely the mechanism we chose to get the lead from our backend into the app.

Alternatives were considered (raw WebSocket, SSE, polling) — see ADR-001.

### 3.6 React Native / Expo Client

**What it is:** The mobile application. This is what the evaluator sees during the demo.

Responsibilities:
- Connect to the backend Socket.IO server when the app launches
- Listen for `new-lead` events
- Update local state when a lead arrives
- Render the leads list, showing the new lead immediately

**What it does not own:**
- Meta credentials or tokens
- Any Meta API calls
- Webhook handling
- Lead retrieval logic

The app should be a clean client. It receives normalized lead data from our backend. It doesn't need to know anything about Meta's API.

**Tech:** Expo + React Native. Assignment-specified requirement.

---

## 4. Component Responsibilities

| Component | Owns | Does not own |
|---|---|---|
| Meta Platform | Lead creation, event delivery, lead data | Our backend logic, app UI |
| Webhook Handler | Receiving Meta events, verification, parsing | Lead retrieval, UI, realtime delivery |
| Meta API Client | Graph API calls, token management | Webhook handling, UI, realtime |
| Lead Processor | Normalization, application lead model | Meta API, realtime, UI |
| Socket.IO Server | Client connections, event emission | Lead data retrieval, Meta integration |
| React Native App | UI, state management, realtime client | Meta credentials, API calls, backend logic |

---

## 5. End-to-End Data Flow

```
 1. Developer submits test lead via Meta Lead Testing Tool
              ↓
 2. Meta creates/records the lead, assigns leadgen_id
              ↓
 3. Meta fires a leadgen event
              ↓
 4. Meta POSTs the event to our /webhook endpoint (HTTPS)
              ↓
 5. Backend validates the request (X-Hub-Signature-256)
              ↓
 6. Backend parses the payload, extracts leadgen_id
              ↓
 7. Backend responds 200 OK to Meta immediately
              ↓
 8. Backend calls Graph API: GET /<leadgen_id>?access_token=<token>
              ↓
 9. Meta Graph API returns field_data (name, email, phone, etc.)
              ↓
10. Backend normalizes field_data into application Lead model
              ↓
11. Backend emits new-lead event via Socket.IO
              ↓
12. React Native client receives the new-lead event
              ↓
13. Client updates local state (prepends/appends lead to list)
              ↓
14. React Native re-renders — lead appears in the list
```

Step 7 (respond 200 immediately) is important. Meta expects a prompt HTTP 200 response. If the backend waits for the Graph API call to complete before responding, Meta may time out and retry the webhook. The Graph API call should happen asynchronously after the 200 is sent.

---

## 6. Runtime / Sequence View

```
Developer    Meta Platform    Our Backend    Meta Graph API    RN Client
    │               │               │               │               │
    │  submit lead  │               │               │               │
    │──────────────►│               │               │               │
    │               │ POST /webhook │               │               │
    │               │──────────────►│               │               │
    │               │               │ 200 OK        │               │
    │               │◄──────────────│               │               │
    │               │               │               │               │
    │               │               │ GET /leadgen_id               │
    │               │               │──────────────►│               │
    │               │               │               │ field_data    │
    │               │               │◄──────────────│               │
    │               │               │               │               │
    │               │               │ emit new-lead │               │
    │               │               │──────────────────────────────►│
    │               │               │               │               │ update state
    │               │               │               │               │ render list
    │               │               │               │               │ ← lead visible
```

The 200 OK back to Meta happens before the Graph API call. The realtime emission to React Native happens after lead retrieval and normalization complete.

---

## 7. Data and Event Contracts

### External: Meta Webhook Payload

The `leadgen` webhook notification contains event metadata and identifiers. The important fields are:

```
object:     "page"
entry[].changes[].field:  "leadgen"
entry[].changes[].value:
  leadgen_id:   <numeric id of the lead>
  page_id:      <numeric id of the page>
  form_id:      <numeric id of the form>
  created_time: <unix timestamp>
  adgroup_id:   <may be absent for organic/test leads>
  ad_id:        <may be absent for organic/test leads>
```

The webhook payload does not contain lead data. It contains identifiers.

### External: Meta Graph API Lead Response

The Graph API response for `GET /<leadgen_id>` contains:

```
id:           <leadgen_id>
created_time: <ISO timestamp>
field_data:   [
  { name: "full_name",     values: ["..."] },
  { name: "email",         values: ["..."] },
  { name: "phone_number",  values: ["..."] },
  ...
]
```

The exact fields depend on what was configured in the Lead Form. The `field_data` structure is an array of name/value pairs — not a flat object.

### Internal: Application Lead Model

The backend normalizes Meta's response into a simpler model before emitting it to the React Native client:

```
Lead {
  id:        string    (leadgen_id as string)
  name:      string
  email:     string
  phone:     string    (may be empty if form doesn't collect it)
  createdAt: string    (ISO timestamp)
}
```

This is our application-level model. The React Native client consumes this — it doesn't depend on Meta's `field_data` structure directly. If Meta's API response shape changes, only the normalization layer needs to update.

Some fields may be absent if the Lead Form didn't collect them. The normalization step should handle missing fields gracefully.

---

## 8. API and Integration Boundaries

### 8.1 Meta → Backend (Webhook)

- **Direction:** Inbound to our backend
- **Protocol:** HTTPS POST
- **Trigger:** Meta, on `leadgen` event
- **Our endpoint:** `POST /webhook`
- **Purpose:** Event notification — tells us a lead was created, gives us the ID

### 8.2 Backend → Meta (Graph API)

- **Direction:** Outbound from our backend
- **Protocol:** HTTPS GET
- **Trigger:** Our backend, after receiving a webhook event
- **Target:** `graph.facebook.com/<version>/<leadgen_id>`
- **Auth:** Page access token in query parameter or Authorization header
- **Purpose:** Retrieve the actual lead field data

### 8.3 Backend → React Native (Socket.IO)

- **Direction:** Server-to-client push
- **Protocol:** Socket.IO over WebSocket
- **Trigger:** Our backend, after normalizing the lead
- **Event name:** `new-lead`
- **Payload:** Application-level Lead model (see Section 7)
- **Purpose:** Deliver the processed lead to the connected app in real time

These three boundaries are distinct. None of them can substitute for another.

---

## 9. Backend Logical Structure

The backend is a single Node.js/Express process. Internally, the code is organized by responsibility:

```
backend/
└── src/
    ├── webhook/       ← receive and verify inbound Meta events
    ├── meta/          ← Graph API client, token management
    ├── leads/         ← normalization, application Lead model
    └── realtime/      ← Socket.IO server, client management, event emission
```

Logical processing pipeline:

```
Webhook Handler (webhook/)
      │
      │ validates, parses, extracts leadgen_id
      ▼
Meta API Client (meta/)
      │
      │ fetches field_data from Graph API
      ▼
Lead Normalizer (leads/)
      │
      │ maps field_data → application Lead model
      ▼
Realtime Publisher (realtime/)
      │
      │ emits new-lead event to connected clients
      ▼
React Native Client
```

Each layer has a single concern. The webhook layer doesn't know about Socket.IO. The realtime layer doesn't know about Meta's API. The normalization layer doesn't know about either.

This structure is a proposal — the exact file layout may shift during implementation.

---

## 10. React Native Logical Structure

The mobile app is straightforward for this PoC:

```
mobile/
└── src/
    ├── screens/       ← LeadsScreen (main display)
    ├── services/      ← Socket.IO client, connection management
    └── ...
```

The runtime flow in the app:

```
App launches
      │
Socket.IO client connects to backend
      │
App shows LeadsScreen (empty or with any preloaded state)
      │
Backend emits new-lead event
      │
Socket.IO client receives event
      │
State updated (new lead prepended to list)
      │
React Native re-renders LeadsScreen
      │
Lead is visible without any manual action
```

The app doesn't make any Meta API calls. It doesn't store or persist leads. Its job is to stay connected, receive events, and render them.

---

## 11. Security Architecture

### Credential boundaries

```
Meta App Secret
Meta Page Access Token
        │
        │  stored in backend environment variables only
        ▼
  Node.js Backend
        │
        │  used for Graph API calls (server-to-server)
        ▼
  Meta Graph API
```

The React Native app should never hold or transmit Meta credentials. If the app needed authentication to the backend, we'd add that — but for this PoC, the backend is only accessible locally/via tunnel, so it's acceptable to leave that open.

### Environment variables

- All credentials go in `.env` (not committed to Git)
- A `.env.example` file is committed showing the required variable names with placeholder values
- The backend reads credentials from environment variables at startup

Required variables (at minimum):

```
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=
META_VERIFY_TOKEN=
```

### Webhook payload validation

Incoming POST requests from Meta include an `X-Hub-Signature-256` header. The backend should:

1. Compute HMAC-SHA256 of the raw request body using `META_APP_SECRET` as the key
2. Compare against the header value
3. Reject the request if they don't match

This prevents someone else from POSTing arbitrary payloads to our webhook endpoint.

### Logging

Development logs should be useful for debugging without leaking credentials:

- Log: webhook received, event type, `leadgen_id`, Graph API success/failure, realtime emit
- Do not log: access tokens, App Secret, full lead personal data unnecessarily

---

## 12. Failure and Error Handling

### 12.1 Webhook verification failure

**Scenario:** Meta sends the initial GET verification request but our backend doesn't respond correctly.  
**Effect:** Webhook subscription fails to activate. Meta won't send events.  
**Handling:** Respond with the correct `hub.challenge` only when `hub.verify_token` matches. Log verification attempts for debugging.

### 12.2 Invalid or malformed webhook payload

**Scenario:** POST arrives but the body is unexpected (wrong format, missing fields, unexpected event type).  
**Effect:** Backend might crash or silently ignore the event.  
**Handling:** Parse defensively. If the payload doesn't have the expected structure, log a warning and return 200 anyway (Meta doesn't need to know our internal processing failed — retrying won't help if it's a structural issue). Don't let a bad payload crash the process.

### 12.3 Lead retrieval failure

**Scenario:** `leadgen_id` extracted, but the Graph API call fails.  
**Possible causes:** Invalid/expired token, missing permission, network error, invalid ID, API rate limit.  
**Handling for PoC:** Log the error with enough detail to diagnose. The lead is lost (not persisted). For the demo, ensure the token is valid before starting.  
**Production consideration:** Would need a retry queue and durable storage.

### 12.4 React Native client disconnected

**Scenario:** Backend emits `new-lead` but the app isn't connected.  
**Effect:** The event is not delivered. The client won't see the lead unless it reconnects and we re-emit.  
**Handling for PoC:** The demo setup assumes the app is already open and connected before the test lead is submitted. This is documented as an assumption.  
**Production consideration:** Would need persistent storage and a mechanism to deliver missed events on reconnect.

### 12.5 Duplicate event delivery

**Scenario:** Meta retries a webhook after not receiving a 200, but the backend already processed it.  
**Effect:** The same `leadgen_id` processed twice → duplicate lead in the app.  
**Handling for PoC:** The PoC doesn't have a database, so deduplication would require an in-memory seen-IDs set. This is worth adding if it becomes a problem during testing.  
**Production consideration:** Would need idempotency keyed on `leadgen_id`.

### 12.6 Meta API temporarily unavailable

**Scenario:** Webhook is received, but the Graph API returns 5xx or times out.  
**Handling for PoC:** Log the failure. The lead is lost.  
**Production consideration:** Would need a retry mechanism with backoff.

---

## 13. Scope and Deliberate Omissions

The following are intentionally excluded from the initial PoC:

| Excluded | Reason |
|---|---|
| MongoDB / any database | Not needed to prove the real-time event flow |
| Redis | No caching or pub/sub requirements at this scale |
| Message queues (SQS, RabbitMQ, Kafka) | No async processing needs beyond a direct function call |
| AWS Lambda / API Gateway | No serverless deployment requirement for a local PoC |
| ECS / Kubernetes | No container orchestration needed |
| Full CRM functionality | Out of scope per the assignment |
| User authentication | Not required by the assignment |
| Multi-client / multi-tenant | The demo uses one connected client |
| Analytics / reporting | Out of scope |
| Advanced error recovery | PoC — fail visibly, not gracefully |

The assignment asks to prove the real-time integration works. Adding infrastructure beyond what's required would make the project harder to debug and harder to explain in the architecture Loom — without improving the proof.

These technologies are all reasonable choices for production evolution of this system, but they're not needed now.

See [ADR-002](./decisions/002-no-persistent-storage.md) for the specific reasoning behind excluding persistent storage.

---

## 14. Architecture Decisions

Detailed rationale for significant decisions is in [Architecture Decision Records](./decisions/).

Summary of decisions:

- **Backend acts as the Meta integration boundary** — Meta credentials and API calls stay server-side, not in the mobile app.
- **Webhooks for inbound lead events** — event-driven, no polling; the only supported mechanism for real-time lead notifications from Meta.
- **Graph API for lead retrieval** — the only way to get the actual lead data after the webhook notification.
- **Socket.IO for PoC realtime delivery** — chosen for Node.js compatibility, reconnection handling, and clean event API. Not a Meta requirement.
- **No persistent storage in initial PoC** — not required by the assignment's acceptance criteria.

ADR files:
- [ADR-001: Realtime Communication](./decisions/001-realtime-communication.md)
- [ADR-002: No Persistent Storage](./decisions/002-no-persistent-storage.md)

---

## 15. PoC vs Production Considerations

**Current PoC design:**

```
Meta
 ↓  webhook
Node.js/Express
 ↕  Graph API
Socket.IO
 ↓  new-lead event
React Native
```

Simple, linear, runs in a single process, no persistence, single connected client.

**What would change for production:**

| Concern | PoC approach | Production approach |
|---|---|---|
| Lead persistence | None | Database (MongoDB or similar) |
| Missed events | Lost | Persist + replay on reconnect |
| Duplicate events | Basic in-memory dedup | Idempotency keyed on leadgen_id |
| Token management | Manual long-lived token | Token refresh automation |
| Webhook reliability | Basic error logging | Retry queue, dead-letter handling |
| Secrets | `.env` file | Secrets manager (AWS SSM, etc.) |
| Observability | Console logs | Structured logging, metrics, tracing |
| Scaling | Single process | Multiple instances, connection management |
| Auth | None | App-level authentication |
| Deployment | Local + ngrok | Production server with stable domain |

None of these are blockers for the PoC. They're documented here to show awareness of what "production-ready" would actually mean.

---

## 16. Observability and Debugging

Logging checkpoints during development:

| Event | What to log |
|---|---|
| Webhook GET (verification) | Received, token match result |
| Webhook POST (event) | Received, event type, `leadgen_id` |
| Graph API call | Request made, success/failure, HTTP status |
| Lead normalization | Resulting lead shape (without sensitive data) |
| Socket.IO emit | Event name, connected client count |
| Socket.IO connection | Client connected/disconnected |

What not to log:
- Access tokens
- App Secret
- Full lead personal data (especially in non-development environments)

The goal is to be able to trace any failure from webhook receipt to realtime delivery without exposing credentials.

---

## 17. Implementation / Repository Mapping

```
MetaLeadPulse/
│
├── docs/
│   ├── 01-problem-understanding.md
│   ├── 02-meta-integration-research.md
│   ├── 03-architecture.md (this file)
│   └── decisions/
│       ├── 001-realtime-communication.md
│       └── 002-no-persistent-storage.md
│
├── backend/
│   └── src/
│       ├── webhook/    ← /webhook endpoint, Meta event handling
│       ├── meta/       ← Graph API client, token management
│       ├── leads/      ← normalization, Lead model
│       └── realtime/   ← Socket.IO server, event emission
│
├── mobile/
│   └── src/
│       ├── screens/    ← LeadsScreen
│       └── services/   ← Socket.IO client
│
├── .env.example
└── README.md
```

---

## 18. Open Technical Questions

Carryover from the research phase — still to be confirmed during implementation:

- **Meta app mode for testing:** Official docs say the Lead Testing Tool cannot be used in Development mode. The exact steps to move the app to the right mode need hands-on verification. This is likely the first configuration blocker.
- **Required permissions in test scenario:** The docs list five permissions for the full integration. Whether all five are needed when testing against your own Page in a single-developer setup needs confirmation.
- **Page Access Token lifetime:** For the demo, a manually obtained long-lived token is probably sufficient. The process for generating one needs to be verified.
- **Exact webhook payload from the testing tool:** The testing tool creates organic leads with no associated ad. Whether `adgroup_id` / `ad_id` are present, zero, or absent in the payload needs to be confirmed against actual testing.
- **Graph API version:** Docs currently reference v26.0. Confirm the current stable version at implementation time.
- **Socket.IO + Expo compatibility:** Socket.IO's React Native client has had version compatibility issues with Expo in the past. This needs to be verified before the approach is locked in. If there's an incompatibility, the fallback is raw WebSocket (available natively in React Native).
- **Immediate 200 response pattern:** Whether to use `process.nextTick`, `setImmediate`, or just fire-and-forget the async retrieval — the right approach for ensuring Meta's 200 response isn't blocked by the Graph API call.

---

## 19. Architecture Acceptance Criteria

- [x] Major components are identified and their responsibilities are defined
- [x] Communication boundaries between all components are clear
- [x] Webhook and Graph API roles are kept distinct
- [x] Meta integration is isolated in the backend — React Native has no Meta credentials
- [x] The realtime path supports the assignment's no-manual-interaction requirement
- [x] Important failure cases are documented
- [x] Unnecessary infrastructure is intentionally excluded with reasoning
- [x] Architecture decisions are linked to ADRs
- [x] PoC limitations are documented
- [x] The architecture can be walked through in the required architecture/code Loom
