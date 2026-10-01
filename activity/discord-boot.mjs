/**
 * Filminho Cinema — boot do Discord Embedded App SDK.
 * Roda por baixo da UI do Filminho (idêntica ao app/APK): só faz o handshake
 * com o cliente do Discord e expõe o sdk em window.filminhoDiscord.
 * Fora do Discord (aberto direto no navegador), não faz nada.
 */
import { DiscordSDK } from "@discord/embedded-app-sdk";

const APP_ID = "1555189969545461850";

function dentroDoDiscord() {
  try {
    const p = new URLSearchParams(location.search);
    return p.has("frame_id") || p.has("instance_id");
  } catch {
    return false;
  }
}

if (dentroDoDiscord()) {
  const sdk = new DiscordSDK(APP_ID);
  sdk
    .ready()
    .then(() => {
      window.filminhoDiscord = sdk;
      window.dispatchEvent(new Event("filminho:discord-ready"));
    })
    .catch((e) => {
      console.warn("[filminho] handshake Discord falhou", e);
    });
}
