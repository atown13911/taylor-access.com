#Requires -Version 5.1
<#
.SYNOPSIS
  Link or create a Railway project for Taylor Access API, add Postgres, print secrets, and optionally set vars + deploy.

.DESCRIPTION
  Prerequisites: Railway CLI (https://docs.railway.com/guides/cli) and `railway login`.

  From repo root:
    .\scripts\bootstrap-railway-taylor-access.ps1

  After you know the API service name from the Railway dashboard:

    .\scripts\bootstrap-railway-taylor-access.ps1 -ServiceName "Taylor Access API" -ApplyVars -SkipPostgres

  Or set variables in the dashboard using the printed secrets and:
    DATABASE_URL = ${{Postgres.DATABASE_URL}}
#>
[CmdletBinding()]
param(
    [string] $ServiceName = "",
    [switch] $SkipInit,
    [switch] $SkipPostgres,
    [switch] $SkipDeploy,
    [switch] $ApplyVars
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-RandomBase64([int] $ByteLength) {
    $bytes = New-Object byte[] $ByteLength
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Error "Railway CLI not found. Install from https://docs.railway.com/guides/cli"
}

railway whoami 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not logged in to Railway. Run: railway login"
}

if (-not $SkipInit -and -not (Test-Path (Join-Path $repoRoot ".railway"))) {
    Write-Host "Creating new Railway project 'Taylor Access API' and linking this directory..."
    railway init -n "Taylor Access API"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipPostgres) {
    Write-Host "Adding PostgreSQL service 'Postgres' (ignore errors if it already exists)..."
    railway add -d postgres -s Postgres 2>&1 | Out-Host
}

$jwt = New-RandomBase64 48
$publicApplicantKey = New-RandomBase64 32

Write-Host ""
Write-Host "=== Generated secrets (save a copy; shown once here) ===" -ForegroundColor Yellow
Write-Host "JWT_SECRET_KEY:"
Write-Host $jwt
Write-Host ""
Write-Host "PUBLIC_DRIVER_APPLICANT_KEY (Landmark site apiKey):"
Write-Host $publicApplicantKey
Write-Host "=========================================================" -ForegroundColor Yellow
Write-Host ""

$dbRef = '${{Postgres.DATABASE_URL}}'
$manualVarHint = 'DATABASE_URL = ${{Postgres.DATABASE_URL}}  (use Railway variable reference UI, or CLI below)'

if ($ApplyVars) {
    if (-not $ServiceName) {
        Write-Error "Use -ApplyVars together with -ServiceName `"Your API service name`" (the Dockerfile / Taylor Access API service, not Postgres)."
    }
    Write-Host "Setting variables on service: $ServiceName"
    & railway variable set -s $ServiceName `
        "DATABASE_URL=$dbRef" `
        "JWT_SECRET_KEY=$jwt" `
        "PUBLIC_DRIVER_APPLICANT_KEY=$publicApplicantKey" `
        --skip-deploys
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Variable set failed. Set in Railway UI: $manualVarHint plus JWT_SECRET_KEY and PUBLIC_DRIVER_APPLICANT_KEY (values above)."
    }
}
else {
    Write-Host "Next steps:"
    Write-Host "  1) Deploy once so Railway creates the API service:  railway up -d"
    Write-Host "  2) In the dashboard, open that service (not Postgres) and set variables, OR run:"
    Write-Host ('      railway variable set -s "<API_SERVICE_NAME>" DATABASE_URL=' + $dbRef + ' JWT_SECRET_KEY="' + $jwt + '" PUBLIC_DRIVER_APPLICANT_KEY="' + $publicApplicantKey + '" --skip-deploys')
    Write-Host "  3) Redeploy if needed: railway up -d"
    Write-Host ""
}

if (-not $SkipDeploy -and -not $ApplyVars) {
    Write-Host "Starting first deploy (detached). If it fails on DB, set variables from step 2 then redeploy."
    railway up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Deploy exited non-zero (common until DATABASE_URL / JWT are set). Fix variables in Railway, then: railway up -d"
    }
}
elseif ($ApplyVars -and -not $SkipDeploy) {
    Write-Host "Redeploying after variable update..."
    railway up -d
}

Write-Host ""
Write-Host "Useful: railway status   |   Health: GET https://<public-host>/health"
Write-Host "Driver apply: POST .../api/v1/public/applicants/driver-application"
