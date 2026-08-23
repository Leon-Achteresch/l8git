import * as React from 'react';
import { Linking, ScrollView, View, type TextStyle } from 'react-native';

import {
  highlightCode,
  parseMarkdown,
  type CodeTone,
  type MdBlock,
  type MdSpan,
} from '~/components/shared/markdown';
import { Text } from '~/components/ui/text';
import { fonts, palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-bold tracking-tight',
  2: 'text-lg font-bold tracking-tight',
  3: 'text-base font-semibold',
  4: 'text-sm font-semibold',
  5: 'text-sm font-medium',
  6: 'text-xs font-medium uppercase tracking-widest',
};

const TONE_COLOR: Record<CodeTone, string> = {
  plain: palette.foreground,
  comment: palette.mutedForeground,
  string: palette.git.added,
  number: palette.git.tag,
  keyword: palette.git.merge,
};

const CODE_FONT: TextStyle = {
  fontFamily: fonts.mono,
  fontSize: 11,
  lineHeight: 17,
};

function spanStyle(span: MdSpan): TextStyle {
  const style: TextStyle = {};
  if (span.code) {
    style.fontFamily = fonts.mono;
    style.fontSize = 12;
    style.backgroundColor = 'rgba(255,255,255,0.08)';
    style.color = palette.foreground;
  } else if (span.bold) {
    style.fontFamily = fonts.semibold;
  } else if (span.italic) {
    style.fontStyle = 'italic';
  }
  if (span.strike) {
    style.textDecorationLine = 'line-through';
    style.color = palette.mutedForeground;
  }
  if (span.href) {
    style.color = palette.git.branch;
    style.textDecorationLine = 'underline';
  }
  return style;
}

function Spans({
  spans,
  onLinkPress,
}: {
  spans: readonly MdSpan[];
  onLinkPress: (href: string) => void;
}) {
  return (
    <>
      {spans.map((span, index) => (
        <Text
          key={index}
          style={spanStyle(span)}
          onPress={span.href ? () => onLinkPress(span.href as string) : undefined}>
          {span.text}
        </Text>
      ))}
    </>
  );
}

function CodeBlock({ lang, lines }: { lang: string | null; lines: readonly string[] }) {
  return (
    <View className="bg-card overflow-hidden rounded-3xl">
      {lang ? (
        <View className="border-white/5 bg-white/5 border-b px-4 py-1.5">
          <Text className="text-muted-foreground font-mono text-2xs">{lang}</Text>
        </View>
      ) : null}
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ minWidth: '100%', paddingHorizontal: 16, paddingVertical: 12 }}>
        <View>
          {lines.map((line, index) => (
            <Text key={index} numberOfLines={1} style={CODE_FONT}>
              {highlightCode(line).map((token, tokenIndex) => (
                <Text key={tokenIndex} style={{ ...CODE_FONT, color: TONE_COLOR[token.tone] }}>
                  {token.text}
                </Text>
              ))}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Block({
  block,
  onLinkPress,
  textClassName,
}: {
  block: MdBlock;
  onLinkPress: (href: string) => void;
  textClassName?: string;
}) {
  if (block.type === 'code') {
    return <CodeBlock lang={block.lang} lines={block.lines} />;
  }

  if (block.type === 'rule') {
    return <View className="bg-white/10 h-px w-full" />;
  }

  if (block.type === 'heading') {
    return (
      <Text className={cn('text-foreground', HEADING_CLASS[block.level] ?? HEADING_CLASS[6])}>
        <Spans spans={block.spans} onLinkPress={onLinkPress} />
      </Text>
    );
  }

  if (block.type === 'quote') {
    return (
      <View className="border-white/15 border-l-2 pl-3">
        <Text className={cn('text-muted-foreground text-sm leading-5', textClassName)}>
          <Spans spans={block.spans} onLinkPress={onLinkPress} />
        </Text>
      </View>
    );
  }

  if (block.type === 'list') {
    return (
      <View className="gap-1">
        {block.items.map((item, index) => (
          <View
            key={index}
            style={{ paddingLeft: item.indent * 14 }}
            className="flex-row items-start gap-2">
            <Text className="text-muted-foreground w-4 text-right text-sm leading-5">
              {item.checked === null
                ? block.ordered
                  ? `${index + 1}.`
                  : '•'
                : item.checked
                  ? '✓'
                  : '○'}
            </Text>
            <Text
              className={cn(
                'text-foreground flex-1 text-sm leading-5',
                item.checked ? 'text-muted-foreground line-through' : undefined,
                textClassName
              )}>
              <Spans spans={item.spans} onLinkPress={onLinkPress} />
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <Text className={cn('text-foreground text-sm leading-5', textClassName)}>
      <Spans spans={block.spans} onLinkPress={onLinkPress} />
    </Text>
  );
}

export type MarkdownViewProps = {
  content?: string | null;
  children?: string;
  onLinkPress?: (href: string) => void;
  textClassName?: string;
  className?: string;
};

export function MarkdownView({
  content,
  children,
  onLinkPress,
  textClassName,
  className,
}: MarkdownViewProps) {
  const source = content ?? children ?? '';
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);

  const handleLink = React.useCallback(
    (href: string) => {
      if (onLinkPress) {
        onLinkPress(href);
        return;
      }
      void Linking.openURL(href).catch(() => undefined);
    },
    [onLinkPress]
  );

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View className={cn('gap-2.5', className)}>
      {blocks.map((block, index) => (
        <Block
          key={index}
          block={block}
          onLinkPress={handleLink}
          textClassName={textClassName}
        />
      ))}
    </View>
  );
}
