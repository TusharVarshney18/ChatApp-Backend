const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleGenAI } = require('@google/genai'); // Correct import

require('dotenv').config(); // Load environment variables
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const server = http.createServer(app);

const io = new Server(server, {
   cors: {
      origin: ['https://chat-app-frontend-lime.vercel.app', 'http://localhost:3000'], // Allow specific frontend URLs
      methods: ["GET", "POST"]
   }
});

// Define the root route
app.get('/', (req, res) => {
   res.send('Welcome to the Socket Project!');
});

io.on('connection', (socket) => {
   console.log(`User connected: ${socket.id}`);

   // Handle joining a room
   socket.on('join_room', ({ room, username }) => {
      socket.join(room);
      socket.username = username; // Store the username in the socket object
      console.log(`User with ID: ${socket.id} and username: ${username} joined room: ${room}`);
   });

   // Handle leaving a room
   socket.on('leave_room', (room) => {
      socket.leave(room);
      console.log(`User with ID: ${socket.id} left room: ${room}`);
   });

   // Handle getting members of a room
   socket.on('get_members', (room) => {
      const members = Array.from(io.sockets.adapter.rooms.get(room) || []).map((id) => {
         const clientSocket = io.sockets.sockets.get(id);
         return clientSocket?.username || 'Unknown'; // Retrieve username from socket
      });
      socket.emit('members_list', members);
   });

   // Handle sending a message
   socket.on('send_message', (data) => {
      console.log('Message received:', data);

      // Broadcast the user's message to all clients in the room
      io.in(data.room).emit('receive_message', {
         author: data.author,
         message: data.message,
         time: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata' // Set timezone to IST
         }),
      });
   });

   // Handle AI-specific messages
   socket.on('send_ai_message', async (data) => {
      try {
         const chat = ai.chats.create({
            model: "gemini-2.0-flash",
            history: [
               {
                  role: "user",
                  parts: [{ text: data.message }],
               },
            ],
         });

         const response = await chat.sendMessage({
            message: data.message,
         });


         // Send AI response back to the client who sent the message
         socket.emit('receive_ai_message', {
            author: 'AI',
            message: response.text,
            time: new Date().toLocaleTimeString('en-US', {
               hour: '2-digit',
               minute: '2-digit',
               hour12: true,
               timeZone: 'Asia/Kolkata' // Set timezone to IST
            }),
         });
      } catch (error) {
         console.error('Error generating AI response:', error);

         // Send error response back to the client
         socket.emit('receive_ai_message', {
            author: 'AI',
            message: 'Sorry, something went wrong. Please try again later.',
            time: new Date().toLocaleTimeString('en-US', {
               hour: '2-digit',
               minute: '2-digit',
               hour12: true,
               timeZone: 'Asia/Kolkata' // Set timezone to IST
            }),
         });
      }
   });

   // Handle typing events
   socket.on('typing', (data) => {
      console.log(`${data.author} is typing in room: ${data.room}`);
      socket.to(data.room).emit('typing', data.author);
   });

   // Handle stop typing events
   socket.on('stop_typing', (data) => {
      console.log(`${data.author} stopped typing in room: ${data.room}`);
      socket.to(data.room).emit('stop_typing');
   });

   // Handle disconnection
   socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
   });
});

const PORT = process.env.PORT || 3002; // Use Render's PORT environment variable or fallback to 3002

server.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});



