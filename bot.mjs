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
