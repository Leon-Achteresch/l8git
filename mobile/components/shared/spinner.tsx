import { Loader2 } from 'lucide-react-native';
import * as React from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '~/components/ui/icon';

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  const angle = useSharedValue(0);

  React.useEffect(() => {
    angle.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(angle);
  }, [angle]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  return (
    <Animated.View style={style}>
      <Icon as={Loader2} size={size} className={className} />
    </Animated.View>
  );
}
