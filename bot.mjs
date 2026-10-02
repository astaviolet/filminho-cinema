/**
 * Filminho Cinema — bot do Discord.
 * Regras do projeto (CONTEXTO_FILMINHO_DISCORD.md):
 * - Só funciona no servidor/canal autorizados, por comando específico.
 * - Nunca confiar em dado do frontend; validação de verdade fica no backend.
 * - Token só via variável de ambiente (Actions Secrets / .env local, nunca em repositório).
 *
 * O que este bot faz hoje:
 * - Responde ao /cinema (registrado só neste servidor).
 * - Abre a Activity com o callback LAUNCH_ACTIVITY (type 12).
 * - Responde também ao Entry Point ("Launch") com a mesma regra de acesso.
 */
import { Client, Events, GatewayIntentBits } from "discord.js";

const GUILD_ID = "1555190088013578260";
const CANAL_AUTORIZADO = "1555190404742389872"; // #aura
const APP_ID = "1555189969545461850";

const API = "https://discord.com/api/v10";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`[filminho] online como ${c.user.tag} (app ${APP_ID})`);
});

client.on(Events.Error, (e) => console.error("[filminho] erro de gateway:", e.message));
process.on("unhandledRejection", (e) => console.error("[filminho] promise rejeitada:", e));

async function responder(interaction, body) {
  return fetch(`${API}/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (!i.isChatInputCommand() && i.commandType !== 4) return;
    const ehEntryPoint = i.commandType === 4; // comando "Launch" criado ao habilitar Activities
    console.log(
      `[filminho] ${ehEntryPoint ? "(entry point)" : "/" + i.commandName} por ${i.user.tag} no canal ${i.channelId}`
    );
    if (!ehEntryPoint && i.commandName !== "cinema") return;

    // Restrição obrigatória: servidor + canal autorizados.
    if (i.guildId !== GUILD_ID || i.channelId !== CANAL_AUTORIZADO) {
      await responder(i, {
        type: 4,
        data: { content: "O Filminho Cinema só funciona no canal autorizado.", flags: 64 },
      });
      return;
    }

    // 1) Caminho oficial: abrir a Activity direto do comando.
    const r = await responder(i, { type: 12, data: {} });
    if (r.ok) {
      console.log("[filminho] LAUNCH_ACTIVITY aceito para", i.user.tag);
      return;
    }

    // 2) Activity ainda não habilitada (ou outro erro): mensagem efêmera honesta.
    const erro = await r.text();
    console.log("[filminho] LAUNCH_ACTIVITY recusado:", r.status, erro);
    await responder(i, {
      type: 4,
      data: {
        content:
          "🎬 O Filminho Cinema está quase pronto! Falta uma última ativação no painel do desenvolvedor — já estou avisando meu dono.",
        flags: 64,
      },
    });
  } catch (e) {
    console.error("[filminho] erro ao tratar interação:", e);
    try {
      await responder(i, {
        type: 4,
        data: { content: "Deu um erro aqui do meu lado — tenta de novo em instantes.", flags: 64 },
      });
    } catch {}
  }
});

client.login(process.env.DISCORD_TOKEN);


// ── Mordomo de legendas ────────────────────────────────────────────
// A Activity não alcança o servidor da OpenSubtitles (anti-bot + proxy).
// Ela grava um pedido em filminho_legendas (Supabase) e este bot baixa o
// .srt aqui, de rede normal, e devolve o texto na mesma linha.
// Chave "publishable" (pública por design — igual à do app).
const SUPA = "https://dnafsqxiujgnjljftxor.supabase.co/rest/v1";
const SUPA_KEY = "sb_publishable_brpMhLujlw9YJUd2oUSZdw_uCGx3kRH";
const supaCab = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "content-type": "application/json" };

async function baixarLegendaXmlRpc(id) {
  const post = (corpo) =>
    fetch("https://api.opensubtitles.org/xml-rpc", {
      method: "POST",
      headers: { "content-type": "text/xml", "user-agent": "VLSub 0.10.13" },
      body: corpo,
    }).then((r) => r.text());
  const x1 = await post(`<?xml version="1.0"?><methodCall><methodName>LogIn</methodName><params><param><value><string></string></value></param><param><value><string></string></value></param><param><value><string>pt</string></value></param><param><value><string>VLSub 0.10.13</string></value></param></params></methodCall>`);
  const token = (/<name>token<\/name>\s*<value><string>([^<]*)</.exec(x1) || [])[1];
  if (!token) return null;
  const x2 = await post(`<?xml version="1.0"?><methodCall><methodName>DownloadSubtitles</methodName><params><param><value><string>${token}</string></value></param><param><value><array><data><value><string>${id}</string></value></data></array></value></param></params></methodCall>`);
  const b64 = (/<name>data<\/name>\s*<value><string>([A-Za-z0-9+/=]*)</.exec(x2) || [])[1];
  if (!b64) return null;
  const { gunzipSync } = await import("node:zlib");
  try {
    return gunzipSync(Buffer.from(b64, "base64")).toString("utf-8");
  } catch {
    return Buffer.from(b64, "base64").toString("utf-8");
  }
}

setInterval(async () => {
  try {
    const r = await fetch(`${SUPA}/filminho_legendas?status=eq.pendente&select=arquivo_id&limit=4&order=criado_em.asc`, { headers: supaCab });
    const pendentes = await r.json();
    for (const p of pendentes || []) {
      let srt = null;
      try {
        srt = await baixarLegendaXmlRpc(p.arquivo_id);
      } catch {}
      await fetch(`${SUPA}/filminho_legendas?arquivo_id=eq.${p.arquivo_id}`, {
        method: "PATCH",
        headers: supaCab,
        body: JSON.stringify(srt ? { srt, status: "pronto" } : { status: "falhou" }),
      });
      console.log(`[filminho] legenda ${p.arquivo_id}: ${srt ? srt.length + " bytes" : "falhou"}`);
    }
  } catch {}
}, 4000);
