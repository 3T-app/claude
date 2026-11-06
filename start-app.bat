@echo off
chcp 65001 > nul
rem このファイルをダブルクリックすると、このフォルダでアプリを準備して起動します。
cd /d "%~dp0"
if not exist package.json (
  echo package.json が見つかりません。このファイルは package.json と同じフォルダに置いてください。
  pause
  exit /b 1
)
if not exist .env.local (
  echo [注意] .env.local がありません。前のフォルダから、このフォルダにコピーしてください。
  echo         このままでもデモ表示で動きます。
  echo.
)
echo アプリを準備しています（初回は数分かかります）...
call npm install
if errorlevel 1 (
  echo npm install に失敗しました。この画面の写真を送ってください。
  pause
  exit /b 1
)
call npm run phone
pause
