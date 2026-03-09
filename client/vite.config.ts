import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["react-pdf-highlighter", "pdfjs-dist"],
  },
  server: {
    proxy: {
      "/chat":     { target: "http://localhost:3001", changeOrigin: true },
      "/events":   { target: "http://localhost:3001", changeOrigin: true },
      "/cases":    { target: "http://localhost:3001", changeOrigin: true },
      "/memories": { target: "http://localhost:3001", changeOrigin: true },
      "/inbox":    { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
