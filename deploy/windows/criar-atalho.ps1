# Cria o atalho "Gestão do Cemitério" na Área de Trabalho.
# Uso (PowerShell, na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File deploy\windows\criar-atalho.ps1
# Opcional: -IniciarComWindows  -> também liga o servidor quando o Windows inicia.
param([switch]$IniciarComWindows)

$script = Join-Path $PSScriptRoot 'abrir-sistema.ps1'
$icone = Join-Path $PSScriptRoot 'icone.ico'
$shell = New-Object -ComObject WScript.Shell

function CriarAtalho($destino) {
  $a = $shell.CreateShortcut($destino)
  $a.TargetPath = 'powershell.exe'
  $a.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
  $a.WorkingDirectory = $PSScriptRoot
  $a.WindowStyle = 7  # minimizado
  if (Test-Path $icone) { $a.IconLocation = $icone }
  $a.Save()
}

$area = [Environment]::GetFolderPath('Desktop')
CriarAtalho (Join-Path $area 'Gestão do Cemitério.lnk')
Write-Host "Atalho criado na Área de Trabalho."

if ($IniciarComWindows) {
  $inicializar = [Environment]::GetFolderPath('Startup')
  CriarAtalho (Join-Path $inicializar 'Gestão do Cemitério.lnk')
  Write-Host "O sistema também vai abrir quando o Windows iniciar."
}
