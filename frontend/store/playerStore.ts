import { create } from "zustand";
import { persist } from "zustand/middleware";

type PlayerState = {
  playerId: string | null;
  username: string | null;
  roomId: string | null;
  setPlayer: (playerId: string, username: string) => void;
  setRoom: (roomId: string) => void;
  clearPlayer: () => void;
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      playerId: null,
      username: null,
      roomId: null,
      setPlayer: (playerId, username) => set({ playerId, username }),
      setRoom: (roomId) => set({ roomId }),
      clearPlayer: () => set({ playerId: null, username: null, roomId: null }),
    }),
    { name: "player-storage" },
  ),
);
