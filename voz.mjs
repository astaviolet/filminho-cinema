/**
 * Transmissão de ÁUDIO do filme no canal de voz — bot oficial (permitido).
 *
 * Usado quando o transmissor de vídeo (conta secundária, streamer.mjs) não
 * está ligado: todo mundo escuta o filme JUNTO, dentro do Discord. O vídeo
 * pode ser ligado depois com o token DISCORD_USER_TOKEN (Go Live).
 */
import {
  joinVoiceChannel,
  entersReady,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { spawn } from "node:child_process";

const API = "https://discord.com/api/v10";

function anunciar(canalId, texto) {
  if (!canalId || !process.env.DISCORD_TOKEN) return;
  fetch(`${API}/channels/${canalId}/messages`, {
    method: "POST",
    headers: { authorization: `Bot ${process.env.DISCORD_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ content: texto }),
  }).catch(() => {});
}

export async function assistirAudio({ busca, ano, canalId, guild, canalTexto }) {
  let resolveMovieStream;
  try {
    ({ resolveMovieStream } = await import("./lib/streamResolver.mjs"));
  } catch {
    anunciar(canalTexto, "😕 Não achei o resolvedor de filmes aqui.");
    return;
  }
  anunciar(canalTexto, `🎬 Procurando **${busca}**…`);
  let r;
  try {
    r = await resolveMovieStream({ title: String(busca).slice(0, 120), year: ano || undefined, kind: "movie", forceRefresh: true });
  } catch (e) {
    console.error("[voz] resolver:", e?.message || e);
    anunciar(canalTexto, "😕 Deu ruim ao procurar o filme.");
    return;
  }
  const url = r?.masterUrl || (r?.mirrors && r.mirrors[0]) || null;
  if (!url) {
    anunciar(canalTexto, `😕 Não achei **${busca}** pra tocar.`);
    return;
  }

  const connection = joinVoiceChannel({
    channelId: canalId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  try {
    await entersReady(connection, 15000);
  } catch {
    anunciar(canalTexto, "😕 Não consegui entrar no canal de voz.");
    return;
  }
  anunciar(canalTexto, `🔊 **${busca}** no ar! Áudio do filme dentro da chamada. 🍿`);

  const ff = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", url,
    "-vn", "-ac", "2", "-ar", "48000",
    "-c:a", "libopus", "-b:a", "112k",
    "-f", "ogg", "pipe:1",
  ]);
  ff.stderr.on("data", (d) => {
    const s = String(d).trim();
    if (s) console.log("[ffmpeg-audio]", s.slice(0, 160));
  });

  const player = createAudioPlayer();
  const resource = createAudioResource(ff.stdout);
  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    anunciar(canalTexto, "🍿 O áudio acabou! Valeu por assistir.");
    try { connection.destroy(); } catch {}
  });
  player.on("error", (e) => {
    console.error("[voz] player:", e?.message || e);
    anunciar(canalTexto, "😕 O áudio caiu.");
    try { connection.destroy(); } catch {}
  });
  connection.on(VoiceConnectionStatus.Disconnected, () => {
    try { ff.kill("SIGKILL"); } catch {}
  });
}
