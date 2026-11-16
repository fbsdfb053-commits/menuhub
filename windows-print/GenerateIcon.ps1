$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Um arquivo ICO completo: Windows escolhe a melhor resolução para cada lugar.
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 64.0
    $orange = [System.Drawing.Color]::FromArgb(230, 103, 32)
    $white = [System.Drawing.Color]::White
    $bg = New-Object System.Drawing.SolidBrush($orange)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = [Math]::Max(2.0, 10.0 * $scale)
    $diameter = $radius * 2
    $path.AddArc(2*$scale, 2*$scale, $diameter, $diameter, 180, 90)
    $path.AddArc(($size - 2*$scale - $diameter), 2*$scale, $diameter, $diameter, 270, 90)
    $path.AddArc(($size - 2*$scale - $diameter), ($size - 2*$scale - $diameter), $diameter, $diameter, 0, 90)
    $path.AddArc(2*$scale, ($size - 2*$scale - $diameter), $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $g.FillPath($bg, $path)

    $penWidth = [Math]::Max(1.0, 3.5 * $scale)
    $pen = New-Object System.Drawing.Pen($white, $penWidth)
    $g.DrawRectangle($pen, [single](15*$scale), [single](25*$scale), [single](34*$scale), [single](20*$scale))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($white)), [single](21*$scale), [single](15*$scale), [single](22*$scale), [single](13*$scale))
    $g.DrawLine($pen, [single](22*$scale), [single](35*$scale), [single](42*$scale), [single](35*$scale))
    $g.DrawLine($pen, [single](22*$scale), [single](41*$scale), [single](42*$scale), [single](41*$scale))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($white)), [single](23*$scale), [single](47*$scale), [single](18*$scale), [single](4*$scale))

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += ,@{ Size = $size; Bytes = $ms.ToArray() }

    $ms.Dispose()
    $pen.Dispose()
    $path.Dispose()
    $bg.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$out = Join-Path $PSScriptRoot "fb3d2y-print.ico"
$fs = [System.IO.File]::Create($out)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$frames.Count)

$offset = 6 + (16 * $frames.Count)
foreach ($frame in $frames) {
    $dimension = if ($frame.Size -eq 256) { [byte]0 } else { [byte]$frame.Size }
    $bw.Write($dimension)
    $bw.Write($dimension)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$frame.Bytes.Length)
    $bw.Write([UInt32]$offset)
    $offset += $frame.Bytes.Length
}
foreach ($frame in $frames) { $bw.Write($frame.Bytes) }
$bw.Close()
$fs.Close()
Write-Host "Ícone criado com tamanhos: $($sizes -join ', ') px"
