import * as React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';

import {
  bucketLabel,
  type ActivityGrouping,
  type ActivityPoint,
} from '~/components/dashboard/aggregate';
import { closeArea, monotoneLine, type ChartPoint } from '~/components/dashboard/chart-path';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

const PAD_TOP = 12;
const EDGE = 1.5;
const GRID_COLOR = palette.border;
const BASELINE_COLOR = palette.border;

export type ActivityChartProps = {
  points: readonly ActivityPoint[];
  grouping: ActivityGrouping;
  accent: string;
  height?: number;
  onScrub?: (index: number | null) => void;
};

export function ActivityChart({
  points,
  grouping,
  accent,
  height = 132,
  onScrub,
}: ActivityChartProps) {
  const gradientId = React.useId();
  const [width, setWidth] = React.useState(0);

  const cursorX = useSharedValue(0);
  const cursorY = useSharedValue(0);
  const cursorOpacity = useSharedValue(0);
  const activeIndex = useSharedValue(-1);

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const geometry = React.useMemo(() => {
    const count = points.length;
    if (width <= 0 || count === 0) {
      return { coords: [] as ChartPoint[], xs: [] as number[], ys: [] as number[], peak: 0 };
    }
    const peak = Math.max(1, ...points.map((point) => point.commits));
    const span = Math.max(1, width - EDGE * 2);
    const coords: ChartPoint[] = points.map((point, index) => ({
      x: count === 1 ? width / 2 : EDGE + (index * span) / (count - 1),
      y: height - (point.commits / peak) * (height - PAD_TOP),
    }));
    return {
      coords,
      xs: coords.map((coord) => coord.x),
      ys: coords.map((coord) => coord.y),
      peak,
    };
  }, [height, points, width]);

  const line = React.useMemo(() => monotoneLine(geometry.coords), [geometry.coords]);
  const area = React.useMemo(
    () => closeArea(line, geometry.coords, height),
    [geometry.coords, height, line]
  );

  const emit = React.useCallback(
    (index: number) => {
      onScrub?.(index < 0 ? null : index);
    },
    [onScrub]
  );

  const { xs, ys } = geometry;

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-14, 14])
        .onBegin((event) => {
          'worklet';
          if (xs.length === 0) {
            return;
          }
          cursorOpacity.value = withTiming(1, { duration: 120 });
          const index = nearestIndex(xs, event.x);
          cursorX.value = xs[index];
          cursorY.value = ys[index];
          if (activeIndex.value !== index) {
            activeIndex.value = index;
            runOnJS(emit)(index);
          }
        })
        .onUpdate((event) => {
          'worklet';
          if (xs.length === 0) {
            return;
          }
          const index = nearestIndex(xs, event.x);
          cursorX.value = xs[index];
          cursorY.value = ys[index];
          if (activeIndex.value !== index) {
            activeIndex.value = index;
            runOnJS(emit)(index);
          }
        })
        .onFinalize(() => {
          'worklet';
          cursorOpacity.value = withTiming(0, { duration: 220 });
          if (activeIndex.value !== -1) {
            activeIndex.value = -1;
            runOnJS(emit)(-1);
          }
        }),
    [activeIndex, cursorOpacity, cursorX, cursorY, emit, xs, ys]
  );

  const lineStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
    transform: [{ translateX: cursorX.value - 0.5 }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
    transform: [{ translateX: cursorX.value - 5 }, { translateY: cursorY.value - 5 }],
  }));

  const last = geometry.coords[geometry.coords.length - 1];
  const labels = edgeLabels(points, grouping);

  return (
    <View className="gap-2">
      <GestureDetector gesture={pan}>
        <View onLayout={onLayout} style={{ height }} className="w-full justify-end">
          {width > 0 ? (
            <>
              <Svg width={width} height={height}>
                <Defs>
                  <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={accent} stopOpacity={0.34} />
                    <Stop offset="0.7" stopColor={accent} stopOpacity={0.07} />
                    <Stop offset="1" stopColor={accent} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Line
                  x1={0}
                  y1={PAD_TOP}
                  x2={width}
                  y2={PAD_TOP}
                  stroke={GRID_COLOR}
                  strokeWidth={1}
                />
                <Line
                  x1={0}
                  y1={(height + PAD_TOP) / 2}
                  x2={width}
                  y2={(height + PAD_TOP) / 2}
                  stroke={GRID_COLOR}
                  strokeWidth={1}
                />
                <Line
                  x1={0}
                  y1={height - 0.5}
                  x2={width}
                  y2={height - 0.5}
                  stroke={BASELINE_COLOR}
                  strokeWidth={1}
                />
                {area ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
                {line ? (
                  <Path
                    d={line}
                    fill="none"
                    stroke={accent}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {last ? (
                  <>
                    <Circle cx={last.x} cy={last.y} r={5} fill={accent} fillOpacity={0.18} />
                    <Circle cx={last.x} cy={last.y} r={2.5} fill={accent} />
                  </>
                ) : null}
              </Svg>
              <Animated.View
                pointerEvents="none"
                style={[
                  lineStyle,
                  { backgroundColor: accent, top: PAD_TOP - 4, height: height - PAD_TOP + 4 },
                ]}
                className="absolute left-0 w-px"
              />
              <Animated.View
                pointerEvents="none"
                style={[dotStyle, { borderColor: accent }]}
                className="bg-background absolute left-0 top-0 h-2.5 w-2.5 rounded-full border-2"
              />
            </>
          ) : null}
        </View>
      </GestureDetector>
      <View className="flex-row justify-between">
        {labels.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            className="text-muted-foreground/70 text-2xs font-mono">
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function nearestIndex(xs: readonly number[], x: number): number {
  'worklet';
  if (xs.length <= 1) {
    return 0;
  }
  const step = xs[1] - xs[0];
  if (step <= 0) {
    return 0;
  }
  const raw = Math.round((x - xs[0]) / step);
  return Math.min(xs.length - 1, Math.max(0, raw));
}

function edgeLabels(points: readonly ActivityPoint[], grouping: ActivityGrouping): string[] {
  if (points.length === 0) {
    return [];
  }
  if (points.length < 4) {
    return points.map((point) => bucketLabel(point.date, grouping));
  }
  const middle = points[Math.floor((points.length - 1) / 2)];
  return [
    bucketLabel(points[0].date, grouping),
    bucketLabel(middle.date, grouping),
    bucketLabel(points[points.length - 1].date, grouping),
  ];
}
