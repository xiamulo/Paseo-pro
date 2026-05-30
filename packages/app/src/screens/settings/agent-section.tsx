import { memo, useCallback, useEffect, useMemo } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import { DraftAgentControls } from "@/composer/agent-controls";
import {
  getProviderIcon,
  type ProviderIconComponent,
  type ProviderIconProps,
} from "@/components/provider-icons";
import { useAgentFormState } from "@/hooks/use-agent-form-state";
import { useDraftAgentFeatures } from "@/hooks/use-draft-agent-features";
import { useTranslation } from "@/i18n";
import { useSessionStore } from "@/stores/session-store";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";

interface AgentSectionProps {
  serverId: string | null;
}

interface ReadyProviderOption {
  id: AgentProvider;
  label: string;
}

function useSettingsAgentCwd(serverId: string | null): string {
  return useSessionStore(
    useCallback(
      (state) => {
        if (!serverId) {
          return "";
        }
        const session = state.sessions[serverId];
        if (!session) {
          return "";
        }
        const firstWorkspace = Array.from(session.workspaces.values()).find((workspace) =>
          Boolean(workspace.workspaceDirectory.trim()),
        );
        if (firstWorkspace) {
          return firstWorkspace.workspaceDirectory;
        }
        const firstAgent =
          Array.from(session.agents.values()).find((agent) => Boolean(agent.cwd.trim())) ??
          Array.from(session.agentDetails.values()).find((agent) => Boolean(agent.cwd.trim()));
        return firstAgent?.cwd ?? "";
      },
      [serverId],
    ),
  );
}

function providerChipStyle({
  selected,
}: {
  selected: boolean;
}): (state: PressableStateCallbackType & { hovered?: boolean }) => StyleProp<ViewStyle> {
  return ({ hovered, pressed }) => [
    styles.providerChip,
    selected ? styles.providerChipSelected : null,
    Boolean(hovered) && !selected ? styles.providerChipHovered : null,
    pressed ? styles.providerChipPressed : null,
  ];
}

interface ProviderChipIconProps extends ProviderIconProps {
  Icon: ProviderIconComponent;
}

function ProviderChipIcon({ Icon, size, color }: ProviderChipIconProps) {
  return <Icon size={size} color={color} />;
}

const ThemedProviderChipIcon = withUnistyles(ProviderChipIcon);
const selectedProviderIconMapping = (theme: Theme) => ({
  size: theme.iconSize.sm,
  color: theme.colors.foreground,
});
const mutedProviderIconMapping = (theme: Theme) => ({
  size: theme.iconSize.sm,
  color: theme.colors.foregroundMuted,
});

interface ProviderChipProps {
  provider: ReadyProviderOption;
  selected: boolean;
  onSelect: (provider: AgentProvider) => void;
}

const ProviderChip = memo(function ProviderChip({
  provider,
  selected,
  onSelect,
}: ProviderChipProps) {
  const ProviderIcon = getProviderIcon(provider.id);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const chipStyle = useMemo(() => providerChipStyle({ selected }), [selected]);
  const textStyle = useMemo(
    () => [styles.providerChipText, selected ? styles.providerChipTextSelected : null],
    [selected],
  );
  const handlePress = useCallback(() => {
    onSelect(provider.id);
  }, [onSelect, provider.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={chipStyle}
      testID={`settings-agent-provider-${provider.id}`}
    >
      <ThemedProviderChipIcon
        Icon={ProviderIcon}
        uniProps={selected ? selectedProviderIconMapping : mutedProviderIconMapping}
      />
      <Text style={textStyle} numberOfLines={1}>
        {provider.label}
      </Text>
    </Pressable>
  );
});

export function AgentSection({ serverId }: AgentSectionProps) {
  const { t } = useTranslation();
  const fallbackCwd = useSettingsAgentCwd(serverId);
  const initialValues = useMemo(
    () => ({
      serverId,
      workingDir: fallbackCwd,
    }),
    [fallbackCwd, serverId],
  );
  const form = useAgentFormState({
    initialServerId: serverId,
    initialValues,
    isVisible: Boolean(serverId),
    isCreateFlow: true,
    onlineServerIds: serverId ? [serverId] : [],
  });
  const effectiveCwd = form.workingDir.trim() || fallbackCwd;
  const readyProviders = useMemo<ReadyProviderOption[]>(
    () =>
      (form.allProviderEntries ?? [])
        .filter((entry) => entry.enabled && entry.status === "ready")
        .map((entry) => ({
          id: entry.provider,
          label: entry.label ?? entry.provider,
        })),
    [form.allProviderEntries],
  );
  const selectedProvider = form.selectedProvider;
  const { features, setFeatureValue } = useDraftAgentFeatures({
    serverId,
    provider: selectedProvider,
    cwd: effectiveCwd,
    modeId: form.selectedMode,
    modelId: form.selectedModel,
    thinkingOptionId: form.selectedThinkingOptionId,
  });

  const {
    availableModels,
    availableThinkingOptions,
    isAllModelsLoading,
    isModelLoading,
    isProviderModelsRefreshing,
    modeOptions,
    modelSelectorProviders,
    providerDefinitions,
    refetchProviderModelsIfStale,
    refreshProviderModels,
    selectedMode,
    selectedModel,
    selectedThinkingOptionId,
    setModeFromUser,
    setModelFromUser,
    setProviderAndModelFromUser,
    setProviderFromUser,
    setThinkingOptionFromUser,
    setWorkingDir,
    workingDir,
  } = form;
  useEffect(() => {
    if (!effectiveCwd || workingDir === effectiveCwd) {
      return;
    }
    setWorkingDir(effectiveCwd);
  }, [effectiveCwd, setWorkingDir, workingDir]);

  const handleSelectProvider = useCallback(
    (provider: AgentProvider) => {
      setProviderFromUser(provider);
    },
    [setProviderFromUser],
  );

  const handleRetryProvider = useCallback(
    (provider: AgentProvider) => {
      refreshProviderModels(provider);
    },
    [refreshProviderModels],
  );

  if (!serverId || readyProviders.length === 0) {
    return null;
  }

  return (
    <SettingsSection title={t("Agent")}>
      <View style={settingsStyles.card}>
        <View style={styles.providerRow}>
          {readyProviders.map((provider) => (
            <ProviderChip
              key={provider.id}
              provider={provider}
              selected={provider.id === selectedProvider}
              onSelect={handleSelectProvider}
            />
          ))}
        </View>
        {selectedProvider ? (
          <View style={styles.controlsRow}>
            <DraftAgentControls
              providerDefinitions={providerDefinitions}
              selectedProvider={selectedProvider}
              onSelectProvider={setProviderFromUser}
              modeOptions={modeOptions}
              selectedMode={selectedMode}
              onSelectMode={setModeFromUser}
              models={availableModels}
              selectedModel={selectedModel}
              onSelectModel={setModelFromUser}
              isModelLoading={isModelLoading}
              modelSelectorProviders={modelSelectorProviders}
              isAllModelsLoading={isAllModelsLoading}
              onSelectProviderAndModel={setProviderAndModelFromUser}
              thinkingOptions={availableThinkingOptions}
              selectedThinkingOptionId={selectedThinkingOptionId}
              onSelectThinkingOption={setThinkingOptionFromUser}
              features={features}
              onSetFeature={setFeatureValue}
              onModelSelectorOpen={refetchProviderModelsIfStale}
              onRetryModelProvider={handleRetryProvider}
              isRetryingModelProvider={isProviderModelsRefreshing}
              disabled={!serverId}
              modelSelectorServerId={serverId}
            />
          </View>
        ) : null}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  providerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  },
  providerChip: {
    minHeight: 32,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  providerChipHovered: {
    backgroundColor: theme.colors.surface2,
  },
  providerChipPressed: {
    opacity: 0.8,
  },
  providerChipSelected: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
  },
  providerChipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  providerChipTextSelected: {
    color: theme.colors.foreground,
  },
  controlsRow: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
}));
