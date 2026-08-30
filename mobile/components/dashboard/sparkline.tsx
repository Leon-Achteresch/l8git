import * as React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { monotoneLine, type ChartPoint } from '~/components/dashboard/chart-path';

export function Sparkline({
  values,
  accent,
  height = 26,
}: {
  values: readonly number[];
  accent: string;
  height?: number;
}) {
  const [width, setWidth] = React.useState(0);

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const line = React.useMemo(() => {
    if (width <= 0 || values.length === 0) {
      return '';
    }
    const peak = Math.max(1, ...values);
    const pad = 2;
    const span = Math.max(1, width - pad * 2);
    const coords: ChartPoint[] = values.map((value, index) => ({
      x: values.length === 1 ? width / 2 : pad + (index * span) / (values.length - 1),
      y: height - pad - (value / peak) * (height - pad * 2),
    }));
    return monotoneLine(coords);
  }, [height, values, width]);

  return (
    <View onLayout={onLayout} style={{ height }} className="w-full justify-end">
      {width > 0 && line ? (
        <Svg width={width} height={height}>
          <Path
            d={line}
            stroke={accent}
            strokeWidth={1.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}
