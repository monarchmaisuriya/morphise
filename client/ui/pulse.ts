import { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";

const NATIVE_DRIVER = Platform.OS !== "web";

// A slow fade between full and faint, for running work and loading placeholders (Paseo spins a
// ring for running work and pulses its loading placeholders).
export function usePulse(on: boolean): Animated.Value {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on) {
      value.setValue(1);
      return;
    }
    const ease = Easing.inOut(Easing.ease);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 0.25, duration: 750, easing: ease, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(value, { toValue: 1, duration: 750, easing: ease, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, value]);
  return value;
}
