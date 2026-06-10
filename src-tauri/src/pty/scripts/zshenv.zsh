{
  _l8git_user_zdotdir="${L8GIT_USER_ZDOTDIR:-$HOME}"
  [ -f "$_l8git_user_zdotdir/.zshenv" ] && source "$_l8git_user_zdotdir/.zshenv"
  unset _l8git_user_zdotdir
}
:
