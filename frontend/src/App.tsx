import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

type Player = { id: string; name: string; score: number };

const socket: Socket = io("http://localhost:8000", {
  transports: ["websocket"], // force WebSocket, avoids polling issues
});

export default function App() {
  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [guess, setGuess] = useState("");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
      console.log("Connected to server");
    });

    socket.on("roomUpdate", (players: Player[]) => {
      setPlayers(players);
    });

    socket.on("newQuestion", ({ initials }) => {
      setQuestion(initials);
      setGuess("");
    });

    socket.on("waitingForQuestion", () => {
      setQuestion(null); // explicitly show waiting state
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setPlayers([]);
      setQuestion(null);
    });

    return () => {
      socket.off("connect");
      socket.off("roomUpdate");
      socket.off("newQuestion");
      socket.off("waitingForQuestion");
      socket.off("disconnect");
    };
  }, []);

  const joinRoom = () => {
    if (name.trim() === "") return;
    socket.emit("joinRoom", { playerName: name });
    setJoined(true);
  };

  const submitGuess = () => {
    if (guess.trim() === "") return;
    socket.emit("submitGuess", { guess });
    setGuess("");
  };

  return (
    <div className="p-6 font-sans max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🎮 Movie Guessing Game</h1>

      {!connected && <p className="text-red-500">Not connected to server...</p>}

      {!joined ? (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-2 rounded w-full"
          />
          <button
            onClick={joinRoom}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Join Game
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Current Question:</h2>
            {question ? (
              <p className="text-xl font-mono">{question}</p>
            ) : (
              <p className="text-gray-500">⏳ Waiting for question...</p>
            )}
          </div>

          <div className="flex space-x-2 mb-6">
            <input
              type="text"
              placeholder="Your guess"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              className="border p-2 rounded flex-1"
            />
            <button
              onClick={submitGuess}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Submit
            </button>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Players & Scores:</h2>
            <ul className="space-y-1">
              {players.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="font-bold">{p.score}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
