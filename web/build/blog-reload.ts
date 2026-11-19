import type { Plugin } from "vite";

// `npm run dev` only: the server keeps posts in memory, so saving one restarts
// it. The open browser tab reconnects and reloads by itself.
export function blogReload(): Plugin {
  return {
    name: "blog-reload",
    apply: "serve",
    hotUpdate({ file, server }) {
      if (!/[\\/]content[\\/]blog[\\/][^\\/]+\.md$/.test(file)) return;
      if (this.environment.name === "client") void server.restart();
      return [];
    },
  };
}
