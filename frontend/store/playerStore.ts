import { HTTP_METHOD } from "constants/global.constants";
import { api } from "utils/api";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type PlayerState = {
  playerId: string | null;
  username: string | null;
  roomId: string | null;
  setPlayer: ({
    playerId,
    username,
  }: {
    playerId: string;
    username: string;
  }) => void;
  setRoom: (roomId: string) => void;
  clearPlayer: () => void;
  auth: (args?: { username?: string }) => Promise<Player | void>;
};

type Player = {
  playerId: string;
  username: string;
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      playerId: null,
      username: null,
      roomId: null,
      setPlayer: ({ playerId, username }) => set({ playerId, username }),
      setRoom: (roomId) => set({ roomId }),
      clearPlayer: () => set({ playerId: null, username: null, roomId: null }),
      auth: async ({ username: usernameInput } = {}) => {
        try {
          const { playerId, username: usernameFromServer }: Player = await api(
            "auth",
            {
              method: HTTP_METHOD.POST,
              body: { username: usernameInput },
            },
          );

          set({ playerId, username: usernameFromServer });
          return { playerId, username: usernameFromServer };
        } catch (error) {
          console.error("Unable to authenticate!", error);
          throw error;
        }
      },
    }),
    { name: "player-storage" },
  ),
);
