/**
 * Filminho Cinema — boot do Discord Embedded App SDK + diagnóstico.
 * Roda por baixo da UI do Filminho (idêntica ao app/APK).
 * - Handshake do SDK quando aberto dentro do Discord.
 * - Coleta erros (window/console) e mostra um painel na tela se algo quebrar.
 * - Avisa um webhook temporário de diagnóstico (removido depois do ajuste).
 */
import { DiscordSDK } from "@discord/embedded-app-sdk";

const APP_ID = "1555189969545461850";
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
      body: JSON.stringify({ content: ("```\n" + linha.slice(0, 900) + "\n```").replace(/```/g, "'''") }),
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

avisar(`[boot] activity carregou em ${location.href.slice(0, 90)}`);

// ── handshake do Discord (só dentro do cliente) ──────────────────
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
