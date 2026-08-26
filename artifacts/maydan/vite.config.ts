import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFile, writeFile } from "node:fs/promises";
export default defineConfig(async ({ command }) => {
  // PORT is only required in dev/preview (not during vite build)
  const rawPort = process.env.PORT;
  const isDev = command === "serve";

  if (isDev && !rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }

  const port = rawPort ? Number(rawPort) : 3000;

  if (rawPort && (Number.isNaN(port) || port <= 0)) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  // BASE_PATH defaults to "/" for production builds (Vercel, Replit static, etc.)
  const configuredBasePath = process.env.BASE_PATH || "/";
  const basePath = configuredBasePath.endsWith("/")
    ? configuredBasePath
    : `${configuredBasePath}/`;
  const serviceWorkerBuildId = Date.now().toString(36);

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      ...(command === "build"
        ? [{
            name: "version-service-worker-cache",
            apply: "build" as const,
            async closeBundle() {
              const workerPath = path.resolve(import.meta.dirname, "dist/public/service-worker.js");
              const source = await readFile(workerPath, "utf8");
              await writeFile(
                workerPath,
                source.replace("__BUILD_ID__", serviceWorkerBuildId),
                "utf8",
              );
            },
          }]
        : []),
      ...(process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
              m.default(),
            ),
          ]
        : []),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Stable chunks for foundational libraries used on every route. Keep
          // feature/UI packages automatic so lazy routes retain their own code.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/") ||
              id.includes("/wouter/")
            ) {
              return "vendor-react";
            }
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query-core")) {
              return "vendor-query";
            }
            if (id.includes("@supabase/")) return "vendor-supabase";
            return undefined;
          },
        },
      },
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
