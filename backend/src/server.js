require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
});

const realtime = require('./realtime');
realtime.init(io);

app.use((req, res, next) => {
    if (req.path.startsWith('/webhook/meta')) {
        return next();
    }
    express.json()(req, res, next);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const webhookRouter = require('./webhook');
app.use('/webhook/meta', webhookRouter);

app.post('/test/lead', (req, res) => {
    const { name, email, phone } = req.body;

    const lead = {
        id: 'test-' + Date.now(),
        name: name || 'Unknown',
        email: email || '',
        phone: phone || '',
        createdAt: new Date().toISOString(),
    };

    console.log('Test lead received:', lead);

    io.emit('new-lead', lead);

    console.log('New lead emitted to', io.engine.clientsCount, 'client(s)');

    res.status(201).json({ success: true, lead });
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Test lead:   POST http://localhost:${PORT}/test/lead`);
});
