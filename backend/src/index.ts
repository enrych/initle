import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import express from "express";
import db from "./db/index.js";
import { categoriesTable, titlesTable } from "./db/schema.js";
import { eq } from "drizzle-orm";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
const PORT = 8000;

// Types
type Player = { id: string; name: string; score: number };
type GameRoom = {
  id: string;
  players: Map<string, Player>;
  currentQuestion?: { id: string; initials: string; fullTitle: string };
};

// Single room
const rooms = new Map<string, GameRoom>();
rooms.set("main", { id: "main", players: new Map() });

// Generate a random question
async function generateQuestion() {
  const moviesCategory = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.name, "Movies"));

  if (!moviesCategory.length) return null;

  const [category] = moviesCategory;
  const movies = await db
    .select()
    .from(titlesTable)
    .where(eq(titlesTable.categoryId, category.id));

  if (!movies.length) return null;

  const random = movies[Math.floor(Math.random() * movies.length)];
  const initials = random.name
    .split(" ")
    .map((w) => w[0].toUpperCase())
    .join("");

  return { id: random.id.toString(), initials, fullTitle: random.name };
}

// Initialize first question and broadcast it
(async () => {
  const room = rooms.get("main")!;
  const question = await generateQuestion();
  if (question) {
    room.currentQuestion = question;
    io.to(room.id).emit("newQuestion", { initials: question.initials });
  }
})();

// Socket.IO
io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join room
  // Join room
  socket.on("joinRoom", ({ playerName }) => {
    const room = rooms.get("main")!;
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0 });
    socket.join(room.id);

    // Notify all clients with updated players
    io.to(room.id).emit("roomUpdate", Array.from(room.players.values()));

    // Always send the current question to this player
    if (room.currentQuestion) {
      socket.emit("newQuestion", { initials: room.currentQuestion.initials });
    } else {
      // Optional: tell them we're waiting for the first question
      socket.emit("waitingForQuestion");
    }
  });

  // Submit guess
  socket.on("submitGuess", async ({ guess }) => {
    const room = rooms.get("main")!;
    const question = room.currentQuestion;
    if (!question) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    if (guess.toLowerCase() === question.fullTitle.toLowerCase()) {
      player.score += 1;
      io.to(room.id).emit("roomUpdate", Array.from(room.players.values()));

      // Generate next question
      const nextQuestion = await generateQuestion();
      if (nextQuestion) {
        room.currentQuestion = nextQuestion;
        io.to(room.id).emit("newQuestion", { initials: nextQuestion.initials });
      }
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const room = rooms.get("main")!;
    room.players.delete(socket.id);
    io.to(room.id).emit("roomUpdate", Array.from(room.players.values()));
    console.log(`Player disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
