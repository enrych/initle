import { Server, Socket } from "socket.io";
import { gameService } from "../services/gameService.js";

export function registerGameSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);
    const room = gameService.getRoom("main")!;

    socket.on("joinRoom", async ({ playerName }) => {
      room.addPlayer({ id: socket.id, name: playerName, score: 0 });
      socket.join(room.id);

      io.to(room.id).emit("roomUpdate", room.getPlayers());

      if (!room.currentQuestion) {
        const q = await gameService.initQuestion(room.id);
        if (q) io.to(room.id).emit("newQuestion", { initials: q.initials });
      } else {
        socket.emit("newQuestion", { initials: room.currentQuestion.initials });
      }
    });

    socket.on("submitGuess", async ({ guess }) => {
      const question = room.currentQuestion;
      if (!question) return;
      const player = room.players.get(socket.id);
      if (!player) return;

      if (guess.toLowerCase() === question.fullTitle.toLowerCase()) {
        player.score += 1;
        io.to(room.id).emit("roomUpdate", room.getPlayers());

        const next = await gameService.initQuestion(room.id);
        if (next)
          io.to(room.id).emit("newQuestion", { initials: next.initials });
      }
    });

    socket.on("disconnect", () => {
      room.removePlayer(socket.id);
      io.to(room.id).emit("roomUpdate", room.getPlayers());
      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}
