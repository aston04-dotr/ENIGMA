import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, radius } from "../lib/theme";

type Props = PressableProps & {
  title: string;
  variant?: "primary" | "ghost" | "outline";
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function UiButton({
  title,
  variant = "primary",
  loading,
  disabled,
  style,
  textStyle,
  ...rest
}: Props) {
  const dim = disabled || loading;
  if (variant === "primary") {
    return (
      <Pressable disabled={dim} style={({ pressed }) => [pressed && !dim && { opacity: 0.92 }, style]} {...rest}>
        <LinearGradient
          colors={[colors.violet, colors.navy]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.grad, dim && styles.dim]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.titlePrimary, textStyle]}>{title}</Text>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === "outline") {
    return (
      <Pressable
        disabled={dim}
        style={({ pressed }) => [
          styles.outline,
          pressed && !dim && { opacity: 0.85 },
          dim && styles.dimOutline,
          style,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={colors.violet} />
        ) : (
          <Text style={[styles.titleOutline, textStyle]}>{title}</Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable disabled={dim} style={({ pressed }) => [pressed && !dim && { opacity: 0.7 }, style]} {...rest}>
      {loading ? <ActivityIndicator color={colors.violet} /> : <Text style={[styles.titleGhost, textStyle]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grad: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  dim: { opacity: 0.55 },
  titlePrimary: { color: "#fff", fontSize: 17, fontWeight: "600", letterSpacing: 0.2 },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    alignItems: "center",
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  dimOutline: { opacity: 0.5 },
  titleOutline: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  titleGhost: { color: colors.violet, fontSize: 16, fontWeight: "600" },
});
