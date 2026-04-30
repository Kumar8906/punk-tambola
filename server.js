const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serves the files inside the 'public' folder
app.use(express.static('public'));

let gameRooms = {};
const ADMIN_PASSWORD = "punk"; // Your new secret password to host

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Host creates the game AND the ticket pool
    socket.on('createRoom', (roomId, password, patterns, ticketCount) => {
        if (password === ADMIN_PASSWORD) {
            socket.join(roomId);
            
            // Generate the fixed pool of tickets
            let ticketPool = [];
            for(let i = 1; i <= ticketCount; i++) {
                // Generate 15 random numbers for a ticket
                let numbers = Array.from({length: 90}, (_, idx) => idx + 1).sort(() => 0.5 - Math.random()).slice(0, 15).sort((a, b) => a - b);
                ticketPool.push({ id: i, numbers: numbers, claimedBy: null });
            }

            gameRooms[roomId] = {
                host: socket.id,
                drawnNumbers: [],
                availableNumbers: Array.from({ length: 90 }, (_, i) => i + 1),
                players: {},
                patterns: patterns,
                winners: {},
                tickets: ticketPool
            };
            socket.emit('roomCreatedSuccess');
        } else {
            socket.emit('errorMsg', 'Invalid Host Password.');
        }
    });

    // Player requests to see available tickets
    socket.on('requestTickets', (roomId, playerName) => {
        let room = gameRooms[roomId];
        if (room) {
            let availableTickets = room.tickets.filter(t => t.claimedBy === null);
            socket.emit('showTicketPool', availableTickets, playerName);
        } else {
            socket.emit('errorMsg', 'Room does not exist or hasn\'t started yet.');
        }
    });

    // Player claims their chosen tickets
    socket.on('claimTickets', (roomId, playerName, selectedTicketIds) => {
        let room = gameRooms[roomId];
        if (room) {
            socket.join(roomId);
            room.players[socket.id] = playerName;
            
            let confirmedTickets = [];
            selectedTicketIds.forEach(id => {
                let ticket = room.tickets.find(t => t.id === id);
                if (ticket && ticket.claimedBy === null) {
                    ticket.claimedBy = playerName;
                    confirmedTickets.push(ticket);
                }
            });

            socket.emit('ticketsConfirmed', confirmedTickets, {
                drawn: room.drawnNumbers,
                patterns: room.patterns,
                winners: room.winners
            });
            
            io.to(roomId).emit('sysMessage', `${playerName} joined with ${confirmedTickets.length} ticket(s).`);
        }
    });

    // Host draws a number
    socket.on('drawNumber', (roomId) => {
        let room = gameRooms[roomId];
        if (room && room.host === socket.id && room.availableNumbers.length > 0) {
            const randomIndex = Math.floor(Math.random() * room.availableNumbers.length);
            const numberDrawn = room.availableNumbers.splice(randomIndex, 1)[0];
            room.drawnNumbers.push(numberDrawn);
            io.to(roomId).emit('numberDrawn', numberDrawn);
        }
    });

    // Handle winning claims
    socket.on('claimPattern', (roomId, patternName) => {
        let room = gameRooms[roomId];
        let playerName = room.players[socket.id];
        if (room && room.patterns[patternName] && !room.winners[patternName]) {
            room.winners[patternName] = playerName;
            io.to(roomId).emit('winnerAnnounced', { pattern: patternName, name: playerName });
            io.to(roomId).emit('sysMessage', `⚡ ${playerName} has won ${patternName}!`);
        }
    });

    // Change game theme globally
    socket.on('changeTheme', (roomId, themeData) => {
        let room = gameRooms[roomId];
        if (room && room.host === socket.id) {
            io.to(roomId).emit('applyTheme', themeData);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});