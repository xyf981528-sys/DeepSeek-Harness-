@echo off
chcp 936 >nul
cd /d "%~dp0"
echo [1/2] 安装 PyInstaller ...
python -m pip install --upgrade pyinstaller
if errorlevel 1 goto err
echo [2/2] 打包 ...
python -m PyInstaller --noconfirm --clean --onefile --windowed --name "手机远程控制台" --add-data "src\notify.ps1;." src\app.py
if errorlevel 1 goto err
echo.
echo 完成: dist\手机远程控制台.exe
goto end
:err
echo [失败] 需要先安装 Python 3 并勾选 Add to PATH
:end
pause
