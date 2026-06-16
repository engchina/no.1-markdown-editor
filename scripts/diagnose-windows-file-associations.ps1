[CmdletBinding()]
param(
  [string]$Extension = '.md',
  [string]$ProductName = 'No.1 Markdown Editor',
  [string]$BinaryName = 'no1-markdown-editor.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
  throw 'This diagnostic script must be run on Windows.'
}

if (-not $Extension.StartsWith('.')) {
  $Extension = ".$Extension"
}

function Get-RegistryDefaultValue {
  param([Parameter(Mandatory = $true)][string]$Path)

  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $item) {
    return $null
  }

  return $item.GetValue('')
}

function Get-RegistryValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $item) {
    return $null
  }

  return $item.GetValue($Name)
}

function Get-CommandExecutable {
  param([AllowNull()][string]$Command)

  if ([string]::IsNullOrWhiteSpace($Command)) {
    return $null
  }

  if ($Command -match '^\s*"([^"]+\.exe)"') {
    return $Matches[1]
  }

  if ($Command -match '^\s*([^\s]+\.exe)') {
    return $Matches[1]
  }

  return $null
}

function Get-ProgIdCommands {
  param([Parameter(Mandatory = $true)][string]$ProgId)

  $paths = @(
    "HKCU:\Software\Classes\$ProgId\shell\open\command",
    "HKLM:\Software\Classes\$ProgId\shell\open\command",
    "Registry::HKEY_CLASSES_ROOT\$ProgId\shell\open\command"
  )

  foreach ($path in $paths) {
    $command = Get-RegistryDefaultValue -Path $path
    $exe = Get-CommandExecutable -Command $command
    [pscustomobject]@{
      ProgId = $ProgId
      Path = $path
      Command = $command
      HasCommand = -not [string]::IsNullOrWhiteSpace($command)
      HasPathArgument = if ($command) { $command -match '%1|%L' } else { $false }
      Executable = $exe
      ExecutableExists = if ($exe) { Test-Path -LiteralPath $exe -PathType Leaf } else { $false }
    }
  }
}

$userChoicePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$Extension\UserChoice"
$userChoiceProgId = Get-RegistryValue -Path $userChoicePath -Name 'ProgId'
$userChoiceHash = Get-RegistryValue -Path $userChoicePath -Name 'Hash'

$extensionClassPaths = @(
  "HKCU:\Software\Classes\$Extension",
  "HKLM:\Software\Classes\$Extension",
  "Registry::HKEY_CLASSES_ROOT\$Extension"
)

$extensionClasses = foreach ($path in $extensionClassPaths) {
  [pscustomobject]@{
    Path = $path
    DefaultValue = Get-RegistryDefaultValue -Path $path
  }
}

$candidateProgIds = New-Object System.Collections.Generic.List[string]
foreach ($progId in @(
  $userChoiceProgId,
  "Applications\$BinaryName",
  "$ProductName$Extension",
  'Markdown Document',
  'MDX Document',
  'Plain Text Document'
)) {
  if (-not [string]::IsNullOrWhiteSpace($progId) -and -not $candidateProgIds.Contains($progId)) {
    $candidateProgIds.Add($progId)
  }
}

foreach ($entry in $extensionClasses) {
  if (-not [string]::IsNullOrWhiteSpace($entry.DefaultValue) -and -not $candidateProgIds.Contains($entry.DefaultValue)) {
    $candidateProgIds.Add($entry.DefaultValue)
  }
}

$commands = foreach ($progId in $candidateProgIds) {
  Get-ProgIdCommands -ProgId $progId
}

$processes = Get-Process -Name ($BinaryName -replace '\.exe$', '') -ErrorAction SilentlyContinue |
  Select-Object Id, ProcessName, Path

Write-Host ''
Write-Host "== Windows file association diagnostic for $Extension ==" -ForegroundColor Cyan
Write-Host ''

[pscustomobject]@{
  Extension = $Extension
  UserChoiceProgId = $userChoiceProgId
  UserChoiceHashPresent = -not [string]::IsNullOrWhiteSpace($userChoiceHash)
} | Format-List

Write-Host 'Extension class registry values:' -ForegroundColor Cyan
$extensionClasses | Format-Table -AutoSize

Write-Host 'Candidate open commands:' -ForegroundColor Cyan
$commands | Format-List

Write-Host 'Running app processes:' -ForegroundColor Cyan
if ($processes) {
  $processes | Format-Table -AutoSize
} else {
  Write-Host "No running $BinaryName process was found."
}

$warnings = New-Object System.Collections.Generic.List[string]

if ([string]::IsNullOrWhiteSpace($userChoiceProgId)) {
  $warnings.Add("No UserChoice ProgId is set for $Extension.")
} elseif ($userChoiceProgId -eq "Applications\$BinaryName") {
  $userChoiceCommands = @($commands | Where-Object { $_.ProgId -eq $userChoiceProgId -and $_.HasCommand })
  if ($userChoiceCommands.Count -eq 0) {
    $warnings.Add("UserChoice points to Applications\$BinaryName, but no open command was found for that Applications ProgId.")
  }
}

foreach ($command in $commands | Where-Object { $_.HasCommand }) {
  if (-not $command.HasPathArgument) {
    $warnings.Add("Open command for $($command.ProgId) does not pass a file path argument: $($command.Command)")
  }

  if ($command.Executable -and -not $command.ExecutableExists) {
    $warnings.Add("Open command for $($command.ProgId) points to a missing executable: $($command.Executable)")
  }
}

Write-Host ''
if ($warnings.Count -gt 0) {
  Write-Host 'Warnings:' -ForegroundColor Yellow
  foreach ($warning in $warnings) {
    Write-Host " - $warning"
  }
} else {
  Write-Host 'No obvious file association problems were detected.' -ForegroundColor Green
}
