param([Parameter(Mandatory=$true)][string]$Path, [switch]$CreateDirectory)
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($CreateDirectory -and -not (Test-Path -LiteralPath $Path)) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($id in @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new($id), 'FullControl',
            'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    [IO.Directory]::CreateDirectory($Path, $acl) | Out-Null
}
$item = Get-Item -LiteralPath $Path -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Loop private path is not private: reparse point' }
if ($CreateDirectory -and -not $item.PSIsContainer) { throw 'Loop private path is not a directory' }
$acl = $item.GetAccessControl()
$descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
if ($null -eq $descriptor.DiscretionaryAcl) { throw 'Loop private path has an unrestricted ACL' }
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Loop private path has another owner' }
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
        throw 'Loop private path grants access to another identity'
    }
}
