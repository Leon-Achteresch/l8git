//! Stable, machine-readable error codes on top of the `Result<_, String>` command API.
//!
//! Wire format: `\x1f<English message>\x1fl8e:<JSON payload>\x1f`, payload `{"code":"…","params":{…}}`.
//! The message comes first so a raw display still reads acceptably (U+001F is invisible).
//! The unit separator never occurs in the message (it is replaced) or in the payload (JSON
//! escapes it), so a coded segment is unambiguous, cannot collide with plain messages and
//! can still be found and translated when other code wraps it in a longer message.
//! Uncoded errors stay plain strings. The frontend parser is `src/lib/backend-error.ts`;
//! both sides are tested against `src/lib/backend-error.fixtures.json`.

use serde_json::{Map, Value};

/// Set by the desktop app when it runs `l8gitd`, so l8gitd keeps codes in its stderr.
pub const CODED_STDERR_ENV: &str = "L8GITD_CODED_ERRORS";
const SEP: char = '\u{1f}';
const TAG: &str = "l8e:";

macro_rules! error_codes {
    ($($variant:ident = $code:literal => $en:literal,)*) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum ErrorCode { $($variant,)* }
        impl ErrorCode {
            #[cfg(test)]
            pub const ALL: &'static [ErrorCode] = &[$(ErrorCode::$variant,)*];
            pub fn code(self) -> &'static str { match self { $(ErrorCode::$variant => $code,)* } }
            /// English template; `{name}` placeholders match the params and en.json (`{{name}}`).
            pub fn english(self) -> &'static str { match self { $(ErrorCode::$variant => $en,)* } }
        }
    };
}

macro_rules! labels {
    ($($variant:ident = $id:literal => $en:literal,)*) => {
        /// Translatable nouns passed as the `field` or `feature` param.
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum Label { $($variant,)* }
        impl Label {
            #[cfg(test)]
            pub const ALL: &'static [Label] = &[$(Label::$variant,)*];
            pub fn id(self) -> &'static str { match self { $(Label::$variant => $id,)* } }
            pub fn english(self) -> &'static str { match self { $(Label::$variant => $en,)* } }
        }
    };
}

error_codes! {
    FieldRequired = "field.required" => "{field} must not be empty.",
    LeadingDash = "field.leadingDash" => "{field}: values starting with '-' are not allowed ({value}).",
    PathMissing = "path.missing" => "No path was given.",
    PathNotFolder = "path.notFolder" => "The path is not a folder.",
    PathNotFolderNamed = "path.notFolderNamed" => "'{path}' is not a folder.",
    PathNotFound = "path.notFound" => "The path does not exist: {path}",
    PathUnresolved = "path.unresolved" => "Could not resolve the path: {error}",
    WorkingDirUnresolved = "path.workingDirUnresolved" => "Could not resolve the working directory: {error}",
    RepoPathInvalid = "path.repoInvalid" => "The repository path is invalid.",
    FolderCreateFailed = "fs.folderCreateFailed" => "Could not create the folder: {error}",
    FolderReadFailed = "fs.folderReadFailed" => "Could not read the folder: {error}",
    FileReadFailed = "fs.fileReadFailed" => "Could not read the file: {error}",
    FileWriteFailed = "fs.fileWriteFailed" => "Could not write the file: {error}",
    FileNameInvalid = "fs.fileNameInvalid" => "Invalid file name.",
    WorkflowExtension = "fs.workflowExtension" => "Only .yml/.yaml files are allowed.",
    ConfigDirMissing = "config.dirMissing" => "No configuration folder was found.",
    ConfigWriteFailed = "config.writeFailed" => "Could not write the configuration: {error}",

    GitStartFailed = "git.startFailed" => "Could not start Git: {error}",
    GitPatchWriteFailed = "git.patchWriteFailed" => "Could not write the patch: {error}",
    PatchAbsolutePath = "patches.absolutePath" => "An absolute path is required: {path}",
    PatchSelectionEmpty = "patches.selectionEmpty" => "Select at least one patch file.",
    PatchFileMissing = "patches.fileMissing" => "Patch file not found: {path}",
    PatchMergeUnsupported = "patches.mergeUnsupported" => "Merge commits cannot be exported as patches.",
    PatchNoChanges = "patches.noChanges" => "There are no tracked changes to export.",
    PatchMixed = "patches.mixed" => "Select either mailbox patches or plain diffs, not both.",
    GitWaitFailed = "git.waitFailed" => "Waiting for Git failed: {error}",
    GitApplyFailed = "git.applyFailed" => "git apply failed.",
    GitUnknownRemote = "git.unknownRemote" => "Unknown remote: {remote}",
    GitHeadNotOnBranch = "git.headNotOnBranch" => "HEAD does not point to a branch.",
    GitUnknownMergeStrategy = "git.unknownMergeStrategy" => "Unknown merge strategy: {strategy}",
    GitMainlineParent = "git.mainlineParent" => "The mainline parent must be at least 1.",
    GitCommitHashRequired = "git.commitHashRequired" => "At least one commit hash is required.",
    GitInvalidRemoteRef = "git.invalidRemoteRef" => "Invalid remote ref (expected e.g. origin/branch).",
    GitDiscardListMismatch = "git.discardListMismatch" => "The untracked list must have the same length as the file list.",
    GitCurrentBranchUnknown = "git.currentBranchUnknown" => "Could not determine the current branch.",
    GitNoHeadCommit = "git.noHeadCommit" => "There is no HEAD commit.",
    GitNoOrigin = "git.noOrigin" => "No remote 'origin' is configured.",
    GitUnknownCommit = "git.unknownCommit" => "Unknown commit: {commit}",
    GitBranchExists = "git.branchExists" => "A branch named {branch} already exists.",
    GitRunFailed = "git.runFailed" => "Could not run Git: {error}",
    GitCommandFailed = "git.commandFailed" => "The Git command failed.",

    HookUnknownName = "hooks.unknownName" => "Unknown hook name: {name}",
    HookReadFailed = "hooks.readFailed" => "Could not read the hook: {error}",
    HookFolderCreateFailed = "hooks.folderCreateFailed" => "Could not create the hooks folder: {error}",
    HookWriteFailed = "hooks.writeFailed" => "Could not write the hook: {error}",
    HookPermissionsFailed = "hooks.permissionsFailed" => "Could not set the hook permissions: {error}",
    HookDeleteFailed = "hooks.deleteFailed" => "Could not delete the hook: {error}",
    HookNotInstalled = "hooks.notInstalled" => "Hook '{name}' is not installed.",
    HookStartFailed = "hooks.startFailed" => "Could not start the hook: {error}",

    UndoOperationInProgress = "undo.operationInProgress" => "A {operation} is in progress. Finish or abort it before undoing the last operation.",
    UndoResetBlockedByOperation = "undo.resetBlockedByOperation" => "A {operation} is in progress. Finish or abort it before resetting.",
    UndoNothingToUndo = "undo.nothingToUndo" => "There is nothing to undo.",
    UndoPreviewFailed = "undo.previewFailed" => "Could not create an undo preview: {error}",
    UndoInvalidSelector = "undo.invalidSelector" => "Invalid reflog selector: {selector}",
    UndoChanged = "undo.changed" => "The last operation changed after this preview.",
    UndoUnsupported = "undo.unsupported" => "Undo is not supported for this operation: {action}",
    UndoUnknownResetMode = "undo.unknownResetMode" => "Unknown reset mode: {mode}",
    UndoUnknownReflogEntry = "undo.unknownReflogEntry" => "Unknown reflog entry: {selector}",
    UndoReflogChanged = "undo.reflogChanged" => "The reflog changed after this entry was selected.",
    UndoHeadChanged = "undo.headChanged" => "HEAD changed after this entry was selected.",
    UndoLocalChanges = "undo.localChanges" => "Tracked files have local changes: {files}",
    UndoPathsBlocked = "undo.pathsBlocked" => "Local or ignored files would be overwritten: {files}",
    UndoInvalidBranchName = "undo.invalidBranchName" => "This is not a valid branch name.",
    UndoLockPoisoned = "undo.lockPoisoned" => "The repository recovery lock was poisoned.",
    UndoSafetyCheckFailed = "undo.safetyCheckFailed" => "Recovery could not run its safety check: {error}",
    UndoNonUtf8Paths = "undo.nonUtf8Paths" => "Recovery cannot safely check filenames that are not valid UTF-8. Use Git directly after reviewing those files.",
    UndoStatusUnreadable = "undo.statusUnreadable" => "Recovery could not safely read the working tree status.",
    UndoPathUnchecked = "undo.pathUnchecked" => "Recovery could not safely check a path: {path}",

    ProviderSignInRequired = "provider.signInRequired" => "{provider}: 401. Sign in to {host} in Settings.",
    ProviderNoCloneUrl = "provider.noCloneUrl" => "{provider}: the response contained no clone URL.",
    ProviderGithubSaml = "provider.githubSaml" => "GitHub 403: the personal access token is not authorized for SAML single sign-on. Authorize the token for the organization under {host} → Settings → Applications → Authorized OAuth Apps.",
    BitbucketUsernameMissing = "provider.bitbucketUsernameMissing" => "Bitbucket: username missing. Sign in to {host} in Settings with a username and app password.",
    BitbucketCredentialsRejected = "provider.bitbucketCredentialsRejected" => "Bitbucket: 401. The credentials do not match the REST API (app password or API token with your Atlassian email as username, or a valid OAuth access token). Check them or sign in again for {host} in Settings.",
    BitbucketInvalidApiUrl = "provider.bitbucketInvalidApiUrl" => "Bitbucket: invalid API URL.",
    BitbucketPageLimit = "provider.bitbucketPageLimit" => "Bitbucket: page limit reached during API pagination.",
    BitbucketForeignHost = "provider.bitbucketForeignHost" => "Bitbucket: pagination points to a different host; stopped.",
    BitbucketNoWorkspace = "provider.bitbucketNoWorkspace" => "Bitbucket: no workspace was found in which the repository could be created.",
    AzureCreateUnsupported = "provider.azureCreateUnsupported" => "Azure DevOps: creating repositories is not supported yet.",
    AzureListUnsupported = "provider.azureListUnsupported" => "Azure DevOps: listing repositories is not supported yet.",
    RepoNameTooLong = "provider.repoNameTooLong" => "The repository name is too long (max. 100 characters).",
    RepoNameInvalidChars = "provider.repoNameInvalidChars" => "The repository name may only contain letters, digits and - _ .",
    RemoteUrlUnrecognized = "pr.remoteUrlUnrecognized" => "Remote URL not recognized: {url}",
    PrDefaultBranchCompare = "pr.defaultBranchCompare" => "There is no meaningful pull request comparison for the default branch.",
    PrHeadBaseSame = "pr.headBaseSame" => "The head and base branches must be different.",
    PrBitbucketNoDraft = "pr.bitbucketNoDraft" => "Bitbucket does not support draft pull requests here.",
    PrBitbucketSourceBranch = "pr.bitbucketSourceBranch" => "Bitbucket: could not determine the source branch.",
    GithubOnly = "github.only" => "{feature} is only available for GitHub.",
    GithubRerunFailed = "github.rerunFailed" => "Re-run failed ({status}): {body}",
    GithubGraphqlError = "github.graphqlError" => "GitHub GraphQL error: {message}",
    GithubNoBranchProtection = "github.noBranchProtection" => "No branch protection rules are configured for '{branch}'.",

    CredentialsMissing = "credentials.missing" => "No credentials for {host}. Sign in to {host} in Settings.",
    CredentialsCanceled = "credentials.canceled" => "Git credential request canceled (for example, the credential manager was closed).",
    CredentialsNotReceived = "credentials.notReceived" => "No credentials were received. Finish or cancel the sign-in in the credential manager.",

    HubInvalidHost = "hub.invalidHost" => "Invalid host.",
    HubInvalidApiPath = "hub.invalidApiPath" => "Invalid API path.",
    HubMethodNotAllowed = "hub.methodNotAllowed" => "HTTP method {method} is not allowed.",
    HubGraphqlFailed = "hub.graphqlFailed" => "{host}: GraphQL error.",
    HubNoToken = "hub.noToken" => "No token for {login}@{host}. Connect again.",
    HubInvalidRepo = "hub.invalidRepo" => "Invalid hub repository: {spec}",
    HubUnknownProvider = "hub.unknownProvider" => "Unknown provider {provider}.",
    HubUnknownSignInMethod = "hub.unknownSignInMethod" => "Unknown sign-in method {method}.",
    HubOauthNotConfigured = "hub.oauthNotConfigured" => "OAuth is not configured.",
    HubSignInFailed = "hub.signInFailed" => "GitHub: sign-in failed.",
    HubNoUsername = "hub.noUsername" => "The provider returned no username.",
    T3InvalidWebhookUrl = "hub.t3InvalidWebhookUrl" => "T3: invalid webhook URL.",
    T3WebhookHttps = "hub.t3WebhookHttps" => "T3: the webhook URL must use https.",

    RemoteDaemonMissing = "remote.daemonMissing" => "l8gitd not found. Build it with `cargo build --features headless --bin l8gitd` and put it on the PATH.",
    RemoteInvalidPort = "remote.invalidPort" => "Invalid port.",
    RemoteStartFailed = "remote.startFailed" => "l8gitd could not start on port {port}.",
    RemoteCommandFailed = "remote.commandFailed" => "l8gitd {command} failed.",
    RemoteNoPairing = "remote.noPairing" => "l8gitd returned no pairing JSON.",
    RemoteNotPaired = "remote.notPaired" => "Not paired. Run `l8gitd pair` first.",
    RemoteExternalServer = "remote.externalServer" => "The server is not running in this app. Processes started outside it must be stopped outside it.",
    ServerNoRootAllowed = "server.noRootAllowed" => "No repository root is shared. Run `l8gitd allow <path>` (requested: {path}).",
    ServerPathNotAllowed = "server.pathNotAllowed" => "The path is not shared: {path}",
    ServerHubLocalOnly = "server.hubLocalOnly" => "Hub accounts are only available locally.",
    ServerInvalidArgument = "server.invalidArgument" => "Invalid argument \"{name}\": {error}",
    ServerChannelArgument = "server.channelArgument" => "Argument \"{name}\" must be the channel placeholder {placeholder}.",
    ServerMissingArgument = "server.missingArgument" => "Missing argument \"{name}\".",
    ServerMissingRequestId = "server.missingRequestId" => "The request frame has no id.",
    ServerUnknownCommand = "server.unknownCommand" => "Unknown command: {command}",
    ServerExecutorUnavailable = "server.executorUnavailable" => "The blocking executor is unavailable: {error}",
    ServerArgsNotObject = "server.argsNotObject" => "The command arguments must be an object.",
    ServerMissingCommand = "server.missingCommand" => "The request frame has no command.",
    ServerPortUnavailable = "server.portUnavailable" => "Port {port} is not available: {error}",
    ServerCommandAborted = "server.commandAborted" => "The command was aborted: {error}",

    ShellOpenFolderFailed = "shell.openFolderFailed" => "Could not open the folder.",
    ShellTerminalOpenFailed = "shell.terminalOpenFailed" => "Could not open the terminal.",
    ShellTerminalStartFailed = "shell.terminalStartFailed" => "Could not start a terminal: {error}",
    ShellGitBashStartFailed = "shell.gitBashStartFailed" => "Could not start Git Bash: {error}",
    ShellGitBashMissing = "shell.gitBashMissing" => "Git Bash not found (expected under Program Files\\Git, Git for Windows).",
    ShellIdeNotConfigured = "shell.ideNotConfigured" => "No IDE is configured (Settings).",
    ShellIdeStartFailed = "shell.ideStartFailed" => "Could not start the IDE: {error}",

    ExePathFailed = "app.exePathFailed" => "Could not determine the program path: {error}",
    ExePathUnknown = "app.exePathUnknown" => "Could not determine the program path.",
    ExePathNotUtf8 = "app.exePathNotUtf8" => "The program path is not valid UTF-8.",
    HomeDirMissing = "config.homeMissing" => "No home folder was found.",

    JiraFieldRequired = "jira.fieldRequired" => "Jira: {field} must not be empty.",
    JiraFieldTooLong = "jira.fieldTooLong" => "Jira: {field} is too long.",
    JiraFieldInvalidChars = "jira.fieldInvalidChars" => "Jira: {field} contains invalid characters.",
    JiraBaseUrlPathInvalid = "jira.baseUrlPathInvalid" => "Jira: the base URL path is invalid.",
    JiraBaseUrlInvalid = "jira.baseUrlInvalid" => "Jira: the base URL is not a valid URL.",
    JiraBaseUrlNoHost = "jira.baseUrlNoHost" => "Jira: the base URL has no host.",
    JiraHttpsRequired = "jira.httpsRequired" => "Jira: only HTTPS is allowed, otherwise the API token would be sent unencrypted.",
    JiraSchemeUnsupported = "jira.schemeUnsupported" => "Jira: the scheme \"{scheme}\" is not supported.",
    JiraBaseUrlCredentials = "jira.baseUrlCredentials" => "Jira: the base URL must not contain credentials.",
    JiraBaseUrlQuery = "jira.baseUrlQuery" => "Jira: the base URL must not contain a query or fragment.",
    JiraIssueKeyInvalid = "jira.issueKeyInvalid" => "Jira: invalid issue key.",
    JiraIssueKeyFormat = "jira.issueKeyFormat" => "Jira: issue keys must have the form PROJECT-123.",
    JiraEmailInvalid = "jira.emailInvalid" => "Jira: the email address is invalid.",
    JiraApiPathInvalid = "jira.apiPathInvalid" => "Jira: invalid API path.",
    JiraRequestUrlInvalid = "jira.requestUrlInvalid" => "Jira: the requested URL is invalid.",
    JiraStoredBaseUrlInvalid = "jira.storedBaseUrlInvalid" => "Jira: the stored base URL is invalid.",
    JiraRequestUrlForeign = "jira.requestUrlForeign" => "Jira: the requested URL leaves the configured Jira instance.",
    JiraUnauthorized = "jira.unauthorized" => "Jira 401: sign-in failed. Check the email and API token in Settings.",
    JiraForbidden = "jira.forbidden" => "Jira 403: access denied. Does the account lack read permission for this project?",
    JiraNotFound = "jira.notFound" => "Jira 404: not found. Does the issue exist and is it visible to this account?",
    JiraRateLimited = "jira.rateLimited" => "Jira 429: rate limit reached. Try again later.",
    JiraRedirectBlocked = "jira.redirectBlocked" => "Jira: the instance requested a redirect; stopped so the token does not leave the configured domain.",
    JiraResponseTooLarge = "jira.responseTooLarge" => "Jira: the response is too large.",
    JiraResponseNotJson = "jira.responseNotJson" => "Jira: the response was not JSON. Does the base URL really point to a Jira instance?",
    JiraNotConfigured = "jira.notConfigured" => "Jira is not configured. Enter the base URL, email and API token in Settings.",
    JiraCredentialsSerializeFailed = "jira.credentialsSerializeFailed" => "Jira: the credentials could not be serialized.",
    JiraCursorMcpInvalidJson = "jira.cursorMcpInvalidJson" => "Cursor: ~/.cursor/mcp.json is not valid JSON; check it manually.",
    JiraCursorMcpNotObject = "jira.cursorMcpNotObject" => "Cursor: ~/.cursor/mcp.json does not contain an object.",
    JiraCursorMcpServersNotObject = "jira.cursorMcpServersNotObject" => "Cursor: mcpServers in ~/.cursor/mcp.json is not an object.",

    WorkingDirMissing = "path.workingDirMissing" => "The working folder does not exist.",
    WorkingDirInvalid = "path.workingDirInvalid" => "Invalid working folder: {error}",
    TargetPathInvalid = "path.targetInvalid" => "Invalid target path.",
    FileGone = "fs.fileGone" => "The file no longer exists.",
    FileChangedMeanwhile = "fs.fileChangedMeanwhile" => "The file was changed in the meantime.",
    OnlyRegularFiles = "fs.onlyRegularFiles" => "Only regular files can be written.",
    FileRestoreFailed = "fs.fileRestoreFailed" => "Could not restore the file: {error}",
    FileDeleteFailed = "fs.fileDeleteFailed" => "Could not delete the file: {error}",
    JsonInvalid = "json.invalid" => "Invalid JSON: {error}",
    NameInvalid = "name.invalid" => "Invalid name.",
    HookKeyInvalid = "hooks.keyInvalid" => "Invalid hook key.",
    HookNotFound = "hooks.notFound" => "Hook not found.",
    CapabilityKindUnknown = "capability.kindUnknown" => "Unknown capability kind.",
    CapabilityUnsafePath = "capability.unsafePath" => "Unsafe path: {path}",
    CapabilityTooManyFiles = "capability.tooManyFiles" => "Too many files ({max}+). Copy the folder manually.",
    CapabilityFolderTooLarge = "capability.folderTooLarge" => "The folder is larger than 20 MB.",
    CapabilityUnexpectedCopyPath = "capability.unexpectedCopyPath" => "Unexpected path while copying.",
    CapabilityJsonInvalid = "capability.jsonInvalid" => "{path} is not valid JSON: {error}",
    CapabilityMcpNameInvalidChars = "capability.mcpNameInvalidChars" => "The MCP name may only contain letters, digits, _ and -.",
    CapabilityMcpHttpUrlRequired = "capability.mcpHttpUrlRequired" => "An HTTP MCP server needs a valid http(s) URL.",
    CapabilityMcpCommandRequired = "capability.mcpCommandRequired" => "A STDIO MCP server needs a start command.",
    CapabilityMcpArgEmpty = "capability.mcpArgEmpty" => "A start argument is empty.",
    CapabilityMcpUnknownTransport = "capability.mcpUnknownTransport" => "Unknown transport: {transport}",
    CapabilityMcpSecretEmpty = "capability.mcpSecretEmpty" => "The secret reference for {key} is empty.",
    CapabilityMcpUnsupported = "capability.mcpUnsupported" => "{cli} does not support MCP servers.",
    CapabilityMcpNoTargetPath = "capability.mcpNoTargetPath" => "There is no target path for the MCP configuration.",
    CapabilityMcpNotFound = "capability.mcpNotFound" => "MCP server not found.",
    CapabilityHooksUnsupported = "capability.hooksUnsupported" => "{cli} does not support hooks.",
    CapabilityGlobalWriteDenied = "capability.globalWriteDenied" => "No write permission at the global level; this needs administrator rights.",
    CapabilityKindUnsupportedBy = "capability.kindUnsupportedBy" => "{cli} does not know this capability kind.",
    CapabilityKindUnsupported = "capability.kindUnsupported" => "This capability kind is not supported.",
    CapabilitySourceDirMissing = "capability.sourceDirMissing" => "Source folder not found.",
    CapabilityTargetDirMissing = "capability.targetDirMissing" => "Target folder not found.",
    CapabilityDirMissing = "capability.dirMissing" => "Folder not found.",
    CapabilitySourceGone = "capability.sourceGone" => "The source no longer exists.",

    MarketDownloadFailed = "market.downloadFailed" => "Download failed ({status}).",
    MarketFileTooLarge = "market.fileTooLarge" => "{path} is larger than 2 MB.",
    MarketRepoNameFormat = "market.repoNameFormat" => "Invalid repository name (expected: owner/repo).",
    MarketRepoNameInvalid = "market.repoNameInvalid" => "Invalid repository name.",
    MarketRefInvalid = "market.refInvalid" => "Invalid branch or tag.",
    MarketTreeFailed = "market.treeFailed" => "Could not read the repository contents ({status}): {message}",
    MarketRepoLoadFailed = "market.repoLoadFailed" => "Could not load the repository ({status}): {message}",
    MarketSearchRateLimited = "market.searchRateLimited" => "GitHub search limit reached; wait a moment.",
    MarketSearchRateLimitedSignIn = "market.searchRateLimitedSignIn" => "GitHub search limit reached. Sign in to GitHub in Settings for many more searches.",
    MarketSearchFailed = "market.searchFailed" => "GitHub responded with {status}: {message}",
    MarketTooManyFiles = "market.tooManyFiles" => "More than {max} files; installation canceled.",
    MarketTooLarge = "market.tooLarge" => "More than 20 MB; installation canceled.",
    MarketSkillFolderEmpty = "market.skillFolderEmpty" => "The skill folder is empty.",
    MarketSkillExists = "market.skillExists" => "The skill already exists and overwriting is not enabled.",
    MarketFileExists = "market.fileExists" => "The file already exists and overwriting is not enabled.",
    MarketNoMcpServers = "market.noMcpServers" => "No MCP servers were found in the file.",
    MarketNoHookDefinitions = "market.noHookDefinitions" => "The file contains no hook definitions.",
    MarketNoTransferableHooks = "market.noTransferableHooks" => "No transferable hooks were found.",
    MarketNoPluginMarketplaces = "market.noPluginMarketplaces" => "{cli} does not support plugin marketplaces.",
    MarketNotText = "market.notText" => "The file is not a text file.",

    AgentCliMissing = "agent.cliMissing" => "{agent} CLI was not found.",
    AgentWorkdirMissing = "agent.workdirMissing" => "The {agent} working folder does not exist.",
    AgentSessionIdInvalid = "agent.sessionIdInvalid" => "Invalid {agent} session ID.",
    AgentConversationNotFound = "agent.conversationNotFound" => "{agent} conversation not found.",
    AgentConversationReadFailed = "agent.conversationReadFailed" => "Could not read the {agent} conversation.",
    AgentConversationTitleInvalid = "agent.conversationTitleInvalid" => "Invalid {agent} conversation title.",
    AgentCommandMissing = "agent.commandMissing" => "{agent} command missing.",
    AgentCommandNotAllowed = "agent.commandNotAllowed" => "{agent} command not allowed: {command}",
    AgentArgumentInvalid = "agent.argumentInvalid" => "Invalid argument for the {agent} CLI.",
    AgentCliFailed = "agent.cliFailed" => "{agent} CLI failed: {error}",
    AgentCliCommandFailed = "agent.cliCommandFailed" => "The {agent} CLI command failed.",
    CursorChatDirUnknown = "agent.cursorChatDirUnknown" => "Could not determine the Cursor chat folder.",
    CursorMetadataInvalid = "agent.cursorMetadataInvalid" => "The Cursor metadata is invalid.",
    ClaudeConfigDirUnknown = "agent.claudeConfigDirUnknown" => "Could not determine the Claude configuration folder.",
    ClaudeCheckpointInvalid = "agent.claudeCheckpointInvalid" => "Invalid checkpoint for fork.",
    ClaudeSessionPathInvalid = "agent.claudeSessionPathInvalid" => "Invalid Claude session path.",
    ClaudeUpdateSourceUnknown = "agent.claudeUpdateSourceUnknown" => "Unknown installation source: the update cannot run automatically.",
    ClaudeBinaryNotWritable = "agent.claudeBinaryNotWritable" => "The binary path is not writable: the update cannot run.",
    ClaudeLogoutFailed = "agent.claudeLogoutFailed" => "Claude sign-out failed.",
    ClaudeSettingsNotObject = "agent.claudeSettingsNotObject" => "Settings must be a JSON object.",
    ClaudeManagedReadOnly = "agent.claudeManagedReadOnly" => "Managed settings are read-only.",
    ClaudeSettingsScopeUnknown = "agent.claudeSettingsScopeUnknown" => "Unknown settings scope.",
    ClaudeOnlyClaudeFiles = "agent.claudeOnlyClaudeFiles" => "Only files in .claude may be edited.",
    McpConfigNotFile = "agent.mcpConfigNotFile" => "For {provider}, the MCP configuration is not managed as a file.",
    McpConfigTooLargeEdit = "agent.mcpConfigTooLargeEdit" => "The MCP configuration is too large to edit.",
    McpConfigTooLargeSave = "agent.mcpConfigTooLargeSave" => "The MCP configuration is too large to save.",
    AgentMessageNotJson = "agent.messageNotJson" => "The agent message is not valid JSON: {error}",
    AgentValueInvalid = "agent.valueInvalid" => "Invalid value for {field}.",
    AgentPathInvalid = "agent.pathInvalid" => "Invalid path for {field}.",
    AgentCursorExtraDirMissing = "agent.cursorExtraDirMissing" => "An additional Cursor folder does not exist.",
    AgentPromptInvalid = "agent.promptInvalid" => "Invalid prompt for the {agent} CLI.",
    AgentPromptRequired = "agent.promptRequired" => "{agent} needs a prompt.",
    AgentSecretMissing = "agent.secretMissing" => "The secret for environment variable {key} was not found.",
    AgentUnknownProvider = "agent.unknownProvider" => "Unknown agent provider: {provider}",
    AgentStartFailed = "agent.startFailed" => "{agent} could not be started: {error}",
    AgentPipeUnavailable = "agent.pipeUnavailable" => "{agent}: {pipe} is not available.",
    AgentTransportRegisterFailed = "agent.transportRegisterFailed" => "The agent transport could not be registered.",
    AgentTransportGone = "agent.transportGone" => "The agent transport no longer exists.",
    AgentSessionMismatch = "agent.sessionMismatch" => "The agent session does not match the transport.",
    AgentTransportEnded = "agent.transportEnded" => "The agent transport has ended.",
    AgentSendFailed = "agent.sendFailed" => "The agent message could not be sent: {error}",
    AgentSessionDeleteFailed = "agent.sessionDeleteFailed" => "The {agent} session could not be deleted: {error}",

    ReviewBranchUnknown = "agentReview.branchUnknown" => "Could not determine the branch (detached HEAD).",
    ReviewSameBranches = "agentReview.sameBranches" => "The base branch and the session branch are identical.",
    ReviewNoCommonAncestor = "agentReview.noCommonAncestor" => "The two branches have no common ancestor.",
    ReviewTaskAborted = "agentReview.taskAborted" => "The background task was aborted: {error}",
    ReviewMergeBaseOrPathMissing = "agentReview.mergeBaseOrPathMissing" => "The merge base or file path is missing.",
    ReviewCheckpointPathInvalid = "agentReview.checkpointPathInvalid" => "Invalid file path in the checkpoint: {path}: {error}",
}

labels! {
    Path = "path" => "Path",
    Host = "host" => "Host",
    Username = "username" => "Username",
    Token = "token" => "Token",
    Title = "title" => "Title",
    Target = "target" => "Target",
    TargetPath = "targetPath" => "Target path",
    Remote = "remote" => "Remote",
    RemoteName = "remoteName" => "Remote name",
    RemoteUrl = "remoteUrl" => "Remote URL",
    RemoteTrackingRef = "remoteTrackingRef" => "Remote-tracking ref",
    CloneUrl = "cloneUrl" => "Clone URL",
    BranchName = "branchName" => "Branch name",
    BranchOrRef = "branchOrRef" => "Branch or ref name",
    HeadBranch = "headBranch" => "Head branch",
    BaseBranch = "baseBranch" => "Base branch",
    MergeRef = "mergeRef" => "Merge ref",
    Commit = "commit" => "Commit",
    CommitHash = "commitHash" => "Commit hash",
    CommitRef = "commitRef" => "Commit reference",
    HeadRef = "headRef" => "Head reference",
    CommitMessage = "commitMessage" => "Commit message",
    TagName = "tagName" => "Tag name",
    TagMessage = "tagMessage" => "Tag message",
    WorktreePath = "worktreePath" => "Worktree path",
    FilePath = "filePath" => "File path",
    RepoName = "repoName" => "Repository name",
    HubChecks = "hubChecks" => "Checks in the hub",
    WorkflowRuns = "workflowRuns" => "Workflow runs",
    WorkflowJobs = "workflowJobs" => "Workflow jobs",
    Rerun = "rerun" => "Re-run",
    CancelRun = "cancelRun" => "Canceling a run",
    CheckRunRerun = "checkRunRerun" => "Check run re-run",
    CheckSuiteRerun = "checkSuiteRerun" => "Check suite re-run",
    Annotations = "annotations" => "Annotations",
    BranchProtection = "branchProtection" => "Branch protection",
    AutoMerge = "autoMerge" => "Auto-merge",
    ResolveThreads = "resolveThreads" => "Resolving threads",
    JiraBaseUrl = "jiraBaseUrl" => "Base URL",
    JiraJql = "jiraJql" => "JQL query",
    JiraApiToken = "jiraApiToken" => "API token",
    CursorExtraDir = "cursorExtraDir" => "Cursor additional folder",
    EnvVarName = "envVarName" => "Environment variable name",
    CursorSandbox = "cursorSandbox" => "Cursor sandbox",
    CursorModel = "cursorModel" => "Cursor model",
    CursorSession = "cursorSession" => "Cursor session",
    CursorWorktree = "cursorWorktree" => "Cursor worktree",
    ClaudeResumeSession = "claudeResumeSession" => "Claude resume session",
    ClaudeModel = "claudeModel" => "Claude model",
    ClaudeEffort = "claudeEffort" => "Claude effort",
    ClaudePermissionMode = "claudePermissionMode" => "Claude permission mode",
    ClaudeConfigDir = "claudeConfigDir" => "Claude configuration folder",
    McpName = "mcpName" => "MCP name",
}

/// One named error parameter. Lists are joined with ", " for display.
pub enum Param {
    Text(String),
    List(Vec<String>),
    Label(Label),
}

impl Param {
    pub fn text(value: impl std::fmt::Display) -> Self {
        Param::Text(value.to_string())
    }

    fn english(&self) -> String {
        match self {
            Param::Text(text) => text.clone(),
            Param::List(items) => items.join(", "),
            Param::Label(label) => label.english().to_string(),
        }
    }

    fn json(&self) -> Value {
        match self {
            Param::Text(text) => Value::String(text.clone()),
            Param::List(items) => Value::from(items.clone()),
            Param::Label(label) => Value::String(label.id().to_string()),
        }
    }
}

/// Builds the wire string for `code`; the English message is the code's template filled with `params`.
pub fn coded(code: ErrorCode, params: &[(&str, Param)]) -> String {
    // One pass over the template, so a value containing "{other}" is never filled in again.
    let mut message = String::new();
    let mut rest = code.english();
    while let Some(open) = rest.find('{') {
        let close = rest[open..].find('}').map(|end| open + end);
        let value = close.and_then(|close| params.iter().find(|(name, _)| *name == &rest[open + 1..close]));
        match (close, value) {
            (Some(close), Some((_, value))) => {
                message.push_str(&rest[..open]);
                message.push_str(&value.english());
                rest = &rest[close + 1..];
            }
            _ => {
                message.push_str(&rest[..=open]);
                rest = &rest[open + 1..];
            }
        }
    }
    message.push_str(rest);
    let map: Map<String, Value> = params.iter().map(|(name, value)| ((*name).to_string(), value.json())).collect();
    let mut payload = Map::new();
    payload.insert("code".into(), Value::String(code.code().into()));
    if !map.is_empty() {
        payload.insert("params".into(), Value::Object(map));
    }
    // serde_json escapes control characters, so the payload never contains the separator.
    let message = message.replace(SEP, " ");
    format!("{SEP}{message}{SEP}{TAG}{}{SEP}", Value::Object(payload))
}

/// `coded!(Code)` or `coded!(Code, name = value, …)`; each value is formatted with `Display`.
#[macro_export]
macro_rules! coded {
    ($code:ident $(, $name:ident = $value:expr)* $(,)?) => {
        $crate::error::coded(
            $crate::error::ErrorCode::$code,
            &[$((stringify!($name), $crate::error::Param::text(&$value))),*],
        )
    };
}

/// "{field} must not be empty." for a translatable field label.
pub fn required(field: Label) -> String {
    coded(ErrorCode::FieldRequired, &[("field", Param::Label(field))])
}

/// The English text of every coded segment in `text`, for consumers without the frontend
/// formatter (CLI output, AI tool results).
pub fn message_only(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find(SEP) {
        let after = &rest[start + 1..];
        let Some(mid) = after.find(SEP) else { break };
        let tail = &after[mid + 1..];
        let Some(end) = tail.strip_prefix(TAG).and_then(|t| t.find(SEP)) else {
            out.push_str(&rest[..=start]);
            rest = after;
            continue;
        };
        out.push_str(&rest[..start]);
        out.push_str(&after[..mid]);
        rest = &tail[TAG.len() + end + 1..];
    }
    out.push_str(rest);
    out
}

/// Splits a wire string into (code, params, English message); `None` for an uncoded error.
#[cfg(test)]
pub fn parse(wire: &str) -> Option<(String, Map<String, Value>, String)> {
    let parts: Vec<&str> = wire.split(SEP).collect();
    let [before, message, payload, after] = parts.as_slice() else { return None };
    if !before.is_empty() || !after.is_empty() {
        return None;
    }
    let payload: Value = serde_json::from_str(payload.strip_prefix(TAG)?).ok()?;
    let code = payload.get("code")?.as_str()?.to_string();
    let segment = |s: &str| s.starts_with(|c: char| c.is_ascii_lowercase()) && s.chars().all(|c| c.is_ascii_alphanumeric());
    if !code.contains('.') || !code.split('.').all(segment) {
        return None;
    }
    let params = match payload.get("params") {
        None => Map::new(),
        Some(Value::Object(map)) => map.clone(),
        Some(_) => return None,
    };
    let valid = |value: &Value| match value {
        Value::String(_) => true,
        Value::Array(items) => items.iter().all(Value::is_string),
        _ => false,
    };
    if !params.values().all(valid) {
        return None;
    }
    Some((code, params, message.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn locale(name: &str) -> Value {
        let path = format!("{}/../src/locales/{name}.json", env!("CARGO_MANIFEST_DIR"));
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    fn lookup<'a>(root: &'a Value, path: &str) -> Option<&'a str> {
        path.split('.').try_fold(root, |node, part| node.get(part))?.as_str()
    }

    #[test]
    fn matches_shared_fixtures() {
        let path = format!("{}/../src/lib/backend-error.fixtures.json", env!("CARGO_MANIFEST_DIR"));
        let fixtures: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        for case in fixtures["coded"].as_array().unwrap() {
            let wire = case["wire"].as_str().unwrap();
            let (code, params, message) = parse(wire).expect(wire);
            assert_eq!(code, case["code"].as_str().unwrap(), "{wire:?}");
            assert_eq!(Value::Object(params), case["params"], "{wire:?}");
            assert_eq!(message, case["message"].as_str().unwrap(), "{wire:?}");
        }
        for wire in fixtures["uncoded"].as_array().unwrap() {
            assert!(parse(wire.as_str().unwrap()).is_none(), "{wire:?}");
        }
        assert_eq!(coded!(UndoNothingToUndo), fixtures["coded"][0]["wire"].as_str().unwrap());
        assert_eq!(
            coded!(UndoUnknownReflogEntry, selector = "HEAD@{3}"),
            fixtures["coded"][1]["wire"].as_str().unwrap()
        );
        assert_eq!(required(Label::BranchName), fixtures["coded"][2]["wire"].as_str().unwrap());
        assert_eq!(
            coded(ErrorCode::UndoLocalChanges, &[("files", Param::List(vec!["a.txt".into(), "b \"q\".txt".into()]))]),
            fixtures["coded"][3]["wire"].as_str().unwrap()
        );
    }

    #[test]
    fn message_only_strips_every_segment() {
        let wire = format!("Restore failed: {} / {}", coded!(UndoNothingToUndo), required(Label::Path));
        assert_eq!(message_only(&wire), "Restore failed: There is nothing to undo. / Path must not be empty.");
        assert_eq!(message_only("plain \u{1f}text"), "plain \u{1f}text");
        assert_eq!(message_only("a\u{1f}b\u{1f}c"), "a\u{1f}b\u{1f}c");
    }

    #[test]
    fn round_trips_hostile_params() {
        let hostile = "a\u{1f}l8e:{\"code\":\"x.y\"}\u{1f}\n}";
        let wire = coded!(PathNotFound, path = hostile);
        let (code, params, message) = parse(&wire).unwrap();
        assert_eq!(code, "path.notFound");
        assert_eq!(params["path"], hostile);
        assert_eq!(message, "The path does not exist: a l8e:{\"code\":\"x.y\"} \n}");
        let nested = coded!(ServerInvalidArgument, name = "x{error}", error = "boom");
        assert_eq!(parse(&nested).unwrap().2, "Invalid argument \"x{error}\": boom");
    }

    #[test]
    fn every_code_and_label_has_matching_english_locale_entry() {
        let en = locale("en");
        let mut seen = std::collections::HashSet::new();
        for code in ErrorCode::ALL {
            assert!(seen.insert(code.code()), "duplicate code {}", code.code());
            let expected = code.english().replace('{', "{{").replace('}', "}}");
            let key = format!("backendErrors.{}", code.code());
            assert_eq!(lookup(&en, &key), Some(expected.as_str()), "{key}");
        }
        for label in Label::ALL {
            let key = format!("backendErrors.labels.{}", label.id());
            assert_eq!(lookup(&en, &key), Some(label.english()), "{key}");
        }
    }

    #[test]
    fn every_locale_keeps_the_placeholders() {
        let en = locale("en");
        for name in ["de", "es", "fr", "ja", "pt", "zh"] {
            let other = locale(name);
            for code in ErrorCode::ALL {
                let key = format!("backendErrors.{}", code.code());
                let text = lookup(&other, &key).unwrap_or_else(|| panic!("{name}: {key}"));
                let english = lookup(&en, &key).unwrap();
                for part in english.split("{{").skip(1) {
                    let name_end = part.find("}}").unwrap();
                    let placeholder = format!("{{{{{}}}}}", &part[..name_end]);
                    assert!(text.contains(&placeholder), "{name}: {key} lacks {placeholder}");
                }
            }
        }
    }
}
