import express from 'express';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { handelStart, handelDisconnect, getType } from './lib';
import { GetTypesResult, room } from './types';

const app = express();
app.use(cors());

const server = app.listen(8000, () => console.log('Server is up, 8000'));
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

let online: number = 0;
let roomArr: room[] = [];

io.on('connection', (socket: Socket) => {
  online++;
  io.emit('online', online);

  // Manejador para 'start'
  socket.on('start', (cb?: (person: string) => void) => {
    try {
      if (typeof cb === 'function') {
        handelStart(roomArr, socket, cb, io);
      } else {
        console.warn('Client emitted start without callback');
        // Emitimos un mensaje de error específico al cliente
        socket.emit('error', { message: 'Missing callback for start event' });
      }
    } catch (error) {
      console.error('Error in start handler:', error);
    }
  });

  // Manejador para 'disconnect'
  socket.on('disconnect', () => {
    online--;
    io.emit('online', online);
    try {
      handelDisconnect(socket.id, roomArr, io);
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    }
  });

  // Manejador para 'disconnect-me'
  socket.on('disconnect-me', () => {
    try {
      handelDisconnect(socket.id, roomArr, io);
      online--;
      io.emit('online', online);
    } catch (error) {
      console.error('Error in disconnect-me handler:', error);
    }
  });

  // Manejador para 'next'
  socket.on('next', () => {
    try {
      handelDisconnect(socket.id, roomArr, io);
      handelStart(roomArr, socket, (person: string) => {
        if (socket.connected) {
          socket.emit('start', person);
        } else {
          console.warn('Socket not connected, cannot emit start');
        }
      }, io);
    } catch (error) {
      console.error('Error in next handler:', error);
    }
  });

  // ICE candidate
  socket.on('ice:send', ({ candidate }: { candidate: RTCIceCandidate }) => {
    try {
      const type: GetTypesResult = getType(socket.id, roomArr);
      if (type && 'type' in type) {
        const target = type.type === 'p1' ? type.p2id : type.p1id;
        if (target) io.to(target).emit('ice:reply', { candidate, from: socket.id });
      }
    } catch (error) {
      console.error('Error in ice:send handler:', error);
    }
  });

  // SDP offer/answer
  socket.on('sdp:send', ({ sdp }: { sdp: RTCSessionDescription }) => {
    try {
      const type = getType(socket.id, roomArr);
      if (type && 'type' in type) {
        const target = type.type === 'p1' ? type.p2id : type.p1id;
        if (target) io.to(target).emit('sdp:reply', { sdp, from: socket.id });
      }
    } catch (error) {
      console.error('Error in sdp:send handler:', error);
    }
  });

  // Chat
  socket.on('send-message', (input: string, userType: string, roomid: string) => {
    try {
      if (typeof input === 'string' && typeof roomid === 'string') {
        const prefix = userType === 'p1' ? 'You: ' : 'Stranger: ';
        socket.to(roomid).emit('get-message', input, prefix);
      }
    } catch (error) {
      console.error('Error in send-message handler:', error);
    }
  });

  // Typing
  socket.on('typing', ({ roomid, isTyping }: { roomid: string; isTyping: boolean }) => {
    try {
      if (typeof roomid === 'string') {
        socket.to(roomid).emit('typing', isTyping);
      }
    } catch (error) {
      console.error('Error in typing handler:', error);
    }
  });

  // Reconnect
  socket.on('reconnect', (attemptNumber: number) => {
    console.log(`Client reconnected after ${attemptNumber} attempts`);
    socket.emit('reconnected');
  });
});
