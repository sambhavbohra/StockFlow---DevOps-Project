import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local development only: forward /api to the FastAPI backend.
const proxy = { "/api": process.env.API_URL ?? "http://localhost:8000" };

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, proxy },
  preview: { proxy },
});
