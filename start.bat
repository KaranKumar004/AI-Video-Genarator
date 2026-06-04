@echo off
title AI Video Content Studio Launcher
echo ===================================================
echo   Starting AI Video Content Studio...
echo ===================================================

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js (LTS version) from:
    echo https://nodejs.org/
    echo.
    echo After installing, close this window and double-click this file again.
    echo.
    pause
    exit /b
)

:: Check for Python (for Edge TTS)
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH!
    echo Please install Python (3.9 or higher) and ensure you check the box 
    echo "Add python.exe to PATH" during installation.
    echo.
    pause
    exit /b
)

:: Install edge-tts for python if not already present
echo Checking Python dependencies...
python -c "import edge_tts" >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing edge-tts python library...
    python -m pip install edge-tts
)

:: Check if node_modules exists, install if missing
if not exist node_modules (
    echo node_modules not found. Installing node dependencies (this might take a moment)...
    call npm install
)

:: Start the server in the background
echo Starting local server on http://localhost:3000 ...
start "" /b node server.js

:: Wait for server to boot (3 seconds)
timeout /t 3 /nobreak >nul

:: Open browser
echo Launching your browser...
start http://localhost:3000

echo.
echo ===================================================
echo   AI Video Studio is running in the background!
echo   Keep this terminal open while using the app.
echo   Close this window to stop the server.
echo ===================================================
echo.
pause
