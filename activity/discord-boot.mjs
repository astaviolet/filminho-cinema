/**
 * Filminho Cinema — boot do Discord + roteador de rede + diagnóstico.
 *
 * - patchUrlMappings: reencaminha fetch/XHR/WebSocket e <img>/<video> pelos
 *   prefixes do Developer Portal (o CSP do proxy bloqueia o resto).
 * - Bolha de diagnóstico recolhível (não cobre a tela) com botão de copiar.
 *   Temporária — sai quando o app estiver 100%.
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
  { prefix: "/tmdb", target: "api.themoviedb.org" },
  { prefix: "/itunes", target: "itunes.apple.com" },
  { prefix: "/jikan", target: "api.jikan.moe" },
  { prefix: "/tvmaze", target: "api.tvmaze.com" },
  { prefix: "/fonte-vidlink", target: "vidlink.pro" },
  { prefix: "/fonte-vixsrc", target: "vixsrc.to" },
  { prefix: "/fonte-vaplayer", target: "streamdata.vaplayer.ru" },
  { prefix: "/fonte-yts", target: "yts.lt" },
  { prefix: "/fonte-yts2", target: "yts.ag" },
  { prefix: "/fonte-archive", target: "archive.org" },
  { prefix: "/fonte-nextgen", target: "nextgencloudfabric.com" },
];

const problemas = [];
let bolha = null;
let painel = null;
let lista = null;

function desenhar() {
  try {
    if (!bolha) {
      bolha = document.createElement("button");
      bolha.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(140,10,10,.95);color:#fff;border:0;border-radius:999px;padding:6px 12px;font:bold 12px sans-serif;cursor:pointer";
      bolha.textContent = "⚠️ 0";
      bolha.addEventListener("click", () => {
        if (painel) painel.style.display = painel.style.display === "none" ? "block" : "none";
      });
      (document.body || document.documentElement).appendChild(bolha);

      painel = document.createElement("div");
      painel.style.cssText =
        "position:fixed;left:8px;right:8px;bottom:48px;z-index:2147483647;background:rgba(140,10,10,.95);color:#fff;font:11px/1.45 monospace;padding:8px;border-radius:8px;display:none";
      lista = document.createElement("div");
      lista.style.cssText = "white-space:pre-wrap;max-height:30vh;overflow:auto";
      const botao = document.createElement("button");
      botao.textContent = "📋 copiar todos os erros";
      botao.style.cssText =
        "margin-top:6px;padding:6px 10px;border:0;border-radius:6px;background:#fff;color:#7a0c0c;font:bold 12px sans-serif;cursor:pointer";
      botao.addEventListener("click", copiarErros);
      painel.appendChild(lista);
      painel.appendChild(botao);
      (document.body || document.documentElement).appendChild(painel);
    }
    bolha.textContent = "⚠️ " + problemas.length;
    lista.textContent = problemas.slice(-15).join("\n");
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
  problemas.push(`[${tipo}] ${String(msg).slice(0, 700)}`);
  if (problemas.length > 40) problemas.shift();
  desenhar();
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

// ── ambiente da Activity: correções visuais SÓ aqui (APK/site intocáveis) ──
function dentroDoDiscord() {
  try {
    const p = new URLSearchParams(location.search);
    return p.has("frame_id") || p.has("instance_id");
  } catch {
    return false;
  }
}

if (dentroDoDiscord()) {
  try {
    const estreito = window.innerWidth < 700;
    const topo = estreito ? 52 : 0; // barra do Discord (mobile) fica por cima do app
    const st = document.createElement("style");
    st.textContent =
      `#root{padding-top:${topo}px}` +
      `.screen-enter{will-change:transform;contain:paint}` +
      `.bottom-nav-pill{will-change:transform}`;
    (document.head || document.documentElement).appendChild(st);
    const reduzido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    problemas.push(
      `[ambiente] motion-reduce=${reduzido} largura=${window.innerWidth} topo=${topo}px plataforma=${(location.search.match(/platform=([^&]+)/) || [])[1] || "?"}`
    );
    desenhar();
  } catch {}
}

// ── roteamento de rede pelo proxy (CSP exige isso) ───────────────
try {
  patchUrlMappings(MAPPINGS, { patchFetch: true, patchWebSocket: true, patchXhr: true, patchSrcAttributes: true });
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
    window.__filminhoMontou = true;
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

// ── handshake do Discord (só dentro do cliente) ──────────────────
if (dentroDoDiscord()) {
  try {
    const sdk = new DiscordSDK(APP_ID);
    sdk
      .ready()
      .then(() => {
        window.filminhoDiscord = sdk;
        window.dispatchEvent(new Event("filminho:discord-ready"));
      })
      .catch((e) => reportar("sdk", (e && (e.stack || e.message)) || String(e)));
  } catch (e) {
    reportar("sdk", (e && (e.stack || e.message)) || String(e));
  }
}
