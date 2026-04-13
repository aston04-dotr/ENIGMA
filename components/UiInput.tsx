import React from "react";
import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, radius } from "../lib/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export function UiInput({ label, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputErr : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
  },
  inputErr: { borderColor: colors.danger },
  err: { color: colors.danger, fontSize: 13, marginTop: 6 },
});
