// ─────────────────────────────────────────────────────────────────────────────
// realtime/index.js — Realtime publisher module
//
// This module owns one responsibility: deliver a normalized Lead to all
// connected Socket.IO clients.
//
// WHY a separate module:
// The webhook handler (webhook/index.js) receives events from Meta and
// produces a normalized Lead. The Socket.IO server instance (io) lives in
// server.js. These two sides don't know about each other directly.
// This module is the bridge — it holds a reference to io and exposes a
// clean publishLead() function that any other module can call.
//
// This matches the architecture plan in docs/03-architecture.md Section 9:
//   backend/src/realtime/   ← Socket.IO server, client management, event emission
//
// HOW it connects to the rest of the system:
//
//   server.js:
//     Creates io (Socket.IO server)
//     Calls realtime.init(io) to give this module the io reference
//
//   webhook/index.js:
//     After normalizing a lead, calls publishLead(lead)
//     Does not need to know about Socket.IO directly
//
// This pattern is called dependency injection — server.js injects the io
// dependency into this module rather than this module creating it.
// The benefit: webhook/index.js stays decoupled from Socket.IO.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────────────────────
// io holds the Socket.IO server instance once init() is called.
// It starts as null — calling publishLead() before init() will throw a clear
// error rather than silently doing nothing.
let io = null;


// ─────────────────────────────────────────────────────────────────────────────
// init — store the Socket.IO server instance
// ─────────────────────────────────────────────────────────────────────────────
// Called once from server.js immediately after the Socket.IO server is created.
// Must be called before any lead arrives — otherwise publishLead() cannot emit.
//
// Parameters:
//   socketServer — the Socket.IO Server instance from server.js
//
// Why not just require server.js here?
//   Circular dependency: server.js requires webhook/ which requires realtime/
//   which would require server.js again → infinite loop.
//   Passing io as a parameter avoids that entirely.
function init(socketServer) {
    io = socketServer;
    console.log('Realtime publisher initialized');
}


// ─────────────────────────────────────────────────────────────────────────────
// publishLead — emit a normalized lead to all connected clients
// ─────────────────────────────────────────────────────────────────────────────
// This is the function that connects the Meta pipeline to the React Native app.
//
// What it does:
//   Emits a "new-lead" Socket.IO event to every currently connected client.
//   The payload is the normalized Lead object: { id, name, email, phone, createdAt }
//
// Parameters:
//   lead — normalized Lead object from leads/index.js normalizeLead()
//
// Why io.emit() and not socket.emit()?
//   socket.emit() sends to one specific connected client.
//   io.emit() broadcasts to ALL connected clients simultaneously.
//   We use io.emit() so any device that has the app open receives the lead.
//
// The event name "new-lead" matches exactly what mobile/src/app/index.tsx
// is listening for:
//   socket.on('new-lead', onNewLead)
// If this name changes here, it must change in the React Native app too.
function publishLead(lead) {
    if (!io) {
        // init() was never called — this is a programming error, not a runtime
        // error from user input. Throw so it surfaces immediately during dev.
        throw new Error('Realtime publisher not initialized. Call init(io) first.');
    }

    // io.engine.clientsCount is the number of currently connected WebSocket clients.
    // Logging this tells us whether anyone is connected when a lead arrives.
    const connectedClients = io.engine.clientsCount;
    console.log(`Emitting new-lead to ${connectedClients} connected client(s)`);

    // Emit the "new-lead" event with the full normalized Lead as the payload.
    // Every connected Socket.IO client receives this immediately.
    // The React Native app's useEffect in index.tsx handles this event.
    io.emit('new-lead', lead);

    console.log('new-lead emitted — lead id:', lead.id);
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
// Export both functions. Other modules only call these two — the internal
// io variable is never exposed.
module.exports = { init, publishLead };
