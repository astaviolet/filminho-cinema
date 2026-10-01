/**
 * Filminho Cinema — boot do Discord + roteador de rede + diagnóstico.
 *
 * - patchUrlMappings: reencaminha fetch/XHR/WebSocket e <img>/<video> pelos
 *   prefixes do Developer Portal (o CSP do proxy bloqueia o resto).
 * - Painel de diagnóstico com botão de copiar (temporário).
 * - Relatório por webhook multipart (sem preflight; temporário).
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
let lista = null;
let ultimoEnvio = 0;

// referência ANTES do patch de fetch (relatório nunca passa pelo rewriter)
const fetchOriginal = window.fetch.bind(window);

function avisar(linha) {
  if (!HOOK) return;
  const agora = Date.now();
  if (agora - ultimoEnvio < 1500) return;
  ultimoEnvio = agora;
  try {
    // multipart (FormData) = requisição simples, sem preflight de CORS
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify({ content: String(linha).slice(0, 900) }));
    fetchOriginal(HOOK, { method: "POST", body: fd, keepalive: true }).catch(() => {});
  } catch {}
}

function copiarErros() {
  const texto = "⚠️ Filminho — diagnóstico\n" + problemas.join("\n");
  const ok = () => {
    const b = painel && painel.querySelector("button");
    if (b) {
      b.textContent = "✅ copiado!";
      setTimeout(() => (b.textContent = "📋 copiar todos os erros"), 1500);
    }
  };
  const fallback = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      ok();
    } catch {}
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(ok).catch(fallback);
  } else {
    fallback();
  }
}

function reportar(tipo, msg) {
  const linha = `[${tipo}] ${String(msg).slice(0, 700)}`;
  problemas.push(linha);
  if (problemas.length > 40) problemas.shift();
  try {
    if (!painel) {
      painel = document.createElement("div");
      painel.style.cssText =
        "position:fixed;left:0;top:0;right:0;z-index:2147483647;background:rgba(140,10,10,.93);color:#fff;font:11px/1.45 monospace;padding:8px";
      const titulo = document.createElement("div");
      titulo.textContent = "⚠️ Filminho — diagnóstico";
      titulo.style.cssText = "font-weight:bold;margin-bottom:4px";
      lista = document.createElement("div");
      lista.style.cssText = "white-space:pre-wrap;max-height:32vh;overflow:auto";
      const botao = document.createElement("button");
      botao.textContent = "📋 copiar todos os erros";
      botao.style.cssText =
        "margin-top:6px;padding:6px 10px;border:0;border-radius:6px;background:#fff;color:#7a0c0c;font:bold 12px sans-serif;cursor:pointer";
      botao.addEventListener("click", copiarErros);
      painel.appendChild(titulo);
      painel.appendChild(lista);
      painel.appendChild(botao);
      (document.body || document.documentElement).appendChild(painel);
    }
    lista.textContent = problemas.slice(-12).join("\n");
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

avisar(`[boot-v4] activity carregou em ${location.href.slice(0, 90)}`);

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
