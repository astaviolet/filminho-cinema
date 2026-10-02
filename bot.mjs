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

    // Comando com filme: transmite DENTRO do Discord (canal de voz).
    const filme = (i.options && i.options.getString && i.options.getString("filme")) || null;
    const ano = (i.options && i.options.getInteger && i.options.getInteger("ano")) || null;
    const canalVoz = i.member && i.member.voice && i.member.voice.channelId;
    if (filme) {
      if (!canalVoz) {
        await responder(i, {
          type: 4,
          data: { content: "Entra no canal de voz primeiro — o filme transmite lá. 🍿", flags: 64 },
        });
        return;
      }
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        "/tmp/filminho-ordem.json",
        JSON.stringify({
          acao: "assistir",
          busca: filme.slice(0, 120),
          ano: ano ? String(ano) : null,
          canal_id: canalVoz,
          pos_s: 0,
          pedido_em: new Date().toISOString(),
        }),
        "utf8",
      );
      await responder(i, {
        type: 4,
        data: {
          content: `🎬 **Preparando ${filme}** — a transmissão começa no canal de voz em instantes. Todo mundo no Discord!`,
        },
      });
      // Se o transmissor de vídeo (conta secundária) não estiver ligado,
      // o bot oficial transmite o ÁUDIO do filme na chamada (permitido).
      if (!process.env.DISCORD_USER_TOKEN) {
        try {
          const { assistirAudio } = await import("./voz.mjs");
          assistirAudio({ busca: filme, ano: ano ? String(ano) : null, canalId: canalVoz, guild: i.guild, canalTexto: CANAL_AUTORIZADO });
        } catch (e) {
          console.error("[filminho] audio:", e?.message || e);
        }
      }
      return;
    }

    // Sem filme: instruções + link do Filminho (completo, com legendas).
    await responder(i, {
      type: 4,
      data: {
        content:
          "🍿 **Cinema aberto!**\n\n" +
          "**Dentro do Discord:** `/cinema filme:Nome do filme` — o filme transmite no canal de voz pra todo mundo.\n" +
          "**Ou pelo app:** **🍿 Abrir o Filminho** (no celular, abre aqui dentro do Discord) → filme → **Assistir junto**.\n\n" +
          "_Todo mundo no canal de voz pra conversar._ 🎬",
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "🍿 Abrir o Filminho",
                url: "https://filminhoo.lovable.app",
              },
            ],
          },
        ],
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


// ── /parar + avisos da transmissão no canal ─────────────────────────
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (!i.isChatInputCommand() || i.commandName !== "parar") return;
    if (i.guildId !== GUILD_ID || i.channelId !== CANAL_AUTORIZADO) return;
    const { writeFile } = await import("node:fs/promises");
    await writeFile("/tmp/filminho-ordem.json", JSON.stringify({ acao: "parar", pedido_em: new Date().toISOString() }), "utf8");
    await responder(i, { type: 4, data: { content: "⏹️ Transmissão parada." } });
  } catch (e) {
    console.error("[filminho] /parar:", e?.message || e);
  }
});

let estadoVisto = "";
setInterval(async () => {
  try {
    const { readFile } = await import("node:fs/promises");
    let o = null;
    try {
      o = JSON.parse(await readFile("/tmp/filminho-status.json", "utf8"));
    } catch {}
    if (!o || !o.estado || o.estado === estadoVisto) return;
    estadoVisto = o.estado;
    const textos = {
      preparando: `🎬 ${o.mensagem || "Preparando…"}`,
      entrando: "📡 Transmissão começando — entrem no canal de voz e cliquem no vídeo!",
      assistindo: "▶️ No ar! Cliquem na transmissão do canal de voz. 🍿",
      fim: "🍿 Acabou! Valeu por assistir.",
      erro: `😕 ${o.mensagem || "Deu ruim na transmissão."}`,
    };
    const msg = textos[o.estado];
    if (msg) {
      await fetch(`${API}/channels/${CANAL_AUTORIZADO}/messages`, {
        method: "POST",
        headers: { authorization: `Bot ${process.env.DISCORD_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ content: msg }),
      });
    }
  } catch {}
}, 3000);
