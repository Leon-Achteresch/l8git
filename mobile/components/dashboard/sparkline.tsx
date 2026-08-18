import * as React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

const GAP = 1;
const EMPTY_COLOR = 'rgba(255,255,255,0.07)';

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

  const bars = React.useMemo(() => {
    if (width <= 0 || values.length === 0) {
      return [];
    }
    const peak = Math.max(1, ...values);
    const barWidth = Math.max(1.5, (width - GAP * (values.length - 1)) / values.length);
    const radius = Math.min(1.5, barWidth / 2);
    return values.map((value, index) => {
      const scaled = value > 0 ? Math.max(3, (value / peak) * height) : 2;
      return {
        key: index,
        x: index * (barWidth + GAP),
        y: height - scaled,
        width: barWidth,
        height: scaled,
        radius,
        fill: value > 0 ? accent : EMPTY_COLOR,
        opacity: value > 0 ? 0.35 + 0.65 * (value / peak) : 1,
      };
    });
  }, [accent, height, values, width]);

  return (
    <View onLayout={onLayout} style={{ height }} className="w-full justify-end">
      {width > 0 ? (
        <Svg width={width} height={height}>
          {bars.map((bar) => (
            <Rect
              key={bar.key}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={bar.radius}
              fill={bar.fill}
              fillOpacity={bar.opacity}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
