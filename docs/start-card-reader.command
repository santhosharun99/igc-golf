#!/bin/zsh
# Starts the IGC card reader: Ollama (local AI) + a free Cloudflare tunnel so the IGC site can reach it.
cd "$(dirname "$0")"
LOG="$PWD/card-reader.log"; URLF="$PWD/reader-url.txt"
echo "== IGC card reader ==" | tee "$LOG"
export PATH="$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
launchctl setenv OLLAMA_ORIGINS "https://santhosharun99.github.io,http://localhost:*,http://127.0.0.1:*"
echo "Restarting Ollama with the site allowed..." | tee -a "$LOG"
osascript -e 'quit app "Ollama"' 2>/dev/null; pkill -x ollama 2>/dev/null; sleep 2
open -a Ollama 2>/dev/null; for i in {1..8}; do curl -s http://localhost:11434/api/tags >/dev/null && break; sleep 1; done
if ! curl -s http://localhost:11434/api/tags >/dev/null; then
  echo "Starting Ollama server in the background..." | tee -a "$LOG"
  OLLAMA_ORIGINS="https://santhosharun99.github.io,http://localhost:*,http://127.0.0.1:*" nohup ollama serve >> "$PWD/ollama-serve.log" 2>&1 &
  for i in {1..30}; do curl -s http://localhost:11434/api/tags >/dev/null && break; sleep 1; done
fi
curl -s http://localhost:11434/api/tags >/dev/null && echo "Ollama OK" | tee -a "$LOG" || { echo "Ollama did not start - see ollama-serve.log" | tee -a "$LOG"; exit 1; }
ollama list | grep -q "qwen2.5vl:7b" || ollama pull qwen2.5vl:7b
if ! command -v cloudflared >/dev/null; then echo "Installing cloudflared (one time)..." | tee -a "$LOG"; brew install cloudflared 2>&1 | tail -2 | tee -a "$LOG"; fi
rm -f "$URLF"
echo "Opening tunnel... keep this window open during the event." | tee -a "$LOG"
cloudflared tunnel --no-autoupdate --url http://localhost:11434 --http-host-header localhost:11434 2>&1 | while IFS= read -r line; do
  echo "$line" >> "$LOG"
  u=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
  if [ -n "$u" ] && [ ! -f "$URLF" ]; then echo "$u" > "$URLF"; echo ""; echo ">>> Card reader address: $u"; echo ">>> Paste it in IGC site > Scores > Card reader."; echo "$u" | pbcopy; fi
done
