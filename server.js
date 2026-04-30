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
    // --- ADMIN CONTROLS ---
    socket.on('createRoom', (roomId, password, config) => {
        if (password === ADMIN_PASSWORD) {
            socket.join(roomId);
            gameRooms[roomId] = {
                host: socket.id,
                config: config,
                drawnNumbers: [],
                availableNumbers: Array.from({ length: 90 }, (_, i) => i + 1),
                tickets: [],
                winners: {}
            };

            for(let i = 1; i <= config.ticketCount; i++) {
                let numbers = Array.from({length: 90}, (_, idx) => idx + 1)
                    .sort(() => 0.5 - Math.random())
                    .slice(0, 15).sort((a, b) => a - b);
                gameRooms[roomId].tickets.push({ id: i, numbers: numbers, claimedBy: null });
            }
            socket.emit('roomCreatedSuccess', gameRooms[roomId].config);
        } else {
            socket.emit('errorMsg', 'Invalid Admin Password.');
        }
    });

    socket.on('drawNumber', (roomId) => {
        let room = gameRooms[roomId];
        if (room && room.availableNumbers.length > 0) {
            const randomIndex = Math.floor(Math.random() * room.availableNumbers.length);
            const number = room.availableNumbers.splice(randomIndex, 1)[0];
            room.drawnNumbers.push(number);
            io.to(roomId).emit('numberDrawn', number);
        }
    });

    socket.on('declareWinner', (roomId, pattern, winnerName, ticketId) => {
        let room = gameRooms[roomId];
        if (room && room.host === socket.id) {
            let winningTicket = room.tickets.find(t => t.id == ticketId);
            let ticketNumbers = winningTicket ? winningTicket.numbers : null;
            room.winners[pattern] = { name: winnerName, ticketId: ticketId };
            
            io.to(roomId).emit('winnerAnnounced', { 
                pattern: pattern, name: winnerName, ticketId: ticketId,
                ticketNumbers: ticketNumbers, drawnNumbers: room.drawnNumbers
            });
        }
    });

    // --- NEW: PLAYER CONTROLS ---
    socket.on('playerJoin', (roomId, playerName, ticketId) => {
        let room = gameRooms[roomId];
        if (room) {
            let ticket = room.tickets.find(t => t.id == ticketId);
            if (ticket) {
                socket.join(roomId);
                ticket.claimedBy = playerName; // Assign ticket to player
                
                // Send the ticket directly to the player's phone
                socket.emit('playerTicketData', {
                    ticketId: ticketId,
                    playerName: playerName,
                    numbers: ticket.numbers,
                    drawnNumbers: room.drawnNumbers
                });
            } else {
                socket.emit('errorMsg', 'Ticket not found! Check your ticket number.');
            }
        } else {
            socket.emit('errorMsg', 'Game has not started yet. Please wait for the admin!');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));