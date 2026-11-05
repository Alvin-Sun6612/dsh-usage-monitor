<#
  一键把 dsh-usage-monitor 装进指定的 DSH profile。
  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Profile web
  说明：Desktop 版的 profile 固定是 desktop；装完需要重启 DSH（或让市场/宿主热加载）。
#>
param(
  [string]$Profile = 'desktop',
  [string]$PluginPath = (Split-Path -Parent $PSCommandPath)
)

$ErrorActionPreference = 'Stop'

# PS 5.1 默认按 ANSI 读文件，含中文的 JSON 必须显式 UTF8。
$manifestPath = Join-Path $PluginPath 'package.json'
if (-not (Test-Path $manifestPath)) {
  throw "找不到 $manifestPath —— 请在插件目录里运行本脚本。"
}
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$name = $manifest.name
if (-not $manifest.dsh -or -not $manifest.dsh.bundle -or -not $manifest.dsh.bundle.patch) {
  throw "package.json 缺少 dsh.bundle.patch，DSH 不会把它当成组合包。"
}

$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
if (-not (Test-Path $dsh)) {
  $dsh = (Get-Command dsh -ErrorAction SilentlyContinue).Source
}
if (-not $dsh) {
  throw "找不到 dsh 命令。请从 DSH 安装目录运行，或把 dsh 加入 PATH。"
}

$target = 'link:' + ($PluginPath -replace '\\', '/')
Write-Host "profile : $Profile"
Write-Host "plugin  : $name"
Write-Host "source  : $target"
Write-Host ""

& $dsh plugin --profile $Profile add $target
if ($LASTEXITCODE -ne 0) {
  throw "dsh plugin add 失败（exit $LASTEXITCODE）。"
}

$profileManifest = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\package.json"
if (Test-Path $profileManifest) {
  $dshProfile = Get-Content $profileManifest -Raw -Encoding UTF8 | ConvertFrom-Json
  $bundles = @($dshProfile.dsh.profile.bundles)
  if ($bundles -contains $name) {
    Write-Host "`n已登记为组合包：$name"
  } else {
    Write-Warning "命令成功，但 $profileManifest 的 bundles 里没有 $name，请检查输出。"
  }
}

Write-Host ""
Write-Host "下一步：重启 DSH（Desktop 版退出后重新打开），然后从侧边栏打开「用量与余额」。"
Write-Host "卸载：& '$dsh' plugin --profile $Profile remove $name"
