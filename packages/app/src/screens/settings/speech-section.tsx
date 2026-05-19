import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Save } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/screens/settings/settings-section";
import { DEFAULT_ALIYUN_NLS_URL, useAliyunSpeechSettings } from "@/speech/aliyun-speech-settings";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";

const ThemedTextInput = withUnistyles(TextInput);
const textInputPlaceholderColorMapping = (theme: Theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
});

export function SpeechSection(_props: { serverId: string }) {
  const { settings, updateSettings } = useAliyunSpeechSettings();
  const isAliyunActive = settings.enabled;

  const [appKey, setAppKey] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [url, setUrl] = useState(DEFAULT_ALIYUN_NLS_URL);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setAppKey(settings.appKey);
    setAccessKeyId(settings.accessKeyId);
    setAccessKeySecret(settings.accessKeySecret);
    setUrl(settings.url);
  }, [settings.accessKeyId, settings.accessKeySecret, settings.appKey, settings.url]);

  const formRowStyle = useMemo(
    () => [settingsStyles.row, settingsStyles.rowBorder, styles.formRow],
    [],
  );

  const handleToggleAliyun = useCallback(
    async (next: boolean) => {
      try {
        await updateSettings({ enabled: next });
      } catch (error) {
        Alert.alert(
          "Unable to update speech recognition",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [updateSettings],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        appKey: appKey.trim(),
        accessKeyId: accessKeyId.trim(),
        accessKeySecret: accessKeySecret.trim(),
        url: url.trim() || DEFAULT_ALIYUN_NLS_URL,
      });
    } catch (error) {
      Alert.alert(
        "Unable to save Alibaba Cloud settings",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsSaving(false);
    }
  }, [accessKeyId, accessKeySecret, appKey, updateSettings, url]);

  return (
    <SettingsSection title="Speech recognition" testID="host-page-speech-card">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Alibaba Cloud NLS</Text>
            <Text style={settingsStyles.rowHint}>
              Save AppKey, AccessKey ID, and AccessKey Secret locally for app-side dictation
            </Text>
          </View>
          <Switch
            value={isAliyunActive}
            onValueChange={handleToggleAliyun}
            accessibilityLabel="Use Alibaba Cloud NLS"
          />
        </View>
        <View style={formRowStyle}>
          <View style={styles.field}>
            <Text style={styles.label}>AppKey</Text>
            <ThemedTextInput
              value={appKey}
              onChangeText={setAppKey}
              placeholder="Alibaba Cloud NLS AppKey"
              uniProps={textInputPlaceholderColorMapping}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSaving}
              style={styles.input}
              testID="aliyun-nls-app-key-input"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>AccessKey ID</Text>
            <ThemedTextInput
              value={accessKeyId}
              onChangeText={setAccessKeyId}
              placeholder="Alibaba Cloud AccessKey ID"
              uniProps={textInputPlaceholderColorMapping}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSaving}
              style={styles.input}
              testID="aliyun-access-key-id-input"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>AccessKey Secret</Text>
            <ThemedTextInput
              value={accessKeySecret}
              onChangeText={setAccessKeySecret}
              placeholder="Alibaba Cloud AccessKey Secret"
              uniProps={textInputPlaceholderColorMapping}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              editable={!isSaving}
              style={styles.input}
              testID="aliyun-access-key-secret-input"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Endpoint</Text>
            <ThemedTextInput
              value={url}
              onChangeText={setUrl}
              placeholder={DEFAULT_ALIYUN_NLS_URL}
              uniProps={textInputPlaceholderColorMapping}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSaving}
              style={styles.input}
              testID="aliyun-nls-url-input"
            />
          </View>
          <View style={styles.actions}>
            <Button
              size="sm"
              leftIcon={Save}
              onPress={handleSave}
              disabled={isSaving}
              testID="aliyun-nls-save-button"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  formRow: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: theme.spacing[3],
  },
  field: {
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  input: {
    backgroundColor: theme.colors.surface0,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  actions: {
    alignItems: "flex-start",
  },
}));
