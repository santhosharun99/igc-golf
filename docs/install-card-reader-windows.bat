@echo off
REM IGC Card Reader - one-time installer for Windows.
REM After this, the IGC site's "Card reader: On" switch (or uploading a card photo) starts the reader automatically.
title IGC Card Reader installer
echo == IGC Card Reader installer ==
set "ORIGINS=https://santhosharun99.github.io,http://localhost:*,http://127.0.0.1:*"
set "OLLAMA=ollama"
where ollama >nul 2>&1 || set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not "%OLLAMA%"=="ollama" if not exist "%OLLAMA%" (
  echo Installing Ollama, free, one time...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://ollama.com/install.ps1 | iex"
  if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    powershell -NoProfile -Command "Invoke-WebRequest https://ollama.com/download/OllamaSetup.exe -OutFile $env:TEMP\OllamaSetup.exe" && "%TEMP%\OllamaSetup.exe" /SILENT
  )
  if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" ( echo Couldn't install Ollama automatically. Install it from https://ollama.com, then run this again. & pause & exit /b 1 )
)

set "DIR=%LOCALAPPDATA%\IGC"
mkdir "%DIR%" >nul 2>&1
setx OLLAMA_ORIGINS "%ORIGINS%" >nul

REM The starter the site's link will run (hidden window)
> "%DIR%\reader-start.bat" echo @echo off
>> "%DIR%\reader-start.bat" echo set "OLLAMA_ORIGINS=%ORIGINS%"
>> "%DIR%\reader-start.bat" echo curl -s -m 3 http://localhost:11434/api/tags ^>nul 2^>^&1 ^&^& exit /b 0
>> "%DIR%\reader-start.bat" echo taskkill /im "ollama app.exe" /f ^>nul 2^>^&1
>> "%DIR%\reader-start.bat" echo taskkill /im ollama.exe /f ^>nul 2^>^&1
>> "%DIR%\reader-start.bat" echo start "" /min "%OLLAMA%" serve
> "%DIR%\reader-start.vbs" echo CreateObject("WScript.Shell").Run """%DIR%\reader-start.bat""", 0, False

REM Register igc-reader:// links
reg add "HKCU\Software\Classes\igc-reader" /ve /d "URL:IGC Card Reader" /f >nul
reg add "HKCU\Software\Classes\igc-reader" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\igc-reader\shell\open\command" /ve /d "wscript.exe \"%DIR%\reader-start.vbs\" \"%%1\"" /f >nul

echo Starting the reader...
call "%DIR%\reader-start.bat"
set /a n=0
:wait
curl -s http://localhost:11434/api/tags >nul 2>&1 && goto ok
set /a n+=1
if %n% geq 30 goto ok
timeout /t 1 >nul
goto wait
:ok
"%OLLAMA%" list | findstr /c:"qwen2.5vl:7b" >nul || ( echo Downloading the card-reading model, about 6 GB, one time... & "%OLLAMA%" pull qwen2.5vl:7b )
echo.
echo Done. In the IGC site: Scores ^> Card reader switch ^> On. Uploading a card photo also starts it.
pause
