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

$extensionWithoutDot = $Extension.TrimStart('.')
$stableProgId = "No1MarkdownEditor.$extensionWithoutDot"

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

$registeredApplications = foreach ($path in @(
  'HKCU:\Software\RegisteredApplications',
  'HKLM:\Software\RegisteredApplications'
)) {
  [pscustomobject]@{
    Path = $path
    CapabilitiesPath = Get-RegistryValue -Path $path -Name $ProductName
  }
}

$capabilityFileAssociations = foreach ($entry in $registeredApplications) {
  if ([string]::IsNullOrWhiteSpace($entry.CapabilitiesPath)) {
    continue
  }

  foreach ($root in @('HKCU:', 'HKLM:')) {
    $path = "$root\$($entry.CapabilitiesPath)\FileAssociations"
    [pscustomobject]@{
      Path = $path
      Extension = $Extension
      ProgId = Get-RegistryValue -Path $path -Name $Extension
    }
  }
}

$candidateProgIds = New-Object System.Collections.Generic.List[string]
foreach ($progId in @(
  $userChoiceProgId,
  $stableProgId,
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

foreach ($entry in $capabilityFileAssociations) {
  if (-not [string]::IsNullOrWhiteSpace($entry.ProgId) -and -not $candidateProgIds.Contains($entry.ProgId)) {
    $candidateProgIds.Add($entry.ProgId)
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

Write-Host 'Default Apps registration:' -ForegroundColor Cyan
$registeredApplications | Format-Table -AutoSize

Write-Host 'Default Apps file associations:' -ForegroundColor Cyan
if ($capabilityFileAssociations) {
  $capabilityFileAssociations | Format-Table -AutoSize
} else {
  Write-Host "No Default Apps capability file association was found for $Extension."
}

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
} elseif ($userChoiceProgId -ne $stableProgId -and $userChoiceProgId -ne "$ProductName$Extension") {
  $warnings.Add("UserChoice points to $userChoiceProgId. Windows will prefer that protected user default over the installed $stableProgId association.")
}

$defaultClassValues = @($extensionClasses | ForEach-Object { $_.DefaultValue } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($defaultClassValues.Count -eq 0) {
  $warnings.Add("No extension default class is registered for $Extension.")
} elseif ($stableProgId -notin $defaultClassValues -and "$ProductName$Extension" -notin $defaultClassValues) {
  $warnings.Add("The extension default class for $Extension is not registered to $stableProgId.")
}

$capabilityProgIds = @($capabilityFileAssociations | ForEach-Object { $_.ProgId } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($stableProgId -notin $capabilityProgIds) {
  $warnings.Add("Default Apps registration does not advertise $Extension as $stableProgId.")
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
