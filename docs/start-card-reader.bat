@echo off
REM IGC card reader for Windows: starts Ollama (local AI) + a free Cloudflare tunnel so the IGC site can reach it.
REM Double-click to run. Keep this window open while cards are being checked.
title IGC card reader
cd /d "%~dp0"
echo == IGC card reader ==

set "OLLAMA_ORIGINS=https://santhosharun99.github.io,http://localhost:*,http://127.0.0.1:*"
setx OLLAMA_ORIGINS "%OLLAMA_ORIGINS%" >nul

REM Find Ollama
set "OLLAMA=ollama"
where ollama >nul 2>&1 || set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA%" if not "%OLLAMA%"=="ollama" (
  echo Ollama is not installed. Download it from https://ollama.com and run this again.
  pause & exit /b 1
)

echo Restarting Ollama with the IGC site allowed...
taskkill /im "ollama app.exe" /f >nul 2>&1
taskkill /im ollama.exe /f >nul 2>&1
timeout /t 2 >nul
start "Ollama server" /min "%OLLAMA%" serve
set /a n=0
:waitollama
curl -s http://localhost:11434/api/tags >nul 2>&1 && goto ollamaok
set /a n+=1
if %n% geq 30 ( echo Ollama did not start. Open the Ollama app once, then run this again. & pause & exit /b 1 )
timeout /t 1 >nul
goto waitollama
:ollamaok
echo Ollama OK

"%OLLAMA%" list | findstr /c:"qwen2.5vl:7b" >nul || (
  echo Downloading the card-reading model, about 6 GB, one time only...
  "%OLLAMA%" pull qwen2.5vl:7b
)

REM Find or install cloudflared
set "CF=cloudflared"
where cloudflared >nul 2>&1 || (
  if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" ( set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe" ) else if exist "%ProgramFiles%\cloudflared\cloudflared.exe" ( set "CF=%ProgramFiles%\cloudflared\cloudflared.exe" ) else (
    echo Installing cloudflared, one time only...
    winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
    if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
  )
)

set "LOG=%~dp0card-reader-tunnel.log"
del "%LOG%" >nul 2>&1
REM Watch the tunnel log; when the address appears, copy it and show it.
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%LOG%'; $re='https://[a-z0-9-]+\.trycloudflare\.com'; for($i=0;$i -lt 120;$i++){ if(Test-Path $p){ $m=Select-String -Path $p -Pattern $re | Select-Object -First 1; if($m){ $u=$m.Matches[0].Value; Set-Clipboard $u; Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show(\"Card reader address (copied to clipboard):`n`n$u`n`nPaste it in the IGC site: Scores > Card reader > Save & test.`nKeep the black window open.\",'IGC card reader'); break } }; Start-Sleep 1 }"

echo.
echo Opening the secure link... a box will show the card reader address.
echo Keep this window open during the event. Close it to stop the reader.
echo.
"%CF%" tunnel --no-autoupdate --url http://localhost:11434 --http-host-header localhost:11434 --logfile "%LOG%"
pause
