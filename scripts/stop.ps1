$ErrorActionPreference = 'Stop'

$ContainerName = 'pm-mvp'
$Filter = 'name=^/' + $ContainerName + '$'
$ExistingContainer = (& docker container ls --all --filter $Filter --format '{{.Names}}' 2>&1)
if ($LASTEXITCODE -ne 0) {
    Write-Error $ExistingContainer
    exit $LASTEXITCODE
}

if ($ExistingContainer.Trim() -ne $ContainerName) {
    Write-Output "Container $ContainerName does not exist."
    exit 0
}

$IsRunning = (& docker container inspect --format '{{.State.Running}}' $ContainerName 2>&1)
if ($LASTEXITCODE -ne 0) {
    Write-Error $IsRunning
    exit $LASTEXITCODE
}

if ($IsRunning.Trim() -eq 'true') {
    & docker container stop $ContainerName
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} else {
    Write-Output "Container $ContainerName is already stopped."
}
