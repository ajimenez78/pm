$ErrorActionPreference = 'Stop'

$RootDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ContainerName = 'pm-mvp'
$ImageName = 'pm-mvp'
$Filter = 'name=^/' + $ContainerName + '$'

$ExistingContainer = (& docker container ls --all --filter $Filter --format '{{.Names}}' 2>&1)
if ($LASTEXITCODE -ne 0) {
    Write-Error $ExistingContainer
    exit $LASTEXITCODE
}
$ExistingContainer = $ExistingContainer.Trim()

if ($ExistingContainer -eq $ContainerName) {
    $IsRunning = (& docker container inspect --format '{{.State.Running}}' $ContainerName 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Write-Error $IsRunning
        exit $LASTEXITCODE
    }
    if ($IsRunning.Trim() -eq 'true') {
        Write-Output "Container $ContainerName is already running."
        exit 0
    }
}

& docker build --tag $ImageName $RootDirectory
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if ($ExistingContainer -eq $ContainerName) {
    & docker container rm $ContainerName
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$DockerArguments = @(
    'run',
    '--detach',
    '--name', $ContainerName,
    '--publish', '8000:8000',
    '--volume', 'pm-mvp-data:/app/data'
)
$EnvironmentFile = Join-Path $RootDirectory '.env'
if (Test-Path $EnvironmentFile) {
    $DockerArguments += @('--env-file', $EnvironmentFile)
}
$DockerArguments += $ImageName

& docker @DockerArguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
