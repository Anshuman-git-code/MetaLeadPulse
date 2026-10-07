// ─────────────────────────────────────────────────────────────────────────────
// LOAD ENVIRONMENT VARIABLES — must be the very first thing that runs
// ─────────────────────────────────────────────────────────────────────────────
// dotenv reads the .env file and loads every variable into process.env.
// It must run before any other code so that all later require() calls and
// config references can access process.env.META_VERIFY_TOKEN etc.
//
// require('dotenv').config() is the standard one-liner for this.
// If .env does not exist (e.g. in CI), dotenv silently does nothing —
// the variables would then come from the real environment instead.
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// server.js — The entry point for the entire backend.
//
// This file starts the HTTP server, connects Express (routing) and
// Socket.IO (realtime) onto the same port, and defines every route the
// backend currently exposes.
//
// Files that depend on this server being alive:
//   mobile/src/services/socket.ts  — connects to this server over WebSocket
//   mobile/src/app/index.tsx       — listens for "new-lead" events from here
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Bring in Express
// ─────────────────────────────────────────────────────────────────────────────
// require('express') goes into node_modules, finds the Express package,
// and returns it. We store that in a constant called "express".
// At this point, express is a function — calling it creates an app.
const express = require('express');


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Create the Express application
// ─────────────────────────────────────────────────────────────────────────────
// We call express() like a factory. It builds and returns our application
// object. We store it in "app".
// app is what we use to define routes (/health, /webhook, etc.)
// and attach middleware. Think of it as the brain of the server.
const app = express();


// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Bring in Node's built-in HTTP module
// ─────────────────────────────────────────────────────────────────────────────
// Node.js comes with a built-in module called "http".
// It knows how to speak the HTTP protocol — receive requests, send responses.
//
// WHY we need this instead of just calling app.listen():
// Socket.IO (added in Step 6) must share the exact same server instance as
// Express. If we called app.listen(), Express would create its own internal
// HTTP server and we'd have no way to hand it to Socket.IO.
// So we create the HTTP server ourselves here, pass Express into it,
// and then pass the same server to Socket.IO. One server, two purposes.
const http = require('http');


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Bring in Socket.IO
// ─────────────────────────────────────────────────────────────────────────────
// require('socket.io') returns a class called Server.
// We name it "Server" (capital S) — that is the convention in Socket.IO's
// own documentation. It is a class, not a plain function.
//
// WHY Socket.IO is needed at all:
// The assignment says a lead must appear in the React Native app without
// any manual refresh. HTTP alone can't do that — HTTP only responds when
// the client asks. Socket.IO keeps a persistent WebSocket connection open
// so the backend can PUSH data to the app at any time.
//
// mobile/src/services/socket.ts uses the matching client library
// (socket.io-client) to connect to this server.
const { Server } = require('socket.io');


// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Create the HTTP server and hand Express to it
// ─────────────────────────────────────────────────────────────────────────────
// http.createServer() needs a "request listener" — a function that runs
// every time an HTTP request arrives and decides what to do with it.
// Express's app object IS that function. It already knows how to match
// a request to the right route and send a response back.
// So we pass app directly into createServer().
// Result: every HTTP request goes through Express automatically.
const httpServer = http.createServer(app);


// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Attach Socket.IO to the same HTTP server
// ─────────────────────────────────────────────────────────────────────────────
// new Server(httpServer) creates the Socket.IO server and tells it to use
// our existing httpServer. Both Express (HTTP) and Socket.IO (WebSocket)
// now share one port.
//
// cors: { origin: '*' } — this is required because the React Native app
// connects from a different origin (different IP or port). Without CORS
// permission, the browser/device would block the connection.
// '*' means "allow any origin" — fine for development, too permissive
// for production.
//
// This "io" object is used in two places below:
//   - Step 10: to detect when clients connect/disconnect
//   - Step 9:  to emit "new-lead" events to all connected clients
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
});


// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Tell Express to parse incoming JSON bodies
// ─────────────────────────────────────────────────────────────────────────────
// express.json() is a middleware. Middleware means: a function that runs
// on every request before it reaches the route handler.
//
// What it does: when a POST request arrives with a JSON body,
// express.json() reads the raw text, parses it into a JavaScript object,
// and puts it on req.body so our route handlers can use it.
//
// Without this line:
//   req.body would be undefined everywhere.
//
// This must be registered with app.use() BEFORE any route that reads req.body,
// which is why it comes here before /test/lead and /webhook.
app.use(express.json());


// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Define the /health route
// ─────────────────────────────────────────────────────────────────────────────
// A simple GET route that returns { status: 'ok' }.
// Purpose: lets us quickly verify in a browser or with curl that the server
// is running and Express is responding correctly — before testing anything else.
//
// app.get(path, handler):
//   path    — the URL path to match
//   handler — the function to run when a GET request arrives at that path
//
// The handler receives:
//   req — everything about the incoming request
//   res — the object we use to send a response back
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});


// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — Mount the Meta webhook router
// ─────────────────────────────────────────────────────────────────────────────
// WHY this is here:
// We created backend/src/webhook/index.js which defines all Meta webhook
// routes. We import that router here and mount it at '/webhook/meta'.
//
// What this means:
//   router.get('/')  inside webhook/index.js → GET  /webhook/meta
//   router.post('/') inside webhook/index.js → POST /webhook/meta  (Phase 9)
//
// Keeping webhook logic in its own file means server.js stays clean.
// It just says "anything at /webhook/meta is handled by this module."
const webhookRouter = require('./webhook');
app.use('/webhook/meta', webhookRouter);


// ─────────────────────────────────────────────────────────────────────────────
// STEP 10 — Development test route: POST /test/lead
// ─────────────────────────────────────────────────────────────────────────────
// WHY this route exists here:
// We wrote mobile/src/app/index.tsx which listens for a "new-lead" event
// over Socket.IO. To test that screen actually works — before Meta is
// configured — we needed a way to trigger "new-lead" manually.
// This route does exactly that: receive a fake lead via HTTP POST,
// build the same lead object shape the real Meta integration will produce,
// and emit it to all connected clients.
//
// The flow this proves end-to-end:
//   curl POST /test/lead
//         ↓
//   backend receives JSON body
//         ↓
//   backend builds lead object
//         ↓
//   io.emit("new-lead", lead) → every connected Socket.IO client
//         ↓
//   mobile/src/app/index.tsx receives it → updates state → re-renders list
//
// Why io.emit() and not socket.emit()?
//   socket.emit() — sends only to one specific connected client
//   io.emit()     — broadcasts to ALL connected clients
//   We use io.emit() because any connected device should see the lead.
//
// IMPORTANT: this route is development-only. Once Meta integration is done,
// real leads come through /webhook instead. This route can be removed then.
app.post('/test/lead', (req, res) => {
    // req.body is the parsed JSON object — available because of express.json()
    // registered in Step 7 above. We destructure the three fields we expect.
    // If a field was not sent, it will be undefined — the || '' fallback
    // ensures we always have a string, never undefined, in the lead object.
    const { name, email, phone } = req.body;

    // Build the normalized lead object.
    // This exact shape is what mobile/src/app/index.tsx expects to receive.
    // The Lead type defined in that file has: id, name, email, phone, createdAt.
    // The real Meta webhook handler (built later) will produce the same shape,
    // so the React Native screen never needs to change — it always sees this.
    const lead = {
        id: 'test-' + Date.now(),       // Date.now() gives milliseconds since epoch
        // — unique enough for development testing
        name: name || 'Unknown',
        email: email || '',
        phone: phone || '',
        createdAt: new Date().toISOString(), // e.g. "2026-10-06T12:00:00.000Z"
    };

    console.log('Test lead received:', lead);

    // Emit "new-lead" to every connected Socket.IO client right now.
    // mobile/src/app/index.tsx is listening for exactly this event name.
    io.emit('new-lead', lead);

    console.log('New lead emitted to', io.engine.clientsCount, 'client(s)');

    // Respond 201 Created with the lead we emitted.
    // 201 = HTTP status for "a new resource was created successfully".
    // Returning the lead lets us verify in the terminal what was actually sent.
    res.status(201).json({ success: true, lead });
});


// ─────────────────────────────────────────────────────────────────────────────
// STEP 11 — Listen for Socket.IO client connections
// ─────────────────────────────────────────────────────────────────────────────
// WHY this block is here:
// mobile/src/services/socket.ts creates a Socket.IO client and connects to
// this server. When that connection arrives, Socket.IO fires the 'connection'
// event on io. This block is the handler for that event.
//
// Every time the React Native app opens (or reconnects), we will see a log
// line in this terminal. Every time it closes or loses network, we see the
// disconnect log. This gives us visibility into the connection lifecycle —
// essential for debugging the mobile ↔ backend link.
//
// io.on('connection', callback):
//   Socket.IO calls callback once per connecting client.
//   It passes a "socket" object — a handle to THAT specific client.
//   We can use socket.emit() to send only to this client,
//   or socket.on() to listen for events from this client.
io.on('connection', (socket) => {
    // socket.id is a unique random string Socket.IO assigns this connection.
    // Each time the app reconnects it gets a new id.
    console.log('Client connected:', socket.id);

    // 'disconnect' fires on this socket when this specific client disconnects
    // — whether because the app was closed, went to background, or lost network.
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// STEP 12 — Define the port and start listening
// ─────────────────────────────────────────────────────────────────────────────
// Everything above just sets up the configuration. Nothing actually runs until
// httpServer.listen() is called here. This is the line that opens the port
// and starts accepting real connections.
//
// process.env.PORT — if an environment variable called PORT is set (common
// on cloud hosting platforms that assign a port dynamically), use that.
// If not, fall back to 3000 for local development.
//
// mobile/src/services/socket.ts connects to http://localhost:3000 by default,
// so 3000 must match what is set there.
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    // This callback runs exactly once — the moment the server is ready.
    // We log both the base URL and the health check URL so they're easy
    // to copy and test immediately after starting.
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Test lead:   POST http://localhost:${PORT}/test/lead`);
});
