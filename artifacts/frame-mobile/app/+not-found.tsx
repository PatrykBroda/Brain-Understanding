import { Stack, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button, EmptyState, Screen } from "@/components/ui";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <Screen light="silver" focus="center" intensity={0.7}>
        <View style={styles.container}>
          <View style={styles.card}>
            <EmptyState
              icon="compass"
              title="This screen doesn't exist"
              body="The link may be out of date. Head back to your home screen."
              actionLabel="Go to home"
              onAction={() => router.replace("/")}
            />
          </View>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420 },
});
