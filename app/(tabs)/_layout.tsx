import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRequireAuth } from "../../hooks/useRequireAuth";
import { colors, radius } from "../../lib/theme";

export default function TabsLayout() {
  const { loading } = useRequireAuth();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>ENIGMA</Text>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violet,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 56 + insets.bottom + (Platform.OS === "ios" ? 0 : 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Лента",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Добавить",
          tabBarIcon: ({ color, size }) => (
            <View style={[styles.plusWrap, { borderColor: color }]}>
              <Ionicons name="add" size={size + 4} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Чаты",
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  splashLogo: { fontSize: 22, letterSpacing: 8, color: colors.muted, fontWeight: "300" },
  plusWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -2,
  },
});
