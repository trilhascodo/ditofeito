import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/embed": "http://localhost:3000",
      "/api": "http://localhost:3000",
      "/card": "http://localhost:3000",
      "/vindicacao": "http://localhost:3000",
      "/trpc": "http://localhost:3000",
      "/auth": "http://localhost:3000",
    },
  },
});
