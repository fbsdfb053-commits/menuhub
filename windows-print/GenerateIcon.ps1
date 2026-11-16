$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 64,64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$orange = [System.Drawing.Color]::FromArgb(230,103,32)
$white = [System.Drawing.Color]::White
$bg = New-Object System.Drawing.SolidBrush($orange)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(2,2,18,18,180,90); $path.AddArc(44,2,18,18,270,90); $path.AddArc(44,44,18,18,0,90); $path.AddArc(2,44,18,18,90,90); $path.CloseFigure()
$g.FillPath($bg,$path)
$pen = New-Object System.Drawing.Pen($white,4)
$g.DrawRectangle($pen,15,24,34,20)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($white)),20,14,24,15)
$g.DrawLine($pen,21,36,43,36)
$g.DrawLine($pen,21,42,43,42)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($white)),23,46,18,5)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$out = Join-Path $PSScriptRoot "fb3d2y-print.ico"
$fs = [System.IO.File]::Create($out)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
$bw.Write([Byte]64); $bw.Write([Byte]64); $bw.Write([Byte]0); $bw.Write([Byte]0)
$bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$png.Length)
$bw.Write([UInt32]22); $bw.Write($png)
$bw.Close(); $fs.Close()
$g.Dispose(); $bmp.Dispose(); $ms.Dispose()
