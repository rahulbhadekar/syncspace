import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import Message from "./models/message.js";

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// simple route
app.get("/", (req, res) => {
  res.send("SyncSpace API running...");
});

// routes
app.use("/api/auth", authRoutes);

// load all messages
app.get("/messages", async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error fetching messages" });
  }
});

// MongoDB connect
mongoose.connect("mongodb://127.0.0.1:27017/syncspace")
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log(err));

// create http server
const server = http.createServer(app);

// socket server
const io = new Server(server, {
  cors: { origin: "*" }
});


// ⭐ STORE ONLINE USERS ⭐
let users = {}; // socketId -> username


// socket connection
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // ⭐ USER JOIN ⭐
  socket.on("join", (username) => {
    users[socket.id] = username;
    console.log("👤 Joined:", username);

    // send updated users list
    io.emit("usersList", users);
  });

  // ⭐ GLOBAL MESSAGE ⭐
  socket.on("sendMessage", async (data) => {
    try {
      const newMessage = new Message({
        text: data.text,
        sender: data.sender || "Anonymous",
      });

      await newMessage.save();

      io.emit("receiveMessage", {
        text: newMessage.text,
        sender: newMessage.sender
      });

    } catch (error) {
      console.log("❌ Message Error:", error);
    }
  });

  // ⭐ PRIVATE MESSAGE ⭐
  socket.on("privateMessage", ({ to, text, sender }) => {

    // send to receiver
    io.to(to).emit("receivePrivateMessage", {
      text,
      sender
    });

    // send back to sender
    socket.emit("receivePrivateMessage", {
      text,
      sender
    });

  });

  // ⭐ TYPING ⭐
  socket.on("typing", (username) => {
    socket.broadcast.emit("typing", username);
  });

  // ⭐ DISCONNECT ⭐
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);

    delete users[socket.id];

    // update users list
    io.emit("usersList", users);
  });

});


// start server
server.listen(5000, () => {
  console.log("🚀 Server running on 5000");
});