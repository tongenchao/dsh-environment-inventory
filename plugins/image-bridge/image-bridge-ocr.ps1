# image-bridge-ocr.ps1 — Windows built-in OCR (WinRT) backend for the DSH
# image-bridge plugin. Zero external dependencies; uses the OS OCR engine.
# Works in Windows PowerShell 5.1 and PowerShell 7.
#
# Input : $env:IMAGE_BRIDGE_OCR_IMAGE = absolute path to a PNG/JPEG/GIF file
#         (WebP is only supported under PowerShell 7; under 5.1 the caller
#         should fall back to another backend for WebP)
# Output: stdout lines, one per recognized text line:
#           <text>\t<x>\t<y>\t<w>\t<h>
# Exit  : 0 on success (possibly with zero lines), 1 on failure.

$ErrorActionPreference = 'Stop'

# Pipe output as UTF-8 so Node-side consumers decode text correctly.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$imagePath = $env:IMAGE_BRIDGE_OCR_IMAGE
if ([string]::IsNullOrWhiteSpace($imagePath)) {
    Write-Error 'IMAGE_BRIDGE_OCR_IMAGE is not set'
    exit 1
}
if (-not (Test-Path -LiteralPath $imagePath)) {
    Write-Error "image not found: $imagePath"
    exit 1
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

# --- WinRT async helpers (edition-dependent) ---
$isCore = $PSVersionTable.PSEdition -eq 'Core'
if ($isCore) {
    function Await([object]$Op) {
        return $Op.GetAwaiter().GetResult()
    }
} else {
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
    if ($null -eq $asTaskGeneric) {
        Write-Error 'AsTask helper not found'
        exit 1
    }
    function Await([object]$Op, [Type]$ResultType) {
        $m = $asTaskGeneric.MakeGenericMethod($ResultType)
        $task = $m.Invoke($null, @($Op))
        $null = $task.Wait(-1)
        return $task.Result
    }
}

try {
    [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
    [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
} catch {
    Write-Error "WinRT OCR types unavailable: $($_.Exception.Message)"
    exit 1
}

# --- Decode the image into a SoftwareBitmap ---
$bitmap = $null
if ($isCore) {
    try {
        [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
        [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath))
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
        try {
            $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
            $bitmap = Await ($decoder.GetSoftwareBitmapAsync())
        } finally {
            $stream.Dispose()
        }
    } catch {
        Write-Error "image decode failed (PowerShell 7 path): $($_.Exception.Message)"
        exit 1
    }
} else {
    # PS 5.1: interface-typed IAsyncOperation<T> cannot be awaited via AsTask,
    # so decode synchronously with System.Drawing (PNG/JPEG/GIF).
    try {
        Add-Type -AssemblyName System.Drawing | Out-Null
        $img = [System.Drawing.Bitmap]::FromFile($imagePath)
    } catch {
        Write-Error "image decode failed (System.Drawing): $($_.Exception.Message)"
        exit 1
    }
    try {
        $w = $img.Width
        $h = $img.Height
        $maxDim = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
        if ($w -gt $maxDim -or $h -gt $maxDim) {
            Write-Error "image ${w}x${h} exceeds OCR max dimension $maxDim"
            exit 1
        }
        $rect = [System.Drawing.Rectangle]::new(0, 0, $w, $h)
        $data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $bytes = New-Object byte[] ($w * $h * 4)
            [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
        } finally {
            $img.UnlockBits($data)
        }
        $img.Dispose()
        $img = $null
        $buffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
        $bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer(
            $buffer, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, $w, $h)
    } catch {
        if ($null -ne $img) { $img.Dispose() }
        Write-Error "pixel conversion failed: $($_.Exception.Message)"
        exit 1
    }
}

# --- Pick an OCR engine: zh-Hans-CN, zh-CN, en-US, then user profile languages ---
$engine = $null
foreach ($tag in @('zh-Hans-CN', 'zh-CN', 'en-US')) {
    try {
        $lang = [Windows.Globalization.Language]::new($tag)
        $candidate = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
        if ($null -ne $candidate) { $engine = $candidate; break }
    } catch { }
}
if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if ($null -eq $engine) {
    Write-Error 'no OCR engine available (missing language pack?)'
    exit 1
}

# --- Recognize and print lines ---
if ($isCore) {
    $result = Await ($engine.RecognizeAsync($bitmap))
} else {
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
}
foreach ($line in $result.Lines) {
    $x = [int]::MaxValue; $y = [int]::MaxValue
    $x2 = [int]::MinValue; $y2 = [int]::MinValue
    foreach ($word in $line.Words) {
        $r = $word.BoundingRect
        $nx = [int]$r.X; $ny = [int]$r.Y
        $nx2 = $nx + [int]$r.Width; $ny2 = $ny + [int]$r.Height
        if ($nx -lt $x) { $x = $nx }
        if ($ny -lt $y) { $y = $ny }
        if ($nx2 -gt $x2) { $x2 = $nx2 }
        if ($ny2 -gt $y2) { $y2 = $ny2 }
    }
    if ($x -eq [int]::MaxValue) { $x = 0; $y = 0; $x2 = 0; $y2 = 0 }
    $text = $line.Text -replace "`t", ' ' -replace "`r", ' ' -replace "`n", ' '
    Write-Output ("{0}`t{1}`t{2}`t{3}`t{4}" -f $text, $x, $y, ($x2 - $x), ($y2 - $y))
}
exit 0
