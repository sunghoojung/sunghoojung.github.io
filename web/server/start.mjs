import { fileURLToPath } from "node:url";
import { startProdServer } from "vinext/server/prod-server";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

await startProdServer({
  outDir: fileURLToPath(new URL("../dist/", import.meta.url)),
  port: Number(option("--port", process.env.PORT || "3000")),
  host: option("--hostname", "0.0.0.0"),
});
