import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/

export default defineConfig(({ mode }) => {
  const isPreviewMode = mode === "preview";
  const srcRoot = path.resolve(__dirname, "./src");
  const previewRoot = path.resolve(srcRoot, "./preview");

  return {
    build: {
      sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
    },

    plugins: [
      tailwindcss(),
      react(),
      process.env.SENTRY_AUTH_TOKEN
        ? sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT_WEB,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              filesToDeleteAfterUpload: ["./dist/**/*.js.map"],
            },
          })
        : null,
    ].filter(Boolean),

    resolve: {
      alias: [
        ...(isPreviewMode
          ? [
              {
                find: "@/App",
                replacement: path.resolve(previewRoot, "App.tsx"),
              },
              {
                find: "@/services/metadata",
                replacement: path.resolve(previewRoot, "services/metadata.ts"),
              },
              {
                find: "@/services/features",
                replacement: path.resolve(previewRoot, "services/features.ts"),
              },
            ]
          : []),
        { find: /^@\//, replacement: `${srcRoot}/` },
      ],
    },

    server: {
      port: 5173,

      host: "0.0.0.0", // Required for tunnel access

      ...(isPreviewMode
        ? {}
        : {
            allowedHosts: [
              "dev.queryplusplus.app",
              ".loca.lt",
              ".ngrok-free.dev",
            ],
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
