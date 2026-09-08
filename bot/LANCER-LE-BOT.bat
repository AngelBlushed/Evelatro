@echo off
title Bot Discord EveLatro!
cd /d "%~dp0"

if not exist node_modules (
    echo Premiere installation, ca peut prendre une minute...
    call npm install
)

:boucle
echo.
echo ============================================
echo   Bot Discord EveLatro! - en cours de route
echo   (laisse cette fenetre ouverte pour que le bot reste en ligne)
echo ============================================
echo.
node index.js
echo.
echo Le bot s'est arrete. Redemarrage automatique dans 5 secondes...
echo (Pour l'arreter pour de bon : ferme simplement cette fenetre.)
timeout /t 5 /nobreak >nul
goto boucle
