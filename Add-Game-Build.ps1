Add-Type -AssemblyName System.Windows.Forms

$games = @(
  @{ Number = 1; Name = "Grave Swarm"; Folder = "games\01-grave-swarm" },
  @{ Number = 2; Name = "Starbore"; Folder = "games\02-starbore" },
  @{ Number = 3; Name = "Project Patchwork"; Folder = "games\03-patchwork" },
  @{ Number = 4; Name = "Project Mimic"; Folder = "games\04-mimic" },
  @{ Number = 5; Name = "Dungeon Drop"; Folder = "games\05-dungeon-drop" },
  @{ Number = 6; Name = "Project Wildcards"; Folder = "games\06-wildcards" },
  @{ Number = 7; Name = "Scrap Run"; Folder = "games\07-scrap-run" },
  @{ Number = 8; Name = "Last Line"; Folder = "games\08-last-line" },
  @{ Number = 9; Name = "Grid Siege"; Folder = "games\09-grid-siege" }
)

Write-Host ""
Write-Host "SMALL GAMES PROTOTYPE LAB - ADD GAME BUILD" -ForegroundColor Cyan
Write-Host "------------------------------------------------"
foreach ($g in $games) {
  Write-Host ("{0}. {1}" -f $g.Number, $g.Name)
}

$choice = Read-Host "Enter prototype number (1-9)"
$game = $games | Where-Object { $_.Number -eq [int]$choice }

if (-not $game) {
  Write-Host "Invalid prototype number." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "Choose the latest HTML build for $($game.Name)"
$dialog.Filter = "HTML files (*.html)|*.html"
$dialog.Multiselect = $false

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host "Canceled."
  exit 0
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$destinationFolder = Join-Path $root $game.Folder
$destination = Join-Path $destinationFolder "index.html"

Copy-Item -LiteralPath $dialog.FileName -Destination $destination -Force

Write-Host ""
Write-Host "Installed $($game.Name):" -ForegroundColor Green
Write-Host $destination
Write-Host ""
Write-Host "Next: upload/commit the changed index.html to GitHub."
Read-Host "Press Enter to close"
