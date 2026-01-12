import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/

export default defineConfig(() => {
  const isPreviewMode = process.env.VITE_PREVIEW_MODE === "1";

  return {
    plugins: [tailwindcss(), react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    server: {
      port: 5173,

      host: "0.0.0.0", // Required for tunnel access

      ...(isPreviewMode
        ? {}
        : {
            allowedHosts: ["dev.queryplusplus.app", ".loca.lt", ".ngrok-free.dev"],
            hmr: {
              protocol: "wss",
              host: "dev.queryplusplus.app",
              clientPort: 443,
            },
            proxy: {
              "/api": {
                target: "http://127.0.0.1:3000",
                changeOrigin: true,
              },
            },
          }),
    },
  };
});
