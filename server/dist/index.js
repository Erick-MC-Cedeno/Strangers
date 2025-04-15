"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const lib_1 = require("./lib");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const server = app.listen(8000, () => console.log('Server is up, 8000'));
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 10000,
    pingInterval: 5000
});
let online = 0;
let roomArr = [];
io.on('connection', (socket) => {
    online++;
    io.emit('online', online);
    // Manejador para 'start'
    socket.on('start', (cb) => {
        try {
            if (typeof cb === 'function') {
                (0, lib_1.handelStart)(roomArr, socket, cb, io);
            }
            else {
                console.warn('Client emitted start without callback');
                // Emitimos un mensaje de error específico al cliente
                socket.emit('error', { message: 'Missing callback for start event' });
            }
        }
        catch (error) {
            console.error('Error in start handler:', error);
        }
    });
    // Manejador para 'disconnect'
    socket.on('disconnect', () => {
        online--;
        io.emit('online', online);
        try {
            (0, lib_1.handelDisconnect)(socket.id, roomArr, io);
        }
        catch (error) {
            console.error('Error in disconnect handler:', error);
        }
    });
    // Manejador para 'disconnect-me'
    socket.on('disconnect-me', () => {
        try {
            (0, lib_1.handelDisconnect)(socket.id, roomArr, io);
            online--;
            io.emit('online', online);
        }
        catch (error) {
            console.error('Error in disconnect-me handler:', error);
        }
    });
    // Manejador para 'next'
    socket.on('next', () => {
        try {
            (0, lib_1.handelDisconnect)(socket.id, roomArr, io);
            (0, lib_1.handelStart)(roomArr, socket, (person) => {
                if (socket.connected) {
                    socket.emit('start', person);
                }
                else {
                    console.warn('Socket not connected, cannot emit start');
                }
            }, io);
        }
        catch (error) {
            console.error('Error in next handler:', error);
        }
    });
    // ICE candidate
    socket.on('ice:send', ({ candidate }) => {
        try {
            const type = (0, lib_1.getType)(socket.id, roomArr);
            if (type && 'type' in type) {
                const target = type.type === 'p1' ? type.p2id : type.p1id;
                if (target)
                    io.to(target).emit('ice:reply', { candidate, from: socket.id });
            }
        }
        catch (error) {
            console.error('Error in ice:send handler:', error);
        }
    });
    // SDP offer/answer
    socket.on('sdp:send', ({ sdp }) => {
        try {
            const type = (0, lib_1.getType)(socket.id, roomArr);
            if (type && 'type' in type) {
                const target = type.type === 'p1' ? type.p2id : type.p1id;
                if (target)
                    io.to(target).emit('sdp:reply', { sdp, from: socket.id });
            }
        }
        catch (error) {
            console.error('Error in sdp:send handler:', error);
        }
    });
    // Chat
    socket.on('send-message', (input, userType, roomid) => {
        try {
            if (typeof input === 'string' && typeof roomid === 'string') {
                const prefix = userType === 'p1' ? 'You: ' : 'Stranger: ';
                socket.to(roomid).emit('get-message', input, prefix);
            }
        }
        catch (error) {
            console.error('Error in send-message handler:', error);
        }
    });
    // Typing
    socket.on('typing', ({ roomid, isTyping }) => {
        try {
            if (typeof roomid === 'string') {
                socket.to(roomid).emit('typing', isTyping);
            }
        }
        catch (error) {
            console.error('Error in typing handler:', error);
        }
    });
    // Reconnect
    socket.on('reconnect', (attemptNumber) => {
        console.log(`Client reconnected after ${attemptNumber} attempts`);
        socket.emit('reconnected');
    });
});
