@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)
echo Starting PDF Editor at http://localhost:5175
call npm run dev
