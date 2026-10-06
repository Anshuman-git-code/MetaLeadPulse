# ADR-001: Realtime Communication Mechanism

**Status:** Decided  
**Date:** 2026-10-06

---

## Decision

Use **Socket.IO** as the realtime communication mechanism between the Node.js backend and the React Native client.

---

## Context

The assignment requires that a submitted lead appears in an already-open React Native app without any manual device interaction. This means the backend must push an event to the connected client — a simple fetch-on-demand approach won't work.

We need a server-to-client push mechanism. The options considered were:

1. **Long polling** — client repeatedly asks the server for updates
2. **Server-Sent Events (SSE)** — server-to-client only, unidirectional
3. **Raw WebSocket** — low-level, bidirectional, requires manual reconnection handling
4. **Socket.IO** — built on WebSocket, higher-level API, reconnection built in

---

## Alternatives Considered

### Long polling
Works, but it's inefficient and adds unnecessary latency. The interval between polls means the lead doesn't appear immediately. Doesn't fit the "real-time" intent of the assignment.

### Server-Sent Events (SSE)
Simpler than WebSocket. Server-to-client only, which is fine for this use case. The issue is React Native support — SSE doesn't have first-class native support in React Native/Expo, and workarounds add friction. Not worth it when Socket.IO is available.

### Raw WebSocket
Works well and is the underlying protocol that Socket.IO uses. The main downside for this PoC is that you have to implement reconnection, event naming, and message parsing yourself. Socket.IO handles all of that and adds almost no overhead for a project this size.

### Socket.IO
Natural fit for Node.js. The server-side library (`socket.io`) integrates with Express. The React Native client (`socket.io-client`) works with Expo, though version compatibility needs verification. Event-based API is clean and readable. Handles reconnection automatically. Well-documented.

---

## Rationale

Socket.IO wins on simplicity for this PoC:

- Event-based API is easy to read and reason about (`socket.emit('new-lead', data)`)
- Reconnection is automatic — important for the demo where the app might briefly disconnect
- Works well with Node.js/Express
- Has a React Native/Expo client
- No need to write custom message framing or reconnection logic

The one concern is Expo/React Native version compatibility. This needs to be verified at implementation time before locking in (see open questions in `03-architecture.md`).

---

## Trade-offs

| | Socket.IO |
|---|---|
| Complexity | Low for PoC |
| Control | Less than raw WebSocket, more than needed |
| Reconnection | Built-in |
| React Native support | Needs version verification |
| Production suitability | Reasonable starting point |

---

## Consequences

- Backend needs `socket.io` installed and integrated with the Express HTTP server.
- React Native app needs `socket.io-client` at a compatible version.
- Connection lifecycle (connect, disconnect, reconnect) needs to be handled in the React Native app.
- If Socket.IO's Expo compatibility turns out to be a problem during implementation, the fallback is raw WebSocket, which is available natively in React Native.
