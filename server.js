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
    socket.on('createRoom', (roomId, password, config) => {
        if (password === ADMIN_PASSWORD) {
            socket.join(roomId);
            
            // Financial calculations from your image
            const totalRevenue = config.ticketCount * config.ticketPrice;
            const totalCommission = config.ticketCount * config.agentCommission;
            const totalProfit = totalRevenue - totalCommission;

            gameRooms[roomId] = {
                host: socket.id,
                config: {...config, totalRevenue, totalProfit},
                drawnNumbers: [],
                availableNumbers: Array.from({ length: 90 }, (_, i) => i + 1),
                players: {},
                winners: {},
                tickets: []
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

    socket.on('drawNumber', (roomId) => {
        let room = gameRooms[roomId];
        if (room && room.availableNumbers.length > 0) {
            const randomIndex = Math.floor(Math.random() * room.availableNumbers.length);
            const number = room.availableNumbers.splice(randomIndex, 1)[0];
            room.drawnNumbers.push(number);
            io.to(roomId).emit('numberDrawn', number);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on ${PORT}`));