import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = process.env.INITLE_SERVER ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      "/api": server,
      "/parties": { target: server, ws: true },
    },
  },
  build: { target: "es2022", sourcemap: true },
});
