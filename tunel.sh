#!/usr/bin/env bash
# Mantém o túnel cloudflared vivo; renasce se morrer. URL fica em /tmp/cloudflared.log.
while true; do
  /tmp/cloudflared tunnel --url http://127.0.0.1:5173 --no-autoupdate >> /tmp/cloudflared.log 2>&1
  echo "[tunel] cloudflared saiu (code $?); reiniciando em 2s..." >> /tmp/cloudflared.log
  sleep 2
done
