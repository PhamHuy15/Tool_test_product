#define AppName "Local AI Test Web"
#define AppVersion "1.1.0"
#define AppPublisher "Local AI Test Web"
#define AppExeName "start-local-ai-test.cmd"

[Setup]
AppId={{A9BB1D8B-7E9B-4E7D-BE12-7E3A5C5AFD43}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Local AI Test Web
DefaultGroupName={#AppName}
OutputDir=dist
OutputBaseFilename=LocalAITestWeb-Setup-{#AppVersion}
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
WizardStyle=modern

[Files]
Source: "server\*"; DestDir: "{app}\server"; Flags: recursesubdirs ignoreversion; Excludes: "node_modules\*"
Source: "public\*"; DestDir: "{app}\public"; Flags: recursesubdirs ignoreversion
Source: "prompts\*"; DestDir: "{app}\prompts"; Flags: recursesubdirs ignoreversion
Source: "scripts\start-local-ai-test.cmd"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\runs"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\scripts\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\scripts\{#AppExeName}"; WorkingDir: "{app}"

[Run]
Filename: "{app}\scripts\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: postinstall nowait skipifsilent
