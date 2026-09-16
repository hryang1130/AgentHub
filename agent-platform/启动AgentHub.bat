@echo off
chcp 65001 >nul
title AgentHub 启动器
set NODE=C:\Users\kevin\.workbuddy\binaries\node\versions\22.22.2-2\node.exe
rem 脚本自动定位到自身所在目录，搬迁后无需修改
set DIR=%~dp0
rem 去掉结尾反斜杠
if "%DIR:~-1%"=="\" set DIR=%DIR:~0,-1%

echo [1/3] 启动注册平台 + 交易市场 (端口 8800)...
start "AgentHub Platform" /D "%DIR%" "%NODE%" "%DIR%\server.js"

timeout /t 2 /nobreak >nul
echo [2/3] 启动 Agent: NovaBot 行情助手 (端口 8801)...
start "NovaBot" /D "%DIR%\agents" "%NODE%" "%DIR%\agents\demo-agent.js" --port 8801 --name "NovaBot 行情助手" --role oracle

timeout /t 2 /nobreak >nul
echo [3/3] 启动 Agent: LyraBot 分析师 (端口 8802)...
start "LyraBot" /D "%DIR%\agents" "%NODE%" "%DIR%\agents\demo-agent.js" --port 8802 --name "LyraBot 分析师" --role analyst

timeout /t 4 /nobreak >nul
start http://localhost:8800
echo.
echo 全部启动完成！浏览器应已打开 http://localhost:8800
echo 关闭对应的命令行窗口即可停止各服务。
pause
