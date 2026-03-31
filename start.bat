@echo off
:: Navigate to the folder where this bat file is located
cd /d "%~dp0"

echo Running npm install...
call npm install

echo.
echo Starting development server...
call npm run dev

echo.
echo Server stopped or crashed.
pause
