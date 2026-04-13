import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { AuthProvider } from "../context/auth-context";
import { colors } from "../lib/theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          <Stack.Screen
            name="listing/[id]"
            options={{
              animation: Platform.OS === "ios" ? "default" : "slide_from_right",
              presentation: "card",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="user/[id]"
            options={{
              animation: Platform.OS === "ios" ? "default" : "slide_from_right",
              presentation: "card",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="chat/[id]"
            options={{
              animation: Platform.OS === "ios" ? "default" : "slide_from_right",
              presentation: "card",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen name="settings" options={{ animation: "slide_from_right", presentation: "card" }} />
          <Stack.Screen
            name="settings-promotion"
            options={{ animation: "slide_from_right", presentation: "card" }}
          />
          <Stack.Screen
            name="settings-packages"
            options={{ animation: "slide_from_right", presentation: "card" }}
          />
          <Stack.Screen name="payment" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
