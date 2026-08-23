import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

import { tokenizeCommand, type ShellTokenKind } from './command-tokens';

export { tokenizeCommand } from './command-tokens';
export type { ShellToken, ShellTokenKind } from './command-tokens';

const TOKEN_CLASS: Record<ShellTokenKind, string> = {
  program: 'text-git-branch',
  subcommand: 'text-foreground',
  flag: 'text-warning',
  string: 'text-git-added',
  operator: 'text-git-merge',
  path: 'text-muted-foreground',
  number: 'text-git-tag',
  variable: 'text-git-merge',
  plain: 'text-foreground/80',
};

export function CommandLine({
  command,
  tone = 'normal',
  prompt = '$',
  className,
}: {
  command: string;
  tone?: 'normal' | 'danger';
  prompt?: string | null;
  className?: string;
}) {
  const lines = React.useMemo(() => command.replace(/\r\n/g, '\n').split('\n'), [command]);

  return (
    <View
      className={cn(
        'overflow-hidden rounded-2xl',
        tone === 'danger' ? 'bg-destructive/12' : 'bg-black/40',
        className
      )}>
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-3">
        <View className="gap-0.5">
          {lines.map((line, lineIndex) => (
            <View key={lineIndex} className="flex-row items-baseline">
              {prompt ? (
                <Text className="text-muted-foreground/60 pr-1.5 font-mono text-xs">
                  {lineIndex === 0 ? prompt : ' '}
                </Text>
              ) : null}
              {tokenizeCommand(line).map((token, tokenIndex) => (
                <Text
                  key={tokenIndex}
                  className={cn('font-mono text-xs leading-5', TOKEN_CLASS[token.kind])}>
                  {tokenIndex === 0 ? token.text : ` ${token.text}`}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
