import { useEffect } from "react";
import { io } from "socket.io-client";
import type { Route } from "./+types";
import { useSocket } from "contexts/SocketContext";
import { usePlayerStore } from "store/playerStore";

type LobbyProps = {} & Route.ComponentProps;

const Lobby = ({ params }: LobbyProps) => {
  const { socket, disconnect } = useSocket();
  const { roomId } = params;
  const { playerId } = usePlayerStore();

  useEffect(() => {
    socket;

    return () => {
      disconnect();
    };
  });
  return <div></div>;
};

export default Lobby;
