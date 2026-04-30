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

    // 2. PLAYER REQUESTS TICKETS (Sends pool to choose from)
    socket.on('requestTickets', (roomId, playerName) => {
        let room = gameRooms[roomId];
        if (room) {
            let available = room.tickets.filter(t => t.claimedBy === null);
            socket.emit('showTicketPool', available);
        } else {
            socket.emit('errorMsg', 'Admin has not started the game yet! Please wait.');
        }
    });

    // 3. PLAYER JOINS WITH SELECTED TICKETS
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

            socket.emit('ticketsConfirmed', confirmed, { drawn: room.drawnNumbers, winners: room.winners, config: room.config });
        }
    });

    // 4. ADMIN DRAWS NUMBER & ENGINE AUTO-CHECKS WINNERS
    socket.on('drawNumber', (roomId) => {
        let room = gameRooms[roomId];
        if (room && room.availableNumbers.length > 0) {
            const number = room.availableNumbers.splice(Math.floor(Math.random() * room.availableNumbers.length), 1)[0];
            room.drawnNumbers.push(number);
            io.to(roomId).emit('numberDrawn', number);

            // AUTO-CHECK ENGINE
            let drawn = room.drawnNumbers;
            room.tickets.forEach(ticket => {
                if (!ticket.claimedBy) return;

                let matchCount = ticket.numbers.filter(n => drawn.includes(n)).length;
                let r1Match = ticket.numbers.slice(0,5).filter(n => drawn.includes(n)).length === 5;
                let r2Match = ticket.numbers.slice(5,10).filter(n => drawn.includes(n)).length === 5;
                let r3Match = ticket.numbers.slice(10,15).filter(n => drawn.includes(n)).length === 5;

                room.config.patterns.forEach(pattern => {
                    if (room.winners[pattern]) return; // Pattern already won

                    let won = false;
                    if (pattern === 'Early 5' && matchCount >= 5) won = true;
                    if (pattern === 'Top Line' && r1Match) won = true;
                    if (pattern === 'Middle Line' && r2Match) won = true;
                    if (pattern === 'Bottom Line' && r3Match) won = true;
                    
                    if (won) {
                        room.winners[pattern] = ticket.claimedBy;
                        io.to(roomId).emit('winnerAnnounced', { pattern: pattern, name: ticket.claimedBy });
                    }
                });

                // Sequential Full Houses
                if (matchCount === 15) {
                    let fhPatterns = ['1st Full House', '2nd Full House', '3rd Full House'];
                    for (let fh of fhPatterns) {
                        if (room.config.patterns.includes(fh) && !room.winners[fh]) {
                            room.winners[fh] = ticket.claimedBy;
                            io.to(roomId).emit('winnerAnnounced', { pattern: fh, name: ticket.claimedBy });
                            break; 
                        }
                    }
                }
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));