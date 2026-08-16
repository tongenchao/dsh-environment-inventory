Option Explicit
' Stop DeepSeek Harness web service (kill only the process listening on 3080)
Dim ws, fso, tmp
Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
tmp = fso.GetSpecialFolder(2) & "\dsh_pid.txt"
If fso.FileExists(tmp) Then fso.DeleteFile tmp
ws.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :3080 ^| findstr LISTENING') do @echo %a> """ & tmp & """", 0, True
If fso.FileExists(tmp) Then
    Dim pid
    pid = Trim(fso.OpenTextFile(tmp).ReadAll)
    If pid <> "" Then
        ws.Run "taskkill /F /PID " & pid, 0, True
        MsgBox "DSH 服务已停止 (PID " & pid & ")", 64, "DeepSeek Harness"
    Else
        MsgBox "未发现运行中的 DSH 服务。", 64, "DeepSeek Harness"
    End If
Else
    MsgBox "未发现运行中的 DSH 服务。", 64, "DeepSeek Harness"
End If