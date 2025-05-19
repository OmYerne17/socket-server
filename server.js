const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store active users in each room
const activeUsers = new Map();

io.on('connection', (socket) => {
  const userEmail = socket.handshake.auth.email || 'Anonymous';
  const userId = socket.handshake.auth.userId;
  
  console.log(`User connected: ${userEmail} (${socket.id})`);

  socket.on('join-room', (roomId) => {
    // Join the room
    socket.join(roomId);
    
    // Add user to active users in the room
    if (!activeUsers.has(roomId)) {
      activeUsers.set(roomId, new Map());
    }
    activeUsers.get(roomId).set(userId, userEmail);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', userEmail);
    
    // Send current active users to the new user
    const roomUsers = Array.from(activeUsers.get(roomId).values());
    socket.emit('room-users', roomUsers);
    
    console.log(`User ${userEmail} joined room ${roomId}`);
  });

  socket.on('leave-room', (roomId) => {
    // Remove user from active users
    if (activeUsers.has(roomId)) {
      activeUsers.get(roomId).delete(userId);
      if (activeUsers.get(roomId).size === 0) {
        activeUsers.delete(roomId);
      }
    }
    
    // Notify others in the room
    socket.to(roomId).emit('user-left', userEmail);
    
    // Leave the room
    socket.leave(roomId);
    console.log(`User ${userEmail} left room ${roomId}`);
  });

  socket.on('chat-message', ({ roomId, message }) => {
    // Broadcast the message to everyone in the room including sender
    io.to(roomId).emit('chat-message', {
      ...message,
      user: {
        id: userId,
        email: userEmail
      }
    });
  });

  // Add new events for debate messages
  socket.on('debate-message', ({ roomId, message }) => {
    // Broadcast the debate message to everyone in the room
    io.to(roomId).emit('debate-message', message);
  });

  socket.on('debate-typing', ({ roomId, side, isTyping }) => {
    // Broadcast typing status to everyone except sender
    socket.to(roomId).emit('debate-typing', { side, isTyping });
  });

  socket.on('disconnect', () => {
    // Remove user from all rooms they were in
    activeUsers.forEach((users, roomId) => {
      if (users.has(userId)) {
        users.delete(userId);
        if (users.size === 0) {
          activeUsers.delete(roomId);
        } else {
          socket.to(roomId).emit('user-left', userEmail);
        }
      }
    });
    
    console.log(`User disconnected: ${userEmail} (${socket.id})`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
}); 