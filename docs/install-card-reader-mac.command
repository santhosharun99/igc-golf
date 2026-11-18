#!/bin/zsh
# IGC Card Reader - one-time installer for Mac.
# After this, the IGC site's "Card reader: On" switch (or uploading a card photo) starts the reader automatically.
# Undo: delete ~/Applications/IGC Card Reader.app
set -e
export PATH="$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
SITE="https://santhosharun99.github.io"
echo "== IGC Card Reader installer =="
OLL=$(command -v ollama || true)
[ -z "$OLL" ] && [ -x /Applications/Ollama.app/Contents/Resources/ollama ] && OLL=/Applications/Ollama.app/Contents/Resources/ollama
if [ -z "$OLL" ]; then echo "Ollama is not installed. Download it from https://ollama.com, open it once, then run this again."; read -k1; exit 1; fi
echo "Ollama: $OLL"

# The starter script the site's link runs (in the background, no window)
SUP="$HOME/Library/Application Support/IGC"; mkdir -p "$SUP" "$HOME/Library/Logs"
cat > "$SUP/reader-start.sh" <<SH
#!/bin/zsh
export OLLAMA_ORIGINS="$SITE,http://localhost:*,http://127.0.0.1:*"
if curl -s -m 3 -H "Origin: $SITE" -D - -o /dev/null http://localhost:11434/api/tags | grep -qi access-control-allow-origin; then exit 0; fi
osascript -e 'quit app "Ollama"' >/dev/null 2>&1; pkill -x ollama; sleep 2
nohup "$OLL" serve >> "\$HOME/Library/Logs/igc-cardreader.log" 2>&1 &
SH
chmod +x "$SUP/reader-start.sh"
/bin/zsh "$SUP/reader-start.sh"
for i in {1..30}; do curl -s http://localhost:11434/api/tags >/dev/null && break; sleep 1; done

if ! "$OLL" list | grep -q "qwen2.5vl:7b"; then echo "Downloading the card-reading model (about 6 GB, one time)..."; "$OLL" pull qwen2.5vl:7b; fi

# Build a tiny background app that opens igc-reader:// links and starts the reader
APP="$HOME/Applications/IGC Card Reader.app"; mkdir -p "$HOME/Applications"; rm -rf "$APP"
cat > /tmp/igc-reader.applescript <<AS
on open location theURL
	do shell script "/bin/zsh '$SUP/reader-start.sh' > /dev/null 2>&1 &"
end open location
on run
	do shell script "/bin/zsh '$SUP/reader-start.sh' > /dev/null 2>&1 &"
end run
AS
osacompile -o "$APP" /tmp/igc-reader.applescript
PB=/usr/libexec/PlistBuddy; PL="$APP/Contents/Info.plist"
$PB -c "Set :CFBundleIdentifier com.igc.cardreader" "$PL" 2>/dev/null || $PB -c "Add :CFBundleIdentifier string com.igc.cardreader" "$PL"
$PB -c "Add :LSUIElement bool true" "$PL"
$PB -c "Add :CFBundleURLTypes array" "$PL"
$PB -c "Add :CFBundleURLTypes:0 dict" "$PL"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string IGC Card Reader" "$PL"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PL"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string igc-reader" "$PL"
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
open "$APP"
sleep 3
if curl -s -m 3 -H "Origin: $SITE" -D - -o /dev/null http://localhost:11434/api/tags | grep -qi access-control-allow-origin; then
  echo ""; echo "Done. The card reader is ready on this Mac."
  echo "In the IGC site: Scores > Card reader switch > On. Uploading a card photo also starts it."
else
  echo ""; echo "Installed, but the reader didn't answer yet. Open the IGC site and turn Card reader On."
fi
echo "(Press any key to close)"; read -k1
