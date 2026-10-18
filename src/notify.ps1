param([string]$MsgFile)
# 手机留言到电脑时的本地提醒：响提示音 + 弹一个置顶小提示框（10 秒后自动消失）
# 由 remote.py 以隐藏窗口方式调用；消息正文经 UTF-8 文件传入，避免中文命令行编码问题。
#
# 为什么不用系统通知：
#   - WinRT toast（ToastNotificationManager）需要事先注册 AppId，用 powershell.exe 的
#     AppId 调 Show() 会「返回成功但界面上什么都不显示」；
#   - NotifyIcon 的 ShowBalloonTip 在无消息泵的脚本里也不会渲染。
#   所以这里直接画一个自绘提示框，行为完全可控。
$ErrorActionPreference = 'SilentlyContinue'

$text = ''
try { $text = (Get-Content -LiteralPath $MsgFile -Raw -Encoding UTF8).Trim() } catch {}
if (-not $text) { $text = '(空消息)' }
if ($text.Length -gt 300) { $text = $text.Substring(0, 300) + ' …' }

# ---- 1) 提示音（用户选定的清脆音；找不到就退回挂件里的副本）----
$wav = ''
try { [System.Media.SystemSounds]::Asterisk.Play() } catch {}
if (Test-Path -LiteralPath $wav) {
    try { (New-Object System.Media.SoundPlayer $wav).PlaySync() } catch {}
}

# ---- 2) 置顶提示框 ----
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$f = New-Object System.Windows.Forms.Form
$f.Text = '手机留言'
$f.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow
$f.ShowInTaskbar = $false
$f.TopMost = $true
$f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$f.BackColor = [System.Drawing.Color]::FromArgb(255, 250, 250, 252)
$f.ClientSize = New-Object System.Drawing.Size(430, 186)

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$f.Location = New-Object System.Drawing.Point(($wa.Right - $f.Width - 24), ($wa.Bottom - $f.Height - 20))

$title = New-Object System.Windows.Forms.Label
$title.Text = '手机留言到了'
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei', 12, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(255, 24, 84, 152)
$title.Location = New-Object System.Drawing.Point(16, 12)
$title.AutoSize = $true
$f.Controls.Add($title)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = '手机发来的留言已记录到电脑'
$hint.Font = New-Object System.Drawing.Font('Microsoft YaHei', 8.5)
$hint.ForeColor = [System.Drawing.Color]::FromArgb(255, 120, 120, 128)
$hint.Location = New-Object System.Drawing.Point(18, 42)
$hint.AutoSize = $true
$f.Controls.Add($hint)

$body = New-Object System.Windows.Forms.TextBox
$body.Multiline = $true
$body.ReadOnly = $true
$body.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$body.BackColor = [System.Drawing.Color]::White
$body.Font = New-Object System.Drawing.Font('Microsoft YaHei', 10.5)
$body.Location = New-Object System.Drawing.Point(18, 66)
$body.Size = New-Object System.Drawing.Size(394, 78)
$body.Text = $text
$f.Controls.Add($body)

$btn = New-Object System.Windows.Forms.Button
$btn.Text = '知道了'
$btn.Font = New-Object System.Drawing.Font('Microsoft YaHei', 9)
$btn.Location = New-Object System.Drawing.Point(336, 150)
$btn.Size = New-Object System.Drawing.Size(76, 26)
$btn.Add_Click({ $f.Close() })
$f.Controls.Add($btn)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.Add_Tick({ $timer.Stop(); $f.Close() })
$timer.Start()

[void]$f.ShowDialog()
