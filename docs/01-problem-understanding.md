# Problem Understanding

This project is a PoC that demonstrates a real-time integration between Meta Lead Ads and a React Native client. When a lead is submitted through Meta's Lead Testing Tool, it should appear live in an already-open React Native app — no manual device interaction required.

---

## 1. Problem Statement

Meta Lead Ads collect user information through forms embedded in Meta's platform. When a user submits a form, Meta generates a lead and fires a webhook event to a registered backend endpoint.

The challenge here is getting that lead from Meta into a mobile app in real time. The app is already open when the lead is submitted, so the approach needs a push mechanism — the backend receives the Meta event, processes it, and pushes the lead to the connected client.

---

## 2. Objective

The objective is to demonstrate the full event flow end to end: from a test lead submission on Meta's platform, through the backend, to the React Native app — without any manual action on the device.

This is a PoC. The goal is to prove the integration works, not to build a production-ready system.

---

## 3. Context

This is a technical assignment PoC. It is not a product feature for a real ad campaign.

The context: demonstrate that a backend service can receive a Meta Lead Ads webhook event and forward the lead data to a connected React Native client in real time. Real ads are not needed; Meta provides a Lead Testing Tool for exactly this purpose.

---

## 4. System / User Flow

```
Test lead submitted via Meta Lead Testing Tool
        ↓
Meta creates the lead and fires a webhook event
        ↓
Backend receives the webhook event
        ↓
Backend retrieves the full lead data from Meta's API
        ↓
Backend pushes the lead to connected clients in real time
        ↓
React Native app receives the update
        ↓
Lead appears in the app's list screen
```

The backend sits between Meta and the app. Meta does not talk to the app directly. The real-time push from backend to app is the key part of the integration — the exact mechanism (WebSocket, SSE, or similar) will be decided in the architecture document.

---

## 5. Functional Requirements

**FR-01** — The backend must expose an HTTP endpoint that Meta can send webhook events to.

**FR-02** — The backend must verify incoming webhook requests from Meta (token-based verification at minimum for the PoC).

**FR-03** — When a `leadgen` event is received, the backend must retrieve the corresponding lead data from Meta's API.

**FR-04** — The backend must push the retrieved lead data to all currently connected React Native clients in real time.

**FR-05** — The React Native app must display an updated leads list when a new lead is received, without requiring a manual refresh or any other device interaction.

**FR-06** — The integration must work correctly with test leads submitted via Meta's Lead Testing Tool.

---

## 6. Non-Functional Requirements

**NFR-01** — The lead should appear in the app within a few seconds of submission. No specific SLA; this is a PoC running locally or on a simple server.

**NFR-02** — Secrets (access tokens, app credentials) must not be committed to the Git repository. Use environment variables.

**NFR-03** — The project must be reproducible using the setup instructions in the README. Another developer should be able to run it.

**NFR-04** — Errors in the backend (failed webhook, failed API call) should produce visible logs so they can be diagnosed during development.

---

## 7. Acceptance Criteria

1. The React Native app is already open and showing the leads list screen.
2. A test lead is submitted using Meta's Lead Testing Tool.
3. The backend receives the webhook event from Meta.
4. The backend successfully retrieves the lead data from Meta's API.
5. The lead data is pushed to the connected React Native client.
6. The lead appears in the app's list without any manual action on the device.
7. The full project (backend + React Native app + setup instructions) is committed to a Git repository.
8. A Loom demo showing the above flow can be recorded.
9. A second Loom explaining the code and architecture can be recorded.

---

## 8. Scope

### In Scope

- Backend service to receive and verify Meta webhook events
- Integration with Meta's API to retrieve lead data after a webhook event
- Real-time push from backend to connected React Native client
- React Native screen that displays incoming leads live
- Setup and configuration documentation
- Testing via Meta Lead Testing Tool only

### Out of Scope

- Real Meta ad campaigns
- User authentication in the React Native app
- Persistent lead storage / database
- Full CRM or lead management features
- Analytics, reporting, or dashboards
- Production infrastructure or deployment
- Complex UI design
- Multi-user or multi-client scenarios beyond what the demo requires

---

## 9. Assumptions

- **A-01:** Meta's Lead Testing Tool is available and functional for simulating lead submissions.
- **A-02:** The React Native app will be running on a simulator or connected device during the demonstration.
- **A-03:** The backend will be accessible from Meta's servers (via ngrok or a simple public endpoint) for the duration of testing.
- **A-04:** Only the fields needed for the demo (e.g. name, email, phone) will be captured from the lead payload.
- **A-05:** This is a PoC — no production-level reliability, scalability, or security is expected.
- **A-06:** A single connected client is sufficient for the demonstration.

---

## 10. Constraints

These are taken directly from the assignment:

- Meta's Lead Testing Tool must be used to simulate submissions. Real ads are not required.
- The React Native app must already be open when the lead is submitted.
- The lead must appear in the app without any manual interaction with the device.
- The solution must be submitted as a Git repository.
- A list of assumptions must be provided with the submission.
- A Loom video demonstrating the working flow is required (max 5 minutes).
- A second Loom explaining the code and architecture is required.
- The solution must be the candidate's own work.
- Deadline is one week from assignment receipt.




