let io = null;

function init(socketServer) {
    io = socketServer;
    console.log('Realtime publisher initialized');
}

function publishLead(lead) {
    if (!io) {
        throw new Error('Realtime publisher not initialized. Call init(io) first.');
    }

    const connectedClients = io.engine.clientsCount;
    console.log(`Emitting new-lead to ${connectedClients} connected client(s)`);

    io.emit('new-lead', lead);

    console.log('new-lead emitted — lead id:', lead.id);
}

module.exports = { init, publishLead };
