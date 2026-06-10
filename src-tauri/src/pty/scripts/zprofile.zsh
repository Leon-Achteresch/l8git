{
  _l8git_user_zdotdir="${L8GIT_USER_ZDOTDIR:-$HOME}"
  [ -f "$_l8git_user_zdotdir/.zprofile" ] && source "$_l8git_user_zdotdir/.zprofile"
  unset _l8git_user_zdotdir
}
:
