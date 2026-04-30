const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let gameRooms = {};
const ADMIN_PASSWORD = "punk"; 

io.on('connection', (socket) => {
    // 1. ADMIN CREATES ROOM
    socket.on('createRoom', (roomId, password, config) => {
        if (password === ADMIN_PASSWORD) {
            socket.join(roomId);
            gameRooms[roomId] = {
                host: socket.id,
                config: config,
                drawnNumbers: [],
                availableNumbers: Array.from({ length: 90 }, (_, i) => i + 1),
                tickets: [],
                winners: {},
                players: {}
            };

            for(let i = 1; i <= config.ticketCount; i++) {
                let numbers = Array.from({length: 90}, (_, idx) => idx + 1).sort(() => 0.5 - Math.random()).slice(0, 15).sort((a, b) => a - b);
                gameRooms[roomId].tickets.push({ id: i, numbers, claimedBy: null });
            }
            socket.emit('roomCreatedSuccess', gameRooms[roomId].config);
        } else {
            socket.emit('errorMsg', 'Invalid Admin Password.');
        }
    });

    // 2. PLAYER REQUESTS TICKETS
    socket.on('requestTickets', (roomId, playerName) => {
        let room = gameRooms[roomId];
        if (room) {
            let available = room.tickets.filter(t => t.claimedBy === null);
            socket.emit('showTicketPool', available);
        } else {
            socket.emit('errorMsg', 'Admin has not started the game yet! Please wait.');
        }
    });

    // 3. PLAYER JOINS
    socket.on('claimTickets', (roomId, playerName, selectedIds) => {
        let room = gameRooms[roomId];
        if (room) {
            socket.join(roomId);
            room.players[socket.id] = playerName;
            
            let confirmed = [];
            selectedIds.forEach(id => {
                let ticket = room.tickets.find(t => t.id === id);
                if (ticket && ticket.claimedBy === null) {
                    ticket.claimedBy = playerName;
                    confirmed.push(ticket);
                }
            });

            socket.emit('ticketsConfirmed', confirmed, { drawn: room.drawnNumbers });
        }
    });

    // 4. ADMIN DRAWS NUMBER
    socket.on('drawNumber', (roomId) => {
        let room = gameRooms[roomId];
        if (room && room.availableNumbers.length > 0) {
            const number = room.availableNumbers.splice(Math.floor(Math.random() * room.availableNumbers.length), 1)[0];
            room.drawnNumbers.push(number);
            io.to(roomId).emit('numberDrawn', number);
        }
    });

    // 5. PLAYER CLAIMS A WIN
    socket.on('playerClaim', (roomId, playerName, pattern) => {
        io.to(roomId).emit('adminAlertClaim', { name: playerName, pattern: pattern });
    });

    // 6. ADMIN SAVES WINNER
    socket.on('declareWinner', (roomId, pattern, winnerName) => {
        let room = gameRooms[roomId];
        if (room && room.host === socket.id) {
            room.winners[pattern] = winnerName;
            io.to(roomId).emit('winnerAnnounced', { pattern, name: winnerName });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));