import { defineConfig } from "vite";
import dns from "dns";

// Node.js 17+ での localhost / IP 解決の遅延（IPv6優先問題）を解消
dns.setDefaultResultOrder("ipv4first");

export default defineConfig({
  server: {
    port: 5173,
    host: "0.0.0.0", // すべてのインターフェースで待ち受け
    allowedHosts: true,
    strictPort: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8080",
        ws: true,
        changeOrigin: true, // プロキシ先とオリジンが異なる場合の遅延を防止
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
