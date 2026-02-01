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
        // FIXED: Avoid circular dependencies by being specific about what goes where
        manualChunks(id) {
          // Firebase SDK - large, rarely changes
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
          // Charts - only needed on specific pages
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'charts';
          }
          // Radix UI primitives - shared UI components
          if (id.includes('node_modules/@radix-ui')) {
            return 'radix-ui';
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          // Core React packages ONLY (be specific to avoid cycles)
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          // Let everything else bundle naturally (no explicit 'vendor' chunk)
          // This prevents circular dependencies
        }
      }
    }
  }
}));

