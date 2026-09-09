/** Read Git's --format=fuller output without mistaking its header for the subject. */
export function parseCommitInspectMetadata(header: string) {
  const lines = header.split(/\r?\n/);
  const hash = lines[0]?.match(/^commit ([0-9a-f]+)/)?.[1] ?? null;
  if (!hash)
    return {
      hash: null,
      author: null,
      date: null,
      subject: lines.find((line) => line.trim())?.trim() ?? "",
      body: "",
    };

  const messageLines: string[] = [];
  const start = lines.findIndex((line) => line.startsWith("    "));
  if (start !== -1) {
    for (const line of lines.slice(start)) {
      if (line && !line.startsWith("    ")) break;
      messageLines.push(line.startsWith("    ") ? line.slice(4) : "");
    }
  }
  const message = messageLines.join("\n").trim();
  const [subject = "", ...body] = message.split("\n");
  return {
    hash,
    author:
      lines
        .find((line) => line.startsWith("Author:"))
        ?.replace(/^Author:\s*/, "")
        .replace(/\s*<[^>]*>$/, "") ?? null,
    date:
      lines
        .find((line) => line.startsWith("AuthorDate:"))
        ?.replace(/^AuthorDate:\s*/, "") ?? null,
    subject,
    body: body.join("\n").trim(),
  };
}
