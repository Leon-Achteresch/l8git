if set -q __L8GIT_HOOKS_LOADED
    exit 0
end
set -g __L8GIT_HOOKS_LOADED 1

set -g __L8GIT_HOST (uname -n 2>/dev/null; or echo localhost)

function __l8git_urlencode_path
    set -l parts (string split '/' -- $argv[1])
    set -l out
    for p in $parts
        if test -n "$p"
            set out $out (string escape --style=url -- $p)
        else
            set out $out ""
        end
    end
    string join '/' $out
end

function __l8git_restore_status
    return $argv[1]
end

if functions -q fish_prompt
    functions -c fish_prompt __l8git_user_prompt
end

function fish_prompt
    set -l __l8git_status $status
    printf '\e]133;D;%d\e\\' $__l8git_status
    printf '\e]7;file://%s%s\e\\' "$__L8GIT_HOST" (__l8git_urlencode_path "$PWD")
    printf '\e]133;A\e\\'
    __l8git_restore_status $__l8git_status
    if functions -q __l8git_user_prompt
        __l8git_user_prompt
    else
        printf '%s > ' (prompt_pwd)
    end
    printf '\e]133;B\e\\'
end

function __l8git_preexec --on-event fish_preexec
    set -l cmd (string replace -ra '[\x00-\x1f\x7f]' ' ' -- "$argv")
    printf '\e]133;C;%s\e\\' (string sub -l 256 -- "$cmd")
end
