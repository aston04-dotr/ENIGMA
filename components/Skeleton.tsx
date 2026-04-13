import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, radius, shadow } from "../lib/theme";

function PulseBlock({ h, r = radius.md }: { h: number; r?: number }) {
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({
    opacity: o.value,
  }));
  return <Animated.View style={[styles.block, { height: h, borderRadius: r }, style]} />;
}

export function ListingCardSkeleton() {
  return (
    <View style={[styles.card, shadow.card]}>
      <PulseBlock h={168} r={radius.lg} />
      <View style={styles.pad}>
        <PulseBlock h={18} />
        <View style={{ height: 10 }} />
        <PulseBlock h={14} />
        <View style={{ height: 10 }} />
        <PulseBlock h={22} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: 16,
    overflow: "hidden",
  },
  block: { backgroundColor: colors.line, width: "100%" },
  pad: { padding: 14 },
});
