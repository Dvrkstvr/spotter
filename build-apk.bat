@echo off
rem Release APK -> _builds\workout-diary-<date>-<hash>.apk (sideload this).
cd /d "%~dp0"
call npm run build:apk
pause
