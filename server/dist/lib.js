"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handelStart = handelStart;
exports.handelDisconnect = handelDisconnect;
exports.getType = getType;
const uuid_1 = require("uuid");
function handelStart(roomArr, socket, cb, io) {
    // check available rooms
    let availableroom = checkAvailableRoom();
    if (availableroom.is) {
        socket.join(availableroom.roomid);
        cb('p2');
        closeRoom(availableroom.roomid);
        if (availableroom === null || availableroom === void 0 ? void 0 : availableroom.room) {
            io.to(availableroom.room.p1.id).emit('remote-socket', socket.id);
            socket.emit('remote-socket', availableroom.room.p1.id);
            socket.emit('roomid', availableroom.room.roomid);
        }
    }
    // if no available room, create one
    else {
        let roomid = (0, uuid_1.v4)();
        socket.join(roomid);
        roomArr.push({
            roomid,
            isAvailable: true,
            p1: {
                id: socket.id,
            },
            p2: {
                id: null,
            }
        });
        cb('p1');
        socket.emit('roomid', roomid);
    }
    function closeRoom(roomid) {
        for (let i = 0; i < roomArr.length; i++) {
            if (roomArr[i].roomid == roomid) {
                roomArr[i].isAvailable = false;
                roomArr[i].p2.id = socket.id;
                break;
            }
        }
    }
    function checkAvailableRoom() {
        for (let i = 0; i < roomArr.length; i++) {
            if (roomArr[i].isAvailable) {
                return { is: true, roomid: roomArr[i].roomid, room: roomArr[i] };
            }
            if (roomArr[i].p1.id == socket.id || roomArr[i].p2.id == socket.id) {
                return { is: false, roomid: "", room: null };
            }
        }
        return { is: false, roomid: '', room: null };
    }
}
function handelDisconnect(disconnectedId, roomArr, io) {
    var _a, _b, _c, _d;
    // Nueva lógica para manejar reconexiones limpias
    const cleanRooms = [];
    for (let i = 0; i < roomArr.length; i++) {
        const room = roomArr[i];
        // Para el botón Exit
        if (room.p1.id === disconnectedId || room.p2.id === disconnectedId) {
            // Notificar al compañero
            const partner = room.p1.id === disconnectedId ? (_a = room.p2) === null || _a === void 0 ? void 0 : _a.id : (_b = room.p1) === null || _b === void 0 ? void 0 : _b.id;
            if (partner)
                io.to(partner).emit('disconnected');
            // Para el botón Next: Marcar la sala como disponible nuevamente
            if (room.p1.id === disconnectedId && ((_c = room.p2) === null || _c === void 0 ? void 0 : _c.id)) {
                cleanRooms.push({
                    roomid: room.roomid,
                    isAvailable: true,
                    p1: { id: room.p2.id },
                    p2: { id: null }
                });
            }
            else if (((_d = room.p2) === null || _d === void 0 ? void 0 : _d.id) === disconnectedId) {
                cleanRooms.push({
                    roomid: room.roomid,
                    isAvailable: true,
                    p1: { id: room.p1.id },
                    p2: { id: null }
                });
            }
        }
        else {
            cleanRooms.push(room);
        }
    }
    // Actualizar el array de rooms
    roomArr.length = 0;
    roomArr.push(...cleanRooms.filter(room => {
        var _a;
        if (room.p1.id === disconnectedId && !((_a = room.p2) === null || _a === void 0 ? void 0 : _a.id))
            return false;
        return true;
    }));
}
// get type of person (p1 or p2) - Sin cambios
function getType(id, roomArr) {
    for (let i = 0; i < roomArr.length; i++) {
        if (roomArr[i].p1.id == id) {
            return { type: 'p1', p2id: roomArr[i].p2.id };
        }
        else if (roomArr[i].p2.id == id) {
            return { type: 'p2', p1id: roomArr[i].p1.id };
        }
    }
    return false;
}
