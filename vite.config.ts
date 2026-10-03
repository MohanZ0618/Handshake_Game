import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/artifacts/**",
        "**/worker-dist/**",
        "**/.npm-cache/**",
        "**/.wrangler/**",
      ],
    },
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", ws: true },
    },
  },
});
