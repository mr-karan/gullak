import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The webapp is served same-origin by the pi-server in production (see
// src/routes/web.ts). In dev, Vite proxies /v1/* to the local pi-server so the
// SPA talks to the real API without CORS.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-maskable.svg"],
      manifest: {
        name: "Gullak",
        short_name: "Gullak",
        description: "Local-first expense tracker and money manager.",
        id: "/",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        background_color: "#f4f1ea",
        theme_color: "#f4f1ea",
        orientation: "portrait-primary",
        categories: ["finance", "productivity"],
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // Keep it simple: precache the built shell, network-first for API.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/v1\//],
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
