# Respaldo diario de las dos bases (Rockie OS y Hábitos) con supabase/respaldo.mjs, para la tarea programada
# «Rockie - respaldo diario» de Windows. Guarda en Downloads\Respaldos-Rockie\<fecha>\{rockie-os,habitos} y borra
# los de más de 14 días. Las llaves de servicio nunca se escriben en disco ni en el registro:
#   Rockie OS → .secrets/service.env de este repo · Hábitos → la CLI de Supabase (logueada en esta PC).
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$raiz = Join-Path $env:USERPROFILE 'Downloads\Respaldos-Rockie'
$hoy = Join-Path $raiz (Get-Date -Format 'yyyy-MM-dd')
$log = Join-Path $raiz 'respaldo.log'
New-Item -ItemType Directory -Force $raiz | Out-Null
function Anotar($t) { Add-Content $log "$(Get-Date -Format 's') $t" -Encoding utf8 }

function Respaldar($nombre, $url, $llave) {
  $env:SUPABASE_URL = $url
  $env:SUPABASE_SERVICE_ROLE_KEY = $llave
  try {
    $salida = node (Join-Path $PSScriptRoot 'respaldo.mjs') (Join-Path $hoy $nombre) --archivos 2>&1 | Out-String
    Anotar "${nombre}: $($salida.Trim())"
  } catch { Anotar "${nombre}: ERROR $($_.Exception.Message)" }
  finally { Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue }
}

try {
  $kv = @{}
  Get-Content (Join-Path $repo '.secrets\service.env') | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$' } | ForEach-Object { $kv[$Matches[1]] = $Matches[2].Trim() }
  Respaldar 'rockie-os' $kv.SUPABASE_URL $kv.SUPABASE_SERVICE_ROLE_KEY
} catch { Anotar "rockie-os: ERROR $($_.Exception.Message)" }

try {
  $llaves = npx --yes supabase projects api-keys --project-ref wmsizqixjjrglygskhdb -o json 2>$null | Out-String | ConvertFrom-Json
  $svc = ($llaves | Where-Object { $_.name -eq 'service_role' }).api_key
  if (-not $svc) { throw 'la CLI no devolvió la llave de Hábitos (¿sesión de supabase cerrada? corre: npx supabase login)' }
  Respaldar 'habitos' 'https://wmsizqixjjrglygskhdb.supabase.co' $svc
} catch { Anotar "habitos: ERROR $($_.Exception.Message)" }

# Solo carpetas con nombre de fecha y de más de 14 días.
Get-ChildItem $raiz -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' -and [datetime]$_.Name -lt (Get-Date).Date.AddDays(-14) } |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force; Anotar "borrado viejo: $($_.Name)" }
