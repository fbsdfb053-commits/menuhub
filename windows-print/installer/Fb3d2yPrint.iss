#define MyAppName "Fb3d2y Print"
#define MyAppVersion "0.2.8"
#define MyAppPublisher "Fb3d2y Menu"
#define MyAppExeName "Fb3d2yPrint.exe"

[Setup]
AppId={{A4C9E32D-8D14-4B3B-9D0A-2F3B7C9A0288}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Fb3d2y Print
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\artifacts
OutputBaseFilename=Fb3d2yPrint-Setup
SetupIconFile=fb3d2y-print.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
PrivilegesRequired=admin
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\bin\Release\net8.0-windows\win-x64\publish\Fb3d2yPrint.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Fb3d2y Print"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Fb3d2y Print"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Fb3d2y Print"; Flags: postinstall nowait skipifsilent
