import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Increase chunk size warning limit to avoid noise
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Manual chunking for better caching and reduced initial load
        manualChunks(id) {
          // Firebase SDK - large, rarely changes
          if (id.includes('firebase')) {
            return 'firebase';
          }
          // Charts - only needed on specific pages
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts';
          }
          // Radix UI primitives - shared UI components
          if (id.includes('@radix-ui')) {
            return 'radix-ui';
          }
          // Core vendor bundle - React, router, etc.
          if (id.includes('node_modules')) {
            // Keep lucide-react with main since icons are used everywhere
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            // React and related
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Other node_modules
            return 'vendor';
          }
        }
      }
    }
  }
}));

