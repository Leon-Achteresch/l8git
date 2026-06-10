{
  _l8git_user_zdotdir="${L8GIT_USER_ZDOTDIR:-$HOME}"
  [ -f "$_l8git_user_zdotdir/.zshrc" ] && source "$_l8git_user_zdotdir/.zshrc"
  unset _l8git_user_zdotdir
}

if [[ -z "$__L8GIT_HOOKS_LOADED" ]]; then
  __L8GIT_HOOKS_LOADED=1
  autoload -Uz add-zsh-hook 2>/dev/null

  _l8git_urlencode() {
    emulate -L zsh
    setopt localoptions no_multibyte
    local LC_ALL=C s="$1" i byte
    for (( i=1; i<=${#s}; i++ )); do
      byte="${s[i]}"
      case "$byte" in
        [a-zA-Z0-9/._~-]) printf '%s' "$byte" ;;
        *) printf '%%%02X' "'$byte" ;;
      esac
    done
  }

  _l8git_precmd() {
    local _l8git_ret=$?
    printf '\e]133;D;%s\e\\' "$_l8git_ret"
    printf '\e]7;file://%s%s\e\\' "${HOST}" "$(_l8git_urlencode "$PWD")"
    if [[ "$PS1" != *$'\e]133;B\e\\'* ]]; then
      PS1=$'%{\e]133;B\e\\%}'"$PS1"
    fi
    printf '\e]133;A\e\\'
  }

  _l8git_preexec() {
    local cmd="${1//[[:cntrl:]]/ }"
    printf '\e]133;C;%s\e\\' "${cmd[1,256]}"
  }

  if (( $+functions[add-zsh-hook] )); then
    add-zsh-hook precmd _l8git_precmd
    add-zsh-hook preexec _l8git_preexec
  fi

  if (( $+widgets[emacs-forward-word] )) \
     && [[ "$(bindkey '\ef')" == '"^[f" forward-word' ]]; then
    bindkey '\ef' emacs-forward-word
  fi

  _l8git_precmd
fi
:
