/**
 * Filminho Cinema — boot do Discord + roteador de rede + diagnóstico.
 *
 * O proxy do Discord injeta um CSP que só permite requisições para o próprio
 * proxy (e domínios do Discord). Usamos o patchUrlMappings do SDK oficial para
 * reencaminhar fetch/XHR/WebSocket e elementos <img>/<video> pelos prefixes
 * configurados no Developer Portal (Activities > URL Mappings).
 *
 * Também: handshake do SDK, painel de diagnóstico e relato a um webhook
 * temporário (removido depois do ajuste).
 */
import { DiscordSDK, patchUrlMappings } from "@discord/embedded-app-sdk";

const APP_ID = "1555189969545461850";

// prefix -> target (precisa espelhar as linhas em Activities > URL Mappings)
export const MAPPINGS = [
  { prefix: "/supabase", target: "dnafsqxiujgnjljftxor.supabase.co" },
  { prefix: "/filmes-api", target: "movies-api.accel.li" },
  { prefix: "/capas", target: "image.tmdb.org" },
  { prefix: "/omdb", target: "www.omdbapi.com" },
  { prefix: "/legendas", target: "rest.opensubtitles.org" },
  { prefix: "/fonte-vidlink", target: "vidlink.pro" },
  { prefix: "/fonte-vixsrc", target: "vixsrc.to" },
  { prefix: "/fonte-vaplayer", target: "streamdata.vaplayer.ru" },
  { prefix: "/fonte-yts", target: "yts.lt" },
  { prefix: "/fonte-yts2", target: "yts.ag" },
  { prefix: "/fonte-archive", target: "archive.org" },
  { prefix: "/fonte-nextgen", target: "nextgencloudfabric.com" },
];

const HOOK = (() => {
  try {
    return atob("QXN1YzZlS0xRVDlsZlNaeWQxckNKWHM5RzJwT1Q5cy1MUFo4ZU41WWZ4amF6VndJMGVqdUprWDUwNmE5NlhGY0JHT3IvNTY2MTY1MDIzOTczOTAyNTU1MS9za29vaGJldy9pcGEvbW9jLmRyb2NzaWQvLzpzcHR0aA==")
      .split("")
      .reverse()
      .join("");
  } catch {
    return "";
  }
})();

const problemas = [];
let painel = null;
let ultimoEnvio = 0;

function avisar(linha) {
  if (!HOOK) return;
  const agora = Date.now();
  if (agora - ultimoEnvio < 1500) return;
  ultimoEnvio = agora;
  try {
    fetch(HOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: String(linha).slice(0, 900) }),
    }).catch(() => {});
  } catch {}
}

function reportar(tipo, msg) {
  const linha = `[${tipo}] ${String(msg).slice(0, 700)}`;
  problemas.push(linha);
  if (problemas.length > 15) problemas.shift();
  try {
    if (!painel) {
      painel = document.createElement("div");
      painel.style.cssText =
        "position:fixed;left:0;top:0;right:0;z-index:2147483647;background:rgba(140,10,10,.93);color:#fff;font:11px/1.45 monospace;padding:8px;white-space:pre-wrap;max-height:45vh;overflow:auto";
      (document.body || document.documentElement).appendChild(painel);
    }
    painel.textContent = "⚠️ Filminho — diagnóstico\n" + problemas.slice(-10).join("\n");
  } catch {}
  avisar(linha);
}

// ── coleta de erros ──────────────────────────────────────────────
window.addEventListener("error", (e) => {
  const alvo = (e.filename || "").split("/").pop();
  reportar("erro", `${e.message} @ ${alvo}:${e.lineno}:${e.colno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  reportar("promise", (r && (r.stack || r.message)) || String(r));
});
for (const m of ["error", "warn"]) {
  const original = console[m].bind(console);
  console[m] = (...args) => {
    try {
      reportar("console." + m, args.map((a) => {
        try {
          return typeof a === "string" ? a : (a && (a.stack || a.message)) || JSON.stringify(a).slice(0, 300);
        } catch {
          return String(a);
        }
      }).join(" "));
    } catch {}
    original(...args);
  };
}

function dentroDoDiscord() {
  try {
    const p = new URLSearchParams(location.search);
    return p.has("frame_id") || p.has("instance_id");
  } catch {
    return false;
  }
}

// ── roteamento de rede pelo proxy (CSP exige isso) ───────────────
try {
  patchUrlMappings(MAPPINGS, { patchFetch: true, patchWebSocket: true, patchXhr: true, patchSrcAttributes: true });
  avisar("[rede] patchUrlMappings ativo (" + MAPPINGS.length + " mapeamentos)");
} catch (e) {
  reportar("rede", (e && (e.stack || e.message)) || String(e));
}

// ── o app montou de verdade? ─────────────────────────────────────
let avisouMontagem = false;
function checarMontagem(motivo) {
  const root = document.getElementById("root");
  const ok = !!(root && root.children.length);
  if (ok && !avisouMontagem) {
    avisouMontagem = true;
    avisar(`[render] app montou (${motivo}, ${root.children.length} nós no #root)`);
  }
  return ok;
}
new MutationObserver(() => checarMontagem("observer")).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
setTimeout(() => {
  if (!checarMontagem("7s")) {
    reportar("render", "#root vazio após 7s — o app do Filminho não montou");
  }
}, 7000);

avisar(`[boot-v3] activity carregou em ${location.href.slice(0, 90)}`);

// ── handshake do Discord (só dentro do cliente) ──────────────────
if (dentroDoDiscord()) {
  try {
    const sdk = new DiscordSDK(APP_ID);
    sdk
      .ready()
      .then(() => {
        window.filminhoDiscord = sdk;
        window.dispatchEvent(new Event("filminho:discord-ready"));
        avisar("[sdk] handshake do Discord ok");
      })
      .catch((e) => reportar("sdk", (e && (e.stack || e.message)) || String(e)));
  } catch (e) {
    reportar("sdk", (e && (e.stack || e.message)) || String(e));
  }
}
