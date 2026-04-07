import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      devOptions: {
        enabled: true
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, 
      },

      manifest: {
        name: "Secure Notes",
        short_name: "Notes",
        description: "Encrypted offline notes app",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/panda.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/panda.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});