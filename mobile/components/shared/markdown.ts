export type MdSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
};

export type MdListItem = {
  spans: MdSpan[];
  indent: number;
  marker: string;
  checked: boolean | null;
};

export type MdBlock =
  | { type: 'heading'; level: number; spans: MdSpan[] }
  | { type: 'paragraph'; spans: MdSpan[] }
  | { type: 'quote'; spans: MdSpan[] }
  | { type: 'list'; ordered: boolean; items: MdListItem[] }
  | { type: 'code'; lang: string | null; lines: string[] }
  | { type: 'rule' };

const FENCE = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+(.*)$/;

const INLINE =
  /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+?)\*|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<((?:https?|mailto):[^>\s]+)>|((?:https?:\/\/|www\.)[^\s<>()]+)/g;

function pushText(spans: MdSpan[], text: string, base: Partial<MdSpan>) {
  if (!text) {
    return;
  }
  spans.push({ ...base, text });
}

export function parseInline(source: string, base: Partial<MdSpan> = {}): MdSpan[] {
  const spans: MdSpan[] = [];
  const matcher = new RegExp(INLINE.source, INLINE.flags);
  let cursor = 0;
  let match = matcher.exec(source);

  while (match) {
    if (match.index > cursor) {
      pushText(spans, source.slice(cursor, match.index), base);
    }
    const [
      ,
      ,
      codeText,
      boldStar,
      boldUnderscore,
      strike,
      italicStar,
      linkLabel,
      linkHref,
      autoLink,
      bareLink,
    ] = match;

    if (codeText !== undefined) {
      pushText(spans, codeText.trim(), { ...base, code: true });
    } else if (boldStar ?? boldUnderscore) {
      spans.push(...parseInline(boldStar ?? boldUnderscore, { ...base, bold: true }));
    } else if (strike !== undefined) {
      spans.push(...parseInline(strike, { ...base, strike: true }));
    } else if (italicStar !== undefined) {
      spans.push(...parseInline(italicStar, { ...base, italic: true }));
    } else if (linkHref !== undefined) {
      const label = linkLabel && linkLabel.length > 0 ? linkLabel : linkHref;
      spans.push(...parseInline(label, { ...base, href: linkHref }));
    } else if (autoLink !== undefined) {
      pushText(spans, autoLink, { ...base, href: autoLink });
    } else if (bareLink !== undefined) {
      const href = bareLink.startsWith('www.') ? `https://${bareLink}` : bareLink;
      pushText(spans, bareLink, { ...base, href });
    }

    cursor = match.index + match[0].length;
    matcher.lastIndex = cursor;
    match = matcher.exec(source);
  }

  if (cursor < source.length) {
    pushText(spans, source.slice(cursor), base);
  }
  return spans;
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', spans: parseInline(paragraph.join(' ').trim()) });
      paragraph = [];
    }
  };

  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push({ type: 'quote', spans: parseInline(quote.join(' ').trim()) });
      quote = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const fence = FENCE.exec(line);
    if (fence) {
      flushAll();
      const marker = fence[1];
      const lang = fence[2] ? fence[2] : null;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith(marker)) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', lang, lines: body });
      continue;
    }

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    if (RULE.test(line)) {
      flushAll();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ type: 'heading', level: heading[1].length, spans: parseInline(heading[2]) });
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      flushParagraph();
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();

    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /\d/.test(item[2]);
      const items: MdListItem[] = [];
      let cursor = index;

      while (cursor < lines.length) {
        const current = LIST_ITEM.exec(lines[cursor]);
        if (!current) {
          break;
        }
        const task = TASK.exec(current[3]);
        items.push({
          indent: Math.floor(current[1].replace(/\t/g, '  ').length / 2),
          marker: current[2],
          checked: task ? task[1].toLowerCase() === 'x' : null,
          spans: parseInline(task ? task[2] : current[3]),
        });
        cursor += 1;
      }

      blocks.push({ type: 'list', ordered, items });
      index = cursor - 1;
      continue;
    }

    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

export type CodeTone = 'plain' | 'comment' | 'string' | 'number' | 'keyword';

export type CodeToken = { text: string; tone: CodeTone };

const KEYWORDS = new Set([
  'as','async','await','break','case','catch','class','const','continue','def','default','delete',
  'do','elif','else','end','enum','export','extends','false','final','finally','fn','for','from',
  'func','function','if','impl','implements','import','in','instanceof','int','interface','let',
  'match','mod','mut','new','nil','none','null','of','package','private','pub','public','return',
  'self','static','struct','switch','this','throw','trait','true','try','type','typeof','undefined',
  'use','var','void','where','while','with','yield',
]);

const CODE_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?:^|\s)#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

export function highlightCode(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let cursor = 0;
  CODE_TOKEN.lastIndex = 0;
  let match = CODE_TOKEN.exec(line);

  while (match) {
    if (match.index > cursor) {
      tokens.push({ text: line.slice(cursor, match.index), tone: 'plain' });
    }
    const [full, comment, string, number, word] = match;
    if (comment !== undefined) {
      tokens.push({ text: comment, tone: 'comment' });
    } else if (string !== undefined) {
      tokens.push({ text: string, tone: 'string' });
    } else if (number !== undefined) {
      tokens.push({ text: number, tone: 'number' });
    } else if (word !== undefined) {
      tokens.push({ text: word, tone: KEYWORDS.has(word) ? 'keyword' : 'plain' });
    }
    cursor = match.index + full.length;
    match = CODE_TOKEN.exec(line);
  }

  if (cursor < line.length) {
    tokens.push({ text: line.slice(cursor), tone: 'plain' });
  }
  return tokens;
}
