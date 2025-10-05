import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { Route } from "./+types";
import { useSocket } from "contexts/SocketContext";
import { usePlayerStore } from "store/playerStore";
import { api } from "utils/api";
import { HTTP_METHOD } from "constants/global.constants";

type LobbyProps = {} & Route.ComponentProps;

const Lobby = ({ params }: LobbyProps) => {
  const { socket, connect, disconnect } = useSocket();
  const { roomId } = params;
  const { playerId, auth } = usePlayerStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        let id = playerId;
        if (!id) {
          const result = await auth();
          if (!result) {
            throw new Error("Authentication failed");
          }

          id = result.playerId;
        }

        if (!id) throw new Error("Authentication failed");

        connect();
      } catch (error) {
        console.error(error);
      }
    };

    const cleanup = () => disconnect();
    //
    // initialize();
    return cleanup;
  }, []);

  if (loading) {
    return <p>Loading....</p>;
  }

  return <div></div>;
};

export default Lobby;
