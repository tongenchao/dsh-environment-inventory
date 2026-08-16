Option Explicit
' DeepSeek Harness silent launcher (no console window, no powershell)
Dim ws, fso, tmp, size, i, ok
Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
tmp = fso.GetSpecialFolder(2) & "\dsh_port.txt"

' check if 3080 already listening
If fso.FileExists(tmp) Then fso.DeleteFile tmp
ws.Run "cmd /c netstat -ano | findstr :3080 | findstr LISTENING > """ & tmp & """", 0, True
size = 0
If fso.FileExists(tmp) Then size = fso.GetFile(tmp).Size
If size > 0 Then
    ws.Run "http://127.0.0.1:3080", 1, False
    WScript.Quit
End If

' start DSH web service hidden
ws.Run """C:\Users\32169\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\.bin\dsh.cmd"" web", 0, False

' wait up to 60s for port ready
ok = False
For i = 1 To 60
    WScript.Sleep 1000
    If fso.FileExists(tmp) Then fso.DeleteFile tmp
    ws.Run "cmd /c netstat -ano | findstr :3080 | findstr LISTENING > """ & tmp & """", 0, True
    If fso.FileExists(tmp) Then
        If fso.GetFile(tmp).Size > 0 Then
            ok = True
            Exit For
        End If
    End If
Next

If ok Then
    ws.Run "http://127.0.0.1:3080", 1, False
Else
    MsgBox "DSH 服务 60 秒内未能就绪，请检查。", 48, "DeepSeek Harness"
End If