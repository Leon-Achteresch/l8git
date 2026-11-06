/** `Fix login on Safari!` #42 → `42-fix-login-on-safari` (git-ref safe, bounded). */
export function issueBranchName(number: number, title: string, prefix = ""): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  const clean = prefix.trim().replace(/^\/+|\/+$/g, "");
  return `${clean ? `${clean}/` : ""}${number}${slug ? `-${slug}` : ""}`;
}

/** Rejects names git check-ref-format would refuse (subset sufficient for user input). */
export function validBranchName(name: string): boolean {
  return (
    !!name &&
    !/[\s~^:?*[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|^[-/.]|[/.]$|\.lock$|(^|\/)\./.test(name)
  );
}

