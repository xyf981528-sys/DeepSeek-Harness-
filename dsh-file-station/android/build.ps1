$ErrorActionPreference = 'Stop'
$root = 'D:\DeepSeek Y\dsh-file-station\android'
$tools = 'D:\DeepSeek Y\tools\android'

function Expand-Once($zip, $dest) {
  if (!(Test-Path $dest)) { Expand-Archive -Path $zip -DestinationPath $dest -Force }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
}

Expand-Once (Join-Path $tools 'jdk17.zip') (Join-Path $tools 'jdk')
Expand-Once (Join-Path $tools 'build-tools.zip') (Join-Path $tools 'bt')
Expand-Once (Join-Path $tools 'platform.zip') (Join-Path $tools 'platform')

$javac = Get-ChildItem (Join-Path $tools 'jdk') -Recurse -Filter javac.exe | Select-Object -First 1
if (!$javac) { throw 'javac not found' }
$javaHome = Split-Path (Split-Path $javac.FullName -Parent) -Parent
$env:JAVA_HOME = $javaHome
$env:PATH = "$($javac.DirectoryName);$env:PATH"

$aapt2 = Get-ChildItem (Join-Path $tools 'bt') -Recurse -Filter aapt2.exe | Select-Object -First 1
$d8 = Get-ChildItem (Join-Path $tools 'bt') -Recurse -Filter d8.bat | Select-Object -First 1
$zipalign = Get-ChildItem (Join-Path $tools 'bt') -Recurse -Filter zipalign.exe | Select-Object -First 1
$apksigner = Get-ChildItem (Join-Path $tools 'bt') -Recurse -Filter apksigner.bat | Select-Object -First 1
$androidJar = Get-ChildItem (Join-Path $tools 'platform') -Recurse -Filter android.jar | Select-Object -First 1
foreach ($x in @($aapt2, $d8, $zipalign, $apksigner, $androidJar)) {
  if (!$x) { throw 'Android build tool missing' }
}
"JAVA_HOME=$javaHome"
"aapt2=$($aapt2.FullName)"
"android.jar=$($androidJar.FullName)"

$work = Join-Path $root 'build'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
$compiled = Join-Path $work 'compiled'
$gen = Join-Path $work 'gen'
$classes = Join-Path $work 'classes'
$dex = Join-Path $work 'dex'
New-Item -ItemType Directory -Force -Path $compiled, $gen, $classes, $dex | Out-Null

Get-ChildItem (Join-Path $root 'res') -Recurse -File | ForEach-Object {
  & $aapt2.FullName compile $_.FullName -o $compiled
  if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed: $($_.FullName)" }
}
$flats = @(Get-ChildItem $compiled -Filter *.flat | ForEach-Object { $_.FullName })

$unsigned = Join-Path $work 'unsigned.apk'
& $aapt2.FullName link -o $unsigned -I $androidJar.FullName --manifest (Join-Path $root 'AndroidManifest.xml') --java $gen --min-sdk-version 24 --target-sdk-version 34 @flats
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

$srcFiles = @(Get-ChildItem (Join-Path $root 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$rJava = @(Get-ChildItem $gen -Recurse -Filter R.java | ForEach-Object { $_.FullName })
& $javac.FullName -source 8 -target 8 -encoding UTF-8 -classpath $androidJar.FullName -d $classes @rJava @srcFiles
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

$classFiles = @(Get-ChildItem $classes -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& $d8.FullName --lib $androidJar.FullName --release --min-api 24 --output $dex @classFiles
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

$appApk = Join-Path $work 'app.apk'
Copy-Item $unsigned $appApk -Force
& (Join-Path $javaHome 'bin\jar.exe') uf $appApk -C $dex classes.dex
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }

$aligned = Join-Path $work 'aligned.apk'
& $zipalign.FullName -f 4 $appApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

$ks = Join-Path $root 'debug.keystore'
if (!(Test-Path $ks)) {
  & (Join-Path $javaHome 'bin\keytool.exe') -genkeypair -keystore $ks -alias androiddebugkey -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$out = Join-Path $dist 'filestation.apk'
& $apksigner.FullName sign --ks $ks --ks-pass pass:android --key-pass pass:android --out $out $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed' }
& $apksigner.FullName verify --verbose $out
"OUTPUT=$out"
"MB=" + [math]::Round((Get-Item $out).Length / 1MB, 2)
