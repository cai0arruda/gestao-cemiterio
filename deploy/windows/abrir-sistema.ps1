# Abre o sistema do cemitério como um "programa":
#  1. Se o servidor não estiver rodando, inicia em segundo plano (npm start).
#  2. Abre o Chrome em modo aplicativo, com impressão silenciosa (--kiosk-printing),
#     usando um perfil separado só para o sistema.
$ErrorActionPreference = 'Stop'
$projeto = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$porta = 3000
$url = "http://localhost:$porta"

function ServidorNoAr {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$url/api/setup/status" | Out-Null; return $true }
  catch { return $false }
}

if (-not (ServidorNoAr)) {
  $log = Join-Path $projeto 'data\servidor.log'
  New-Item -ItemType Directory -Force (Join-Path $projeto 'data') | Out-Null
  Start-Process -WindowStyle Hidden -WorkingDirectory $projeto -FilePath 'cmd.exe' `
    -ArgumentList '/c', "npm start > `"$log`" 2>&1"
  for ($i = 0; $i -lt 60 -and -not (ServidorNoAr); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not (ServidorNoAr)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("O sistema não iniciou. Veja o arquivo:`n$log", 'Gestão do Cemitério') | Out-Null
    exit 1
  }
}

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Start-Process $url  # sem Chrome: abre no navegador padrão (a impressão vai mostrar a janela de impressão)
  exit 0
}
$perfil = Join-Path $env:LocalAppData 'GestaoCemiterio\chrome'
Start-Process -FilePath $chrome -ArgumentList "--app=$url", '--kiosk-printing', "--user-data-dir=`"$perfil`"", '--no-first-run'
