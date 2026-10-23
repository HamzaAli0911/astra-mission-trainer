import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths: the build works from any folder or static host.
  base: "./",
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (/node_modules\/(react|react-dom|scheduler|zustand)\//.test(id))
            return "react";
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
