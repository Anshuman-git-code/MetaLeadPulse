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
// We need it because Socket.IO (realtime) must attach to the same HTTP server
// that Express uses. If we just called app.listen(), Socket.IO couldn't
// share that server. So we create the HTTP server manually instead.
const http = require('http');

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Bring in Socket.IO
// ─────────────────────────────────────────────────────────────────────────────
// require('socket.io') returns a class called Server.
// We name it "Server" (capital S) because that is the convention Socket.IO
// uses in its own documentation — it is a class, not a plain function.
// We will use it in Step 6 to create the realtime layer.
const { Server } = require('socket.io');

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Create the HTTP server and hand Express to it
// ─────────────────────────────────────────────────────────────────────────────
// http.createServer() needs a "request listener" — a function that runs
// every time an HTTP request arrives and decides what to do with it.
// Express's app object IS that function. It already knows how to look at
// a request, match it to the right route, and send a response.
// So we pass app directly into createServer().
// Result: every HTTP request goes through Express automatically.
const httpServer = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Attach Socket.IO to the same HTTP server
// ─────────────────────────────────────────────────────────────────────────────
// new Server(httpServer) creates the Socket.IO server and tells it to use
// our existing httpServer for its WebSocket connections.
// This means both Express (HTTP) and Socket.IO (WebSocket) share one port.
// cors option is set here because the React Native app running on a
// different origin (or IP) needs permission to connect.
// For development we allow all origins ("*"). We would restrict this in
// production.
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Tell Express to parse incoming JSON bodies
// ─────────────────────────────────────────────────────────────────────────────
// Meta's webhook will send us a POST request whose body is JSON text.
// Without this line, req.body would be undefined — Express would not know
// how to read JSON. express.json() is a middleware: it intercepts every
// incoming request, reads the body if it is JSON, parses it, and puts the
// result on req.body so our route handlers can use it.
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Define the /health route
// ─────────────────────────────────────────────────────────────────────────────
// app.get() tells Express: "when a GET request arrives at this path,
// run this function."
// The function receives two objects:
//   req — everything about the incoming request (headers, body, params…)
//   res — the tool we use to send a response back
// res.json() sends a JSON response and automatically sets the correct
// Content-Type header. We use /health so we can quickly check in a browser
// or with curl that the server is running.
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — Listen for Socket.IO client connections
// ─────────────────────────────────────────────────────────────────────────────
// io.on('connection', ...) is an event listener.
// Every time a new client (our React Native app) connects over WebSocket,
// Socket.IO fires the 'connection' event and passes us a "socket" object.
// socket represents that one specific connected client.
// Inside this callback we can:
//   - listen for events from that client  (socket.on)
//   - send events to that client          (socket.emit)
//   - detect when it disconnects          (socket.on('disconnect'))
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    // socket.id is a unique string Socket.IO assigns to each connection.
    // Logging it helps us see in the terminal when a client arrives.

    // When this client disconnects (app closed, network lost, etc.),
    // Socket.IO fires the 'disconnect' event on that socket.
    // We log it so we can see the full connection lifecycle in the terminal.
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 10 — Define the port and start listening
// ─────────────────────────────────────────────────────────────────────────────
// PORT is the number the server will occupy on our machine.
// 3000 is a common development convention — nothing special about the number,
// it just has to be a port that isn't already in use.
// process.env.PORT lets us override this from an environment variable later
// if we ever deploy somewhere that assigns its own port. For now it will
// just use 3000.
const PORT = process.env.PORT || 3000;

// httpServer.listen() is what actually starts the server.
// It binds to PORT and begins accepting incoming connections.
// The second argument is a callback — a function that runs once,
// right at the moment the server is ready. We use it to print a
// confirmation message so we know the server started successfully.
httpServer.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
