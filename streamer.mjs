/**
 * Filminho Cinema — TRANSMISSÃO DO FILME DENTRO DO DISCORD (modo gambiarra).
 *
 * O que faz: uma conta secundária ("de sacrifício") entra no canal de voz e
 * transmite o filme em Go Live. Todo mundo assiste DENTRO do Discord, na
 * janela da chamada — sem site, sem navegador, sem Activity.
 *
 * ⚠️ ATENÇÃO: isto automatiza uma conta de USUÁRIO (selfbot). É contra os
 *    Termos do Discord e a conta que transmite PODE SER BANIDA. Use sempre
 *    uma conta descartável — nunca a sua. Token via DISCORD_USER_TOKEN.
 *
 * Controle: tabela `filminho_stream` no Supabase. O bot oficial (bot.mjs)
 * escreve as ordens; este processo lê, resolve o filme (mesmo resolvedor do
 * app) e transmite com legenda PT-BR queimada no vídeo.
 */
import { Client } from "discord.js-selfbot-v13";
import { Streamer } from "@dank074/discord-video-stream";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { resolveMovieStream } from "./lib/streamResolver.mjs";

const GUILD_ID = "1555190088013578260";
const SUPA = "https://dnafsqxiujgnjljftxor.supabase.co/rest/v1";
const SUPA_KEY = "__SUPA_KEY__";
const supaCab = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "content-type": "application/json" };

const TOKEN = process.env.DISCORD_USER_TOKEN;
if (!TOKEN) {
  console.log("[streamer] DISCORD_USER_TOKEN ausente — transmissão desligada.");
  process.exit(0);
}

async function streamFn() {
  try {
    const lib = await import("@dank074/discord-video-stream");
    if (lib.streamLivestreamVideo) return lib.streamLivestreamVideo;
  } catch {}
  const mod = await import("@dank074/discord-video-stream/dist/media/streamLivestreamVideo.js");
  return mod.streamLivestreamVideo;
}

const client = new Client({ checkUpdate: false });
const streamer = new Streamer(client);
let transmitindo = null; // { ffmpeg, cancelar }

async function setEstado(estado, mensagem) {
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      "/tmp/filminho-status.json",
      JSON.stringify({ estado, mensagem: mensagem || "", atualizado_em: new Date().toISOString() }),
      "utf8",
    );
  } catch {}
}

async function parar() {
  if (transmitindo) {
    try { transmitindo.ffmpeg?.kill("SIGKILL"); } catch {}
    transmitindo = null;
  }
  try { streamer.stopStream(); } catch {}
  try { streamer.leaveVoice(); } catch {}
}

async function assistir({ busca, ano, canalId, posS }) {
  await parar();
  await setEstado("preparando", `procurando ${busca}…`);
  console.log("[streamer] resolvendo:", busca, ano || "");
  const r = await resolveMovieStream({
    title: String(busca || "").slice(0, 120),
    year: ano ? String(ano).slice(0, 4) : undefined,
    kind: "movie",
    forceRefresh: true,
  });
  const url = r?.masterUrl || (r?.mirrors && r.mirrors[0]) || null;
  if (!url) {
    await setEstado("erro", `não achei ${busca} pra tocar 😕`);
    return;
  }
  console.log("[streamer] fonte:", (r.fonte && (r.fonte.url || r.fonte.idente || r.fonte.nome)) || "?");

  // legenda PT-BR queimada (quando existe de verdade)
  let srtPath = null;
  const sub = r.subtitle;
  const srt = sub && (sub.srt || sub.texto || sub.text || sub.conteudo || sub.srtText || "");
  if (srt && typeof srt === "string" && srt.includes("-->")) {
    srtPath = "/tmp/legenda-filminho.srt";
    try {
      await writeFile(srtPath, srt, "utf8");
    } catch {
      srtPath = null;
    }
  }

  await setEstado("entrando", "entrando no canal de voz…");
  const udp = await streamer.joinVoice(GUILD_ID, canalId, {
    width: 1280,
    height: 720,
    fps: 30,
    bitrateKbps: 2500,
    maxBitrateKbps: 4000,
    videoCodec: "H264",
    hardwareAcceleratedDecoding: false,
  });
  streamer.signalStream(GUILD_ID, canalId);

  // ffmpeg local: queima a legenda + permite começar em uma posição (seek)
  const args = ["-hide_banner", "-loglevel", "error"];
  if (posS) args.push("-ss", String(Math.max(0, Number(posS) || 0)));
  args.push("-i", url);
  if (srtPath) args.push("-vf", `subtitles=${srtPath}:force_style='Fontsize=22,OutlineColour=&H80000000,BorderStyle=3'`);
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1800k", "-maxrate", "2000k", "-bufsize", "3000k",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-f", "matroska", "pipe:1",
  );
  const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  transmitindo = { ffmpeg };
  ffmpeg.stderr.on("data", (d) => {
    const s = String(d).trim();
    if (s) console.log("[ffmpeg]", s.slice(0, 200));
  });

  const live = await streamFn();
  try {
    await live(ffmpeg.stdout, udp, true, {
      Referer: "https://google.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });
    await setEstado("fim", "acabou 🍿");
  } catch (e) {
    console.error("[streamer] transmissão encerrada:", e?.message || e);
    if (transmitindo) await setEstado("erro", "a transmissão caiu 😕");
  } finally {
    if (srtPath) rm(srtPath, { force: true }).catch(() => {});
    transmitindo = null;
    try { streamer.stopStream(); } catch {}
    try { streamer.leaveVoice(); } catch {}
  }
}

let ultimo = "";
async function ciclo() {
  try {
    const { readFile } = await import("node:fs/promises");
    let o = null;
    try {
      o = JSON.parse(await readFile("/tmp/filminho-ordem.json", "utf8"));
    } catch {}
    if (!o) return;
    const chave = `${o.acao}|${o.busca}|${o.canal_id}|${o.pedido_em}`;
    if (o.acao && o.acao !== "ocioso" && chave !== ultimo) {
      ultimo = chave;
      if (o.acao === "assistir" && o.canal_id && o.busca) {
        await assistir({ busca: o.busca, ano: o.ano, canalId: o.canal_id, posS: o.pos_s || 0 });
      } else if (o.acao === "parar") {
        await parar();
        await setEstado("ocioso", "parado");
      }
    }
  } catch {}
}

client.on("ready", () => {
  console.log(`[streamer] conta pronta: ${client.user?.tag} — modo transmissão`);
  setInterval(ciclo, 2500);
  ciclo();
});
client.on("error", (e) => console.error("[streamer] erro:", e.message));
process.on("unhandledRejection", (e) => console.error("[streamer] promise:", e?.message || e));

client.login(TOKEN);
