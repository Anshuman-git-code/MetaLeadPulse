# ADR-002: No Persistent Storage in Initial PoC

**Status:** Decided  
**Date:** 2026-10-06

---

## Decision

Do **not** include a database or persistent storage layer in the initial PoC.

---

## Context

The assignment's acceptance criterion is: a test lead submitted through the Meta Lead Testing Tool appears live in an already-open React Native app without manual interaction.

Nothing in that criterion requires leads to be stored or retrieved after the fact. The assignment is demonstrating an event-driven real-time flow, not a lead management system.

Adding a database (MongoDB or otherwise) would introduce:
- additional setup and configuration
- connection management concerns
- schema decisions that don't affect the core behavior
- more things that can break during a one-week PoC

---

## Alternatives Considered

### MongoDB
The company's known tech stack includes MongoDB, so it could look familiar to the evaluators. But using it just for appearances without a real need is exactly the wrong reason to add infrastructure.

### SQLite / in-memory store
Lower friction than a full database. Could be used to show leads that arrived before the app opened. Still adds complexity for no benefit in the demo context.

### No storage
The PoC assumes the React Native app is already open when the lead arrives. If the app is open and connected, the lead will appear. If it's not, it won't — but that's an explicit assumption of the demo setup.

---

## Rationale

The demo setup is: app is already open → lead is submitted → lead appears. Persistence is not needed to prove that flow.

Adding MongoDB would also introduce a potential confusion: the evaluator might think MongoDB is part of the integration mechanism, when it isn't.

If it turns out during implementation that showing historical leads (leads that arrived before the current app session) is necessary for the demo to make sense, this decision can be revisited. An in-memory array on the backend (not a database) might be sufficient even then.

---

## Consequences

- Backend holds no state across restarts.
- Leads received before the client connects are not delivered to that client.
- For the demo, this is acceptable — the app must be open and connected before the test lead is submitted.
- If the project ever grows beyond the PoC, persistence would be one of the first things to add.
