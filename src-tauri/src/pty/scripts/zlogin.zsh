{
  _l8git_user_zdotdir="${L8GIT_USER_ZDOTDIR:-$HOME}"
  [ -f "$_l8git_user_zdotdir/.zlogin" ] && source "$_l8git_user_zdotdir/.zlogin"
  unset _l8git_user_zdotdir
}
:
