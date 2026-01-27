import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "robots.txt", "apple-touch-icon.png", "icon-512.png"],
      manifest: {
        name: "Nostr Secrets Vault",
        short_name: "Nostr Secrets",
        description: "Secure encrypted password vault built on Nostr",
        theme_color: "#9d4edd",
        background_color: "#1a0a2e",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["security", "utilities"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Skip large source maps
        globIgnores: ["**/*.map"],
        // Precache critical assets
        additionalManifestEntries: [
          { url: "/", revision: Date.now().toString() },
        ],
        runtimeCaching: [
          {
            // Cache relay connections info
            urlPattern: /^wss:\/\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.r2\.dev\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
        ],
        // Clean old caches
        cleanupOutdatedCaches: true,
        // Skip waiting for faster updates
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    // Optimize chunk size
    chunkSizeWarningLimit: 500,
    cssCodeSplit: true,
    // Source maps only in dev
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        // Optimize chunk names for caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: {
          // Core React
          "vendor-react": ["react", "react-dom"],
          // Router separate for better caching
          "vendor-router": ["react-router-dom"],
          // Crypto libs (heavy but rarely change)
          "vendor-crypto": ["@noble/secp256k1", "@scure/base"],
          // UI components
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
  // Optimize deps
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "@noble/secp256k1"],
    exclude: ["@vite/client"],
  },
  // Enable CSS optimization
  css: {
    devSourcemap: false,
  },
}));
