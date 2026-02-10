import { useEffect, useState } from "react";
import type { Route } from "./+types";
import { useSocket } from "contexts/SocketContext";
import { usePlayerStore } from "store/playerStore";

type LobbyProps = {} & Route.ComponentProps;

type LobbyPlayer = {
  playerId: string;
  username?: string;
};

const Lobby = ({ params }: LobbyProps) => {
  const { socket, connect, disconnect } = useSocket();
  const { roomId } = params;
  const { playerId, auth } = usePlayerStore();
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Authenticate player if needed
        let id = playerId;
        if (!id) {
          const result = await auth();
          if (!result) throw new Error("Authentication failed");
          id = result.playerId;
        }

        // Connect the socket if not already connected
        if (!socket.connected) connect();

        // Emit join_room after socket is connected
        const emitJoin = () => socket.emit("join_room", { playerId: id });
        if (socket.connected) {
          emitJoin();
        } else {
          socket.once("connect", emitJoin);
        }

        // Define listener functions
        const handleRoomState = (data: { players: LobbyPlayer[] }) => {
          setPlayers(data.players);
          setLoading(false);
        };

        const handlePlayerJoined = (player: LobbyPlayer) => {
          setPlayers((prev) => {
            if (prev.find((p) => p.playerId === player.playerId)) return prev;
            return [...prev, player];
          });
        };

        const handlePlayerLeft = ({ playerId }: { playerId: string }) => {
          setPlayers((prev) => prev.filter((p) => p.playerId !== playerId));
        };

        // Attach listeners
        socket.on("room-state", handleRoomState);
        socket.on("player-joined", handlePlayerJoined);
        socket.on("player-left", handlePlayerLeft);
      } catch (error) {
        console.error("Failed to initialize lobby:", error);
        setLoading(false);
      }
    };

    initialize();

    return () => {
      // Remove listeners to prevent duplicates
      socket.off("room-state");
      socket.off("player-joined");
      socket.off("player-left");
      disconnect();
    };
  }, [playerId, auth, connect, disconnect, socket, roomId]);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h2>Lobby: {roomId}</h2>
      <h3>Players:</h3>
      <ul>
        {players.map((player) => (
          <li key={player.playerId}>{player.username || player.playerId}</li>
        ))}
      </ul>
    </div>
  );
};

export default Lobby;
