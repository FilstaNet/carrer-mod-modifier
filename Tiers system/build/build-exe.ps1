# Builds dist\RL Career Hub - Modifier.exe  (one file to send around).
# Needs: Node (its node.exe gets bundled) and the .NET Framework compiler that ships with Windows. No downloads.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot            # ...\Tiers system
$stage = Join-Path $PSScriptRoot 'stage'
$dist = Join-Path $root 'dist'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe not found' }
$node = (Get-Command node).Source

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force "$stage\launcher", "$stage\src\engine", "$stage\src\ui", "$stage\src\injector", $dist | Out-Null
Copy-Item "$root\launcher\start.js" "$stage\launcher\"
Copy-Item "$root\src\engine\*" "$stage\src\engine\"
Copy-Item "$root\src\ui\*.js" "$stage\src\ui\"
Copy-Item "$root\src\injector\inproc.js" "$stage\src\injector\"
Copy-Item "$root\src\teams_logos" "$stage\src\teams_logos" -Recurse
Copy-Item "$root\version.json" "$stage\"
Copy-Item $node "$stage\node.exe"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $PSScriptRoot 'mod.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$out = Join-Path $dist 'RL Career Hub - Modifier.exe'
if (Test-Path $out) { Remove-Item $out -Force }
$icon = Join-Path (Split-Path -Parent $root) 'app_extracted\icon.ico'
$args = @('/nologo', '/target:winexe', "/out:$out", "/resource:$zip,mod.zip", '/reference:System.Windows.Forms.dll', '/reference:System.IO.Compression.FileSystem.dll', '/reference:System.IO.Compression.dll')
if (Test-Path $icon) { $args += "/win32icon:$icon" }
$args += (Join-Path $PSScriptRoot 'stub.cs')
& $csc @args
if ($LASTEXITCODE -ne 0) { throw 'compile failed' }
Remove-Item $stage -Recurse -Force
Write-Host ('built ' + $out + '  ' + [math]::Round((Get-Item $out).Length / 1MB, 1) + ' MB')
