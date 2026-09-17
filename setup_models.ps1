#Requires -Version 5.1
<#
Clones the original ACE-Step-1.5 and audio.cpp (YuE2) repositories into
external/, applies Remiqora's small patches on top (see
external/patches/README.md), and builds/prepares each engine.

Re-run any time - every step is idempotent (skips work that is already done).
#>

param(
    [switch]$SkipBuild,
    [switch]$SkipWeights
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$externalDir = Join-Path $root "external"
$patchesDir = Join-Path $externalDir "patches"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "== $msg ==" -ForegroundColor Cyan
}

function Assert-Command($name, $installHint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "[MISSING] '$name' is not on PATH. $installHint" -ForegroundColor Yellow
        return $false
    }
    return $true
}

function Initialize-Repo($dirName, $repoUrl, $refName, $patchFile) {
    $dir = Join-Path $externalDir $dirName
    if (-not (Test-Path $dir)) {
        Write-Host "Cloning $repoUrl ..."
        git clone $repoUrl $dir
    }

    Push-Location $dir
    try {
        $markerFile = Join-Path $dir ".remiqora-setup-done"
        $alreadyDone = Test-Path $markerFile
        if (-not $alreadyDone) {
            Write-Host "Checking out $refName ..."
            git fetch origin $refName --depth 1 2>$null
            git checkout $refName 2>$null
            if ($LASTEXITCODE -ne 0) {
                # Shallow fetch may not contain the exact commit if history was
                # rewritten upstream; fall back to a full fetch.
                git fetch origin --unshallow 2>$null
                git checkout $refName
            }

            if ($patchFile) {
                Write-Host "Applying $(Split-Path -Leaf $patchFile) ..."
                git apply --whitespace=nowarn $patchFile
            }
            New-Item -ItemType File -Path $markerFile -Force | Out-Null
        } else {
            Write-Host "Already checked out and patched, skipping."
        }
    } finally {
        Pop-Location
    }
    return $dir
}

Write-Step "ACE-Step-1.5"
$aceDir = Initialize-Repo "ACE-Step-1.5" "https://github.com/ace-step/ACE-Step-1.5.git" "ca1e85f" (Join-Path $patchesDir "ace-step.patch")

if (Assert-Command "uv" "Install it from https://docs.astral.sh/uv/getting-started/installation/") {
    Push-Location $aceDir
    try {
        Write-Host "Running 'uv sync' (this also pulls the CUDA build of PyTorch, can take a while) ..."
        uv sync
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Skipped 'uv sync' - install uv and re-run this script." -ForegroundColor Yellow
}

Write-Step "audio.cpp (YuE2)"
# No patch needed here anymore - upstream's dev branch now natively exposes
# the generated/used ABC plan as a response artifact (the one thing our own
# patch used to add), so this is a plain checkout. dev is a moving,
# occasionally force-pushed branch upstream; if this exact commit 404s, bump
# it to a current dev commit (see external/patches/README.md).
$audioCppDir = Initialize-Repo "audio.cpp" "https://github.com/0xShug0/audio.cpp.git" "39f9013" $null

if ($SkipBuild) {
    Write-Host "Skipping build (-SkipBuild passed)."
} else {
    $haveCmake = Assert-Command "cmake" "Install CMake from https://cmake.org/download/"
    $haveNvcc = Assert-Command "nvcc" "Install the CUDA Toolkit from https://developer.nvidia.com/cuda-downloads"
    if ($haveCmake -and $haveNvcc) {
        Push-Location $audioCppDir
        try {
            Write-Host "Building audiocpp_server (CUDA release, yue2+sheetsage2+muscriptor) ..."
            Write-Host "This needs Visual Studio Build Tools (C++ workload) on PATH; if the build" -ForegroundColor DarkGray
            Write-Host "fails here, open a 'Developer PowerShell for VS' and re-run this script." -ForegroundColor DarkGray
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\build_windows.ps1" `
                -Preset windows-cuda-release `
                -ModelSet custom -Models "yue2,sheetsage2,muscriptor" `
                -NativeModelManager `
                -Target audiocpp_server
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "Skipped native build - install the missing tools above, then re-run:" -ForegroundColor Yellow
        Write-Host "  .\setup_models.ps1 " -NoNewline -ForegroundColor Yellow
        Write-Host "(or run the build manually per external/audio.cpp/README.md)" -ForegroundColor Yellow
    }
}

if ($SkipWeights) {
    Write-Step "YuE2/SheetSage2/MuScriptor weights"
    Write-Host "Skipping weight downloads (-SkipWeights passed)."
} elseif (Assert-Command "python" "Install Python 3 and put it on PATH.") {
    Write-Step "YuE2/SheetSage2/MuScriptor weights (~10 GB total)"
    Push-Location $audioCppDir
    try {
        foreach ($pkg in "yue2_main_q8_0", "yue2_main_q4_0", "yue2_vae_f16", "sheetsage2_orig", "muscriptor_small_f32") {
            Write-Host "Installing $pkg ..."
            python tools/model_manager_v2.py install $pkg
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Skipped weight downloads - install Python and re-run this script." -ForegroundColor Yellow
}
# ACE-Step's own checkpoints (acestep-v15-sft, LM, VAE, ...) are not fetched
# here - acestep-api downloads them itself via HuggingFace/ModelScope on its
# first request, the same way its Gradio UI does.

Write-Step "backend/.env"
$envExample = Join-Path $root "backend\.env.example"
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) {
    (Get-Content $envExample) `
        -replace [regex]::Escape("E:\AI\ACE\ACE-Step-1.5"), $aceDir `
        -replace [regex]::Escape("E:\AI\YuE2-3B"), $audioCppDir `
        | Set-Content $envFile
    Write-Host "Wrote backend/.env pointing at the cloned repos."
    Write-Host "Still edit FFMPEG_BIN_DIR and CUDA_BIN_DIR in backend/.env for your machine." -ForegroundColor Yellow
} else {
    Write-Host "backend/.env already exists - not overwriting. Cloned repo paths:"
    Write-Host "  ACE_STEP_DIR=$aceDir"
    Write-Host "  YUE2_DIR=$audioCppDir"
}

Write-Step "Done"
Write-Host "Remaining manual steps (see README.md):"
Write-Host "  - Install ffmpeg and point FFMPEG_BIN_DIR at its bin folder."
Write-Host "  - ACE-Step's own checkpoints download automatically on its first request."
Write-Host "  - Then run dev.bat or prod_run.bat."
