# 🎬 Filminho Cinema

Bot oficial + **Activity do Discord** com o player do Filminho dentro do Discord:
busca, salas com dono/convidados, play/pause/seek sincronizados, legendas PT-BR e
qualidade 1080p+ — com a **mesma interface do app Filminho** (o APK é essa UI
empacotada; a Activity usa o mesmo bundle).

> **Uso restrito:** funciona somente no servidor/canal autorizados, por comando
> específico, com validação no backend. Não é um produto público de distribuição
> de vídeo.

## Como está hospedado (sem custo, sempre ligado)

| Peça | Onde | Detalhe |
|---|---|---|
| Bot (comando `/cinema`, salas, sync) | **GitHub Actions** 24/7 | job re-acionado a cada 5h (foge do limite de 6h); repo público = minutos ilimitados |
| UI da Activity | **GitHub Pages** | endereço fixo `https://astaviolet.github.io/filminho-cinema/` |
| UI do app Filminho | `filminho-ui.tar.gz.age` | **cifrada com [age](https://github.com/FiloSottile/age)** — nunca em texto aberto (mesmo padrão do `filminho-apk-build`) |
| Segredos | GitHub Actions Secrets | `DISCORD_TOKEN`, `AGE_PRIVATE_KEY` |

O workflow `deploy-activity-pages` decifra a UI com o secret `AGE_PRIVATE_KEY` e
publica no Pages. O código do app Filminho **não** fica visível no repositório.

## Secrets necessários

| Secret | O que é |
|---|---|
| `DISCORD_TOKEN` | token do bot Filminho (Developer Portal → Bot) |
| `AGE_PRIVATE_KEY` | chave privada age (`AGE-SECRET-KEY-1...`) usada para cifrar a UI |

## Configuração única no Developer Portal

1. **OAuth2 → Redirects:** `https://1555189969545461850.discordsays.com`
2. **Activities → URL Mappings:** PREFIX `/` → TARGET `astaviolet.github.io/filminho-cinema`
3. **Activities → Settings:** ligar **Enable Activities**

## Desenvolvimento local

```bash
npm ci
node --env-file=.env bot.mjs     # bot
node serve.mjs                   # serve a UI decifrada em ./site (porta 5173)
bash tunel.sh                    # túnel cloudflared para testes no Discord
```

## Avisos importantes

- O token do bot vive apenas nos Secrets — nunca em código, commits ou logs.
- O catálogo atual de fontes **não** é tratado como autorizado para monetização;
  monetizar IP de terceiros sem permissão escrita é proibido pelas regras do
  Discord e por direitos autorais. Qualquer monetização futura exige acerto de
  direitos.
- Este projeto não incorpora nem redistribui o código do Filminho em texto
  aberto; a UI trafega e é publicada apenas cifrada.
