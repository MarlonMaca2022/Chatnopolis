const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ROOMS_FILE = path.join(__dirname, 'data', 'rooms.json');

// --- Helper Functions ---
function getData(file) {
    try {
        if (!fs.existsSync(file)) return [];
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error(`Error reading ${file}:`, err);
        return [];
    }
}

function saveData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getUsers() { return getData(USERS_FILE); }
function saveUsers(users) { saveData(USERS_FILE, users); }

function getRooms() { return getData(ROOMS_FILE); }
function saveRooms(rooms) { saveData(ROOMS_FILE, rooms); }

// --- In-Memory Guest Management ---
const usersOnline = {}; // { socketId: { username, role, room, isMuted } }
const guestBans = new Set(); // Set of banned guest usernames (simple ban)

// --- Routes ---

app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/api/rooms', (req, res) => res.json(getRooms()));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        if (user.isBanned) return res.status(403).json({ success: false, message: 'Usuario baneado.' });
        const { password: _, ...profile } = user;
        res.json({ success: true, ...profile });
    } else {
        res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }
});

app.post('/api/register', (req, res) => {
    const { username, password, name, email, country } = req.body;

    if (!username || !password || !name || !email) {
        return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
    }

    const users = getUsers();
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'El usuario ya existe' });
    }

    const newUser = {
        username,
        password, name, email, country,
        role: 'user',
        isBanned: false,
        isMuted: false,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const { password: _, ...profile } = newUser;
    res.json({ success: true, ...profile });
});

// Admin API
app.post('/api/rooms', (req, res) => {
    const { name, createdBy } = req.body;
    const rooms = getRooms();
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (rooms.find(r => r.id === id)) return res.status(400).json({ success: false, message: 'Sala ya existe' });

    const newRoom = { id, name, createdBy: createdBy || 'admin' };
    rooms.push(newRoom);
    saveRooms(rooms);

    io.emit('roomsUpdate', rooms);
    res.json({ success: true, room: newRoom });
});

app.delete('/api/rooms/:id', (req, res) => {
    const { id } = req.params;
    let rooms = getRooms();
    rooms = rooms.filter(r => r.id !== id);
    saveRooms(rooms);
    io.emit('roomsUpdate', rooms);
    res.json({ success: true });
});

// Get Users (Registered)
app.get('/api/users', (req, res) => {
    const users = getUsers().map(u => ({
        username: u.username, role: u.role, isBanned: u.isBanned, isMuted: u.isMuted
    }));
    res.json(users);
});


// --- Socket.io ---

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', ({ username, role, room }) => {
        // 1. Check Registered Bans
        const dbUsers = getUsers();
        const dbUser = dbUsers.find(u => u.username === username);
        if (dbUser && dbUser.isBanned) {
            socket.emit('forceDisconnect', 'Estás baneado (Cuenta).');
            socket.disconnect();
            return;
        }

        // 2. Check Guest Bans
        if (guestBans.has(username)) {
            socket.emit('forceDisconnect', 'Estás baneado (Nombre).');
            socket.disconnect();
            return;
        }

        const roomName = room || 'general';
        // Initialize user
        usersOnline[socket.id] = {
            username,
            role,
            room: roomName,
            isMuted: dbUser ? dbUser.isMuted : false, // Load mute status if registered
            socketId: socket.id
        };

        socket.join(roomName);

        socket.to(roomName).emit('message', {
            username: 'Sistema',
            text: `${username} se ha unido.`,
            type: 'system'
        });

        socket.emit('message', {
            username: 'Sistema',
            text: `Bienvenido a la sala ${roomName}, ${username}.`,
            type: 'system'
        });

        updateRoomUsers(roomName);
    });

    socket.on('chatMessage', (msg) => {
        const user = usersOnline[socket.id];
        if (user) {
            if (user.isMuted) {
                socket.emit('message', { username: 'Sistema', text: 'Estás silenciado.', type: 'system-error' });
                return;
            }

            io.to(user.room).emit('message', {
                username: user.username,
                text: msg,
                role: user.role,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // --- Socket Actions ---

    // Kick
    socket.on('admin:kick', (targetUsername) => {
        const user = usersOnline[socket.id];
        if (user && user.role === 'admin') {
            const targetSocketId = Object.keys(usersOnline).find(id => usersOnline[id].username === targetUsername);
            if (targetSocketId) {
                io.to(targetSocketId).emit('forceDisconnect', 'Has sido expulsado por un administrador.');
                io.sockets.sockets.get(targetSocketId)?.disconnect();
            }
        }
    });

    socket.on('privateMessage', ({ targetUsername, text }) => {
        const user = usersOnline[socket.id];
        if (user) {
            const targetSocketId = Object.keys(usersOnline).find(id => usersOnline[id].username === targetUsername);
            if (targetSocketId) {
                const messageData = {
                    username: user.username,
                    text: text,
                    isPrivate: true,
                    from: user.username,
                    to: targetUsername,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                // Send to both target and sender
                io.to(targetSocketId).emit('message', messageData);
                socket.emit('message', messageData);
            } else {
                socket.emit('message', {
                    username: 'Sistema',
                    text: `El usuario ${targetUsername} no se encuentra en línea.`,
                    type: 'system-error'
                });
            }
        }
    });

    // Ban
    socket.on('admin:ban', (targetUsername) => {
        const user = usersOnline[socket.id];
        if (user && user.role === 'admin') {
            const targetSocketId = Object.keys(usersOnline).find(id => usersOnline[id].username === targetUsername);
            const dbUsers = getUsers();
            const dbUserIndex = dbUsers.findIndex(u => u.username === targetUsername);

            if (dbUserIndex !== -1) {
                dbUsers[dbUserIndex].isBanned = true;
                saveUsers(dbUsers);
            } else {
                guestBans.add(targetUsername);
            }

            if (targetSocketId) {
                io.to(targetSocketId).emit('forceDisconnect', 'Has sido BANEADO por un administrador.');
                io.sockets.sockets.get(targetSocketId)?.disconnect();
            }
        }
    });

    // Mute
    socket.on('admin:mute', (targetUsername) => {
        const user = usersOnline[socket.id];
        if (user && user.role === 'admin') {
            const targetSocketId = Object.keys(usersOnline).find(id => usersOnline[id].username === targetUsername);
            const dbUsers = getUsers();
            const dbUser = dbUsers.find(u => u.username === targetUsername);
            if (dbUser) {
                dbUser.isMuted = !dbUser.isMuted;
                saveUsers(dbUsers);
            }
            if (targetSocketId) {
                usersOnline[targetSocketId].isMuted = !usersOnline[targetSocketId].isMuted;
                io.to(targetSocketId).emit('message', {
                    username: 'Sistema',
                    text: usersOnline[targetSocketId].isMuted ? 'Has sido silenciado.' : 'Ya puedes hablar.',
                    type: 'system'
                });
            }
        }
    });


    socket.on('disconnect', () => {
        const user = usersOnline[socket.id];
        if (user) {
            io.to(user.room).emit('message', {
                username: 'Sistema',
                text: `${user.username} ha salido.`,
                type: 'system'
            });
            delete usersOnline[socket.id];
            updateRoomUsers(user.room);
        }
    });

    function updateRoomUsers(room) {
        io.to(room).emit('roomUsers', {
            room,
            users: Object.values(usersOnline).filter(u => u.room === room)
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
