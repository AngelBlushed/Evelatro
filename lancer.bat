@echo off
rem ============================================================
rem  EveLatro! - ouvre le jeu dans une fenetre d'app Edge/Chrome
rem  (pratique pour tester une modif ; sinon lance EveLatro.exe)
rem ============================================================
setlocal enabledelayedexpansion

set "HERE=%~dp0"
set "PAGE=file:///!HERE!index.html"
set "PAGE=!PAGE:\=/!"
set "PROFILE=%LOCALAPPDATA%\EveLatro"

set "EDGE_A=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE_B=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHR_A=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHR_B=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "!EDGE_A!" ( start "" "!EDGE_A!" --app="!PAGE!" --window-size=480,980 --window-position=160,10 --user-data-dir="!PROFILE!" & goto :eof )
if exist "!EDGE_B!" ( start "" "!EDGE_B!" --app="!PAGE!" --window-size=480,980 --window-position=160,10 --user-data-dir="!PROFILE!" & goto :eof )
if exist "!CHR_A!"  ( start "" "!CHR_A!"  --app="!PAGE!" --window-size=480,980 --window-position=160,10 --user-data-dir="!PROFILE!" & goto :eof )
if exist "!CHR_B!"  ( start "" "!CHR_B!"  --app="!PAGE!" --window-size=480,980 --window-position=160,10 --user-data-dir="!PROFILE!" & goto :eof )

rem  Ni Edge ni Chrome trouves : ouverture classique dans le navigateur par defaut.
start "" "!HERE!index.html"
