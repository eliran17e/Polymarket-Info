import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend talks to the backend through a dev proxy so the browser only ever
// sees same-origin /api/* requests (no CORS juggling during development).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8011",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
