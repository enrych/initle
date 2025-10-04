import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";

type SocketContextValue = {
  socket: Socket;
  connect: () => void;
  disconnect: () => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

type SocketProviderProps = {
  children: ReactNode;
};

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const socket = useMemo(() => {
    return io(import.meta.env.VITE_SERVER_URL, {
      autoConnect: false,
    });
  }, []);

  const connect = useCallback(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connect, disconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used inside a <SocketProvider>");
  }
  return context;
};

export default SocketProvider;
