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

            // Generate Ticket Pool
            for(let i = 1; i <= config.ticketCount; i++) {
                let numbers = Array.from({length: 90}, (_, idx) => idx + 1)
                    .sort(() => 0.5 - Math.random())
                    .slice(0, 15).sort((a, b) => a - b);
                gameRooms[roomId].tickets.push({ id: i, numbers, claimedBy: null });
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
    
    socket.on('numberDrawn', (num) => {
        document.getElementById('currentNum').innerText = num;
        document.getElementById(`dot-${num}`).classList.add('called');
        
        const speech = new SpeechSynthesisUtterance("Number " + num);
        window.speechSynthesis.speak(speech);
    });

    socket.on('declareWinner', (roomId, pattern, winnerName) => {
        let room = gameRooms[roomId];
        if (room && room.host === socket.id) {
            room.winners[pattern] = winnerName;
            io.to(roomId).emit('winnerAnnounced', { pattern, name: winnerName });
        }
    });

    // --- PLAYER CONTROLS ---
    socket.on('requestTickets', (roomId, playerName) => {
        let room = gameRooms[roomId];
        if (room) {
            // Send only tickets that haven't been picked yet
            let availableTickets = room.tickets.filter(t => t.claimedBy === null);
            socket.emit('showTicketPool', availableTickets, playerName);
        } else {
            socket.emit('errorMsg', 'The Admin has not started the game yet. Please wait!');
        }
    });

    socket.on('claimTickets', (roomId, playerName, selectedTicketIds) => {
        let room = gameRooms[roomId];
        if (room) {
            socket.join(roomId); // Connect player to the live room
            let confirmedTickets = [];
            
            selectedTicketIds.forEach(id => {
                let ticket = room.tickets.find(t => t.id === id);
                if (ticket && ticket.claimedBy === null) {
                    ticket.claimedBy = playerName;
                    confirmedTickets.push(ticket);
                }
            });
            // Send tickets and the current drawn numbers history back to player
            socket.emit('ticketsConfirmed', confirmedTickets, room.drawnNumbers);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
