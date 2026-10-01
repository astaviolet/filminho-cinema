/** Servidor estático mínimo da Activity (dev/teste). Nunca usado em produção. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT || 5173);
const raiz = new URL("./activity/", import.meta.url);
const tipos = {
  "index.html": "text/html; charset=utf-8",
  "app.bundle.js": "text/javascript; charset=utf-8",
};

createServer(async (req, res) => {
  const caminho = (req.url || "/").split("?")[0];
  const arquivo = caminho === "/" ? "index.html" : caminho.replace(/^\/+/, "");
  if (!(arquivo in tipos)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("não encontrado");
    return;
  }
  try {
    const corpo = await readFile(new URL(arquivo, raiz));
    res.writeHead(200, {
      "content-type": tipos[arquivo],
      "cache-control": "no-store",
      // O proxy do Discord embute a Activity em iframe.
      "access-control-allow-origin": "*",
    });
    res.end(corpo);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("erro");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[filminho-activity] servindo em http://0.0.0.0:${PORT}`);
});
