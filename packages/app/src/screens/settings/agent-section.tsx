import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type {
  AgentFeature,
  AgentModelDefinition,
  AgentProvider,
  ProviderSnapshotEntry,
} from "@server/server/agent/agent-sdk-types";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { getProviderIcon } from "@/components/provider-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useDraftAgentFeatures } from "@/hooks/use-draft-agent-features";
import {
  mergeProviderPreferences,
  useFormPreferences,
  type ProviderPreferences,
} from "@/hooks/use-form-preferences";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { buildProviderDefinitions } from "@/utils/provider-definitions";

interface AgentSectionProps {
  serverId: string | null;
}

function chipStyle({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.providerChip,
    Boolean(hovered) && styles.providerChipHovered,
    pressed && styles.providerChipPressed,
  ];
}

function selectedChipStyle({
  pressed,
  hovered,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.providerChip,
    styles.providerChipSelected,
    Boolean(hovered) && styles.providerChipSelectedHovered,
    pressed && styles.providerChipPressed,
  ];
}

function menuTriggerStyle({
  pressed,
  hovered,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.menuTrigger,
    Boolean(hovered) && styles.menuTriggerHovered,
    pressed && styles.menuTriggerPressed,
  ];
}

function buildProviderModelMap(
  entries: ProviderSnapshotEntry[] | undefined,
): Map<string, AgentModelDefinition[]> {
  const map = new Map<string, AgentModelDefinition[]>();
  for (const entry of entries ?? []) {
    map.set(entry.provider, entry.models ?? []);
  }
  return map;
}

function pickInitialModelId(
  providerPrefs: ProviderPreferences | undefined,
  models: AgentModelDefinition[],
): string {
  const stored = providerPrefs?.model;
  if (stored && models.some((m) => m.id === stored)) {
    return stored;
  }
  return models[0]?.id ?? stored ?? "";
}

function pickInitialModeId(
  providerPrefs: ProviderPreferences | undefined,
  providerDef: AgentProviderDefinition | undefined,
): string {
  const stored = providerPrefs?.mode;
  const modes = providerDef?.modes ?? [];
  if (stored && modes.some((m) => m.id === stored)) {
    return stored;
  }
  return providerDef?.defaultModeId ?? modes[0]?.id ?? "";
}

function pickInitialThinkingOptionId(
  providerPrefs: ProviderPreferences | undefined,
  modelId: string,
  models: AgentModelDefinition[],
): string {
  const stored = providerPrefs?.thinkingByModel?.[modelId];
  const options = models.find((m) => m.id === modelId)?.thinkingOptions ?? [];
  if (stored && options.some((o) => o.id === stored)) {
    return stored;
  }
  return options[0]?.id ?? "";
}

function FeatureSelectRow({
  feature,
  onSetFeature,
}: {
  feature: Extract<AgentFeature, { type: "select" }>;
  onSetFeature: (featureId: string, value: unknown) => void;
}) {
  const { theme } = useUnistyles();
  const selectedOption = feature.options.find((option) => option.id === feature.value);
  const handleSelect = useCallback(
    (optionId: string) => {
      onSetFeature(feature.id, optionId);
    },
    [feature.id, onSetFeature],
  );

  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{feature.label}</Text>
        {feature.description || feature.tooltip ? (
          <Text style={settingsStyles.rowHint}>{feature.description ?? feature.tooltip}</Text>
        ) : null}
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={menuTriggerStyle}
          accessibilityRole="button"
          accessibilityLabel={`Select ${feature.label}`}
        >
          <Text style={styles.menuTriggerText}>{selectedOption?.label ?? feature.label}</Text>
          <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={220}>
          {feature.options.map((option) => (
            <FeatureOptionItem
              key={option.id}
              option={option}
              selected={option.id === feature.value}
              onSelect={handleSelect}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function FeatureOptionItem({
  option,
  selected,
  onSelect,
}: {
  option: { id: string; label: string };
  selected: boolean;
  onSelect: (optionId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(option.id);
  }, [onSelect, option.id]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {option.label}
    </DropdownMenuItem>
  );
}

function FeatureToggleRow({
  feature,
  onSetFeature,
}: {
  feature: Extract<AgentFeature, { type: "toggle" }>;
  onSetFeature: (featureId: string, value: unknown) => void;
}) {
  const handleChange = useCallback(
    (value: boolean) => {
      onSetFeature(feature.id, value);
    },
    [feature.id, onSetFeature],
  );

  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{feature.label}</Text>
        {feature.description || feature.tooltip ? (
          <Text style={settingsStyles.rowHint}>{feature.description ?? feature.tooltip}</Text>
        ) : null}
      </View>
      <Switch
        value={feature.value}
        onValueChange={handleChange}
        accessibilityLabel={feature.label}
      />
    </View>
  );
}

function ModeItem({
  mode,
  selected,
  onSelect,
}: {
  mode: { id: string; label: string };
  selected: boolean;
  onSelect: (modeId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(mode.id);
  }, [mode.id, onSelect]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {mode.label}
    </DropdownMenuItem>
  );
}

function ThinkingItem({
  option,
  selected,
  onSelect,
}: {
  option: { id: string; label: string };
  selected: boolean;
  onSelect: (thinkingOptionId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(option.id);
  }, [option.id, onSelect]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {option.label}
    </DropdownMenuItem>
  );
}

function ProviderChip({
  provider,
  selected,
  onSelect,
}: {
  provider: AgentProviderDefinition;
  selected: boolean;
  onSelect: (provider: AgentProvider) => void;
}) {
  const { theme } = useUnistyles();
  const ProviderIcon = getProviderIcon(provider.id);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const textStyle = useMemo(
    () => [styles.providerChipText, selected && styles.providerChipTextSelected],
    [selected],
  );
  const handlePress = useCallback(() => {
    onSelect(provider.id);
  }, [onSelect, provider.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={selected ? selectedChipStyle : chipStyle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={`Select ${provider.label}`}
    >
      <ProviderIcon
        size={theme.iconSize.sm}
        color={selected ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      <Text style={textStyle} numberOfLines={1}>
        {provider.label}
      </Text>
    </Pressable>
  );
}

function ProviderChipRow({
  providers,
  selectedProvider,
  onSelectProvider,
}: {
  providers: AgentProviderDefinition[];
  selectedProvider: AgentProvider;
  onSelectProvider: (provider: AgentProvider) => void;
}) {
  return (
    <View style={styles.providerRow}>
      {providers.map((provider) => (
        <ProviderChip
          key={provider.id}
          provider={provider}
          selected={provider.id === selectedProvider}
          onSelect={onSelectProvider}
        />
      ))}
    </View>
  );
}

interface AgentControlsProps {
  serverId: string | null;
  selectedProvider: AgentProvider;
  providerDef: AgentProviderDefinition;
  providerDefinitions: AgentProviderDefinition[];
  allProviderModels: Map<string, AgentModelDefinition[]>;
  isModelsLoading: boolean;
  canSelectProvider: (provider: string) => boolean;
}

function AgentControls({
  serverId,
  selectedProvider,
  providerDef,
  providerDefinitions,
  allProviderModels,
  isModelsLoading,
  canSelectProvider,
}: AgentControlsProps) {
  const { theme } = useUnistyles();
  const { preferences, updatePreferences } = useFormPreferences();
  const providerPrefs = preferences.providerPreferences?.[selectedProvider];
  const providerModels = useMemo(
    () => allProviderModels.get(selectedProvider) ?? [],
    [allProviderModels, selectedProvider],
  );

  const selectedModel = pickInitialModelId(providerPrefs, providerModels);
  const selectedMode = pickInitialModeId(providerPrefs, providerDef);
  const selectedThinkingOptionId = pickInitialThinkingOptionId(
    providerPrefs,
    selectedModel,
    providerModels,
  );

  const thinkingOptions = useMemo(
    () => providerModels.find((m) => m.id === selectedModel)?.thinkingOptions ?? [],
    [providerModels, selectedModel],
  );

  const selectedProviderLabel = providerDef.label;
  const selectedModeLabel =
    providerDef.modes.find((mode) => mode.id === selectedMode)?.label ?? "Default";
  const selectedThinkingLabel = thinkingOptions.find(
    (option) => option.id === selectedThinkingOptionId,
  )?.label;

  const handleSelectModel = useCallback(
    (provider: AgentProvider, modelId: string) => {
      void updatePreferences((current) => {
        const next = mergeProviderPreferences({
          preferences: current,
          provider,
          updates: { model: modelId },
        });
        return provider === current.provider ? next : { ...next, provider };
      });
    },
    [updatePreferences],
  );

  const handleSelectMode = useCallback(
    (modeId: string) => {
      void updatePreferences((current) =>
        mergeProviderPreferences({
          preferences: current,
          provider: selectedProvider,
          updates: { mode: modeId },
        }),
      );
    },
    [selectedProvider, updatePreferences],
  );

  const handleSelectThinking = useCallback(
    (thinkingOptionId: string) => {
      if (!selectedModel) {
        return;
      }
      void updatePreferences((current) =>
        mergeProviderPreferences({
          preferences: current,
          provider: selectedProvider,
          updates: {
            thinkingByModel: { [selectedModel]: thinkingOptionId },
          },
        }),
      );
    },
    [selectedModel, selectedProvider, updatePreferences],
  );

  const features = useDraftAgentFeatures({
    serverId,
    provider: selectedProvider,
    cwd: "~",
    modeId: selectedMode,
    modelId: selectedModel,
    thinkingOptionId: selectedThinkingOptionId,
  });

  return (
    <>
      <View style={settingsStyles.rowBorder}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Model</Text>
            <Text style={settingsStyles.rowHint}>{selectedProviderLabel}</Text>
          </View>
          <View style={styles.modelSelectorSlot}>
            <CombinedModelSelector
              providerDefinitions={providerDefinitions}
              allProviderModels={allProviderModels}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              onSelect={handleSelectModel}
              isLoading={isModelsLoading}
              canSelectProvider={canSelectProvider}
            />
          </View>
        </View>
      </View>
      {providerDef.modes.length > 0 ? (
        <View style={settingsStyles.rowBorder}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>Mode</Text>
              <Text style={settingsStyles.rowHint}>Default mode for new agents</Text>
            </View>
            <DropdownMenu>
              <DropdownMenuTrigger
                style={menuTriggerStyle}
                accessibilityRole="button"
                accessibilityLabel="Select agent mode"
              >
                <Text style={styles.menuTriggerText}>{selectedModeLabel}</Text>
                <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" width={220}>
                {providerDef.modes.map((mode) => (
                  <ModeItem
                    key={mode.id}
                    mode={mode}
                    selected={mode.id === selectedMode}
                    onSelect={handleSelectMode}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        </View>
      ) : null}
      {thinkingOptions.length > 0 && selectedThinkingLabel ? (
        <View style={settingsStyles.rowBorder}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>Thinking</Text>
              <Text style={settingsStyles.rowHint}>Default reasoning effort by model</Text>
            </View>
            <DropdownMenu>
              <DropdownMenuTrigger
                style={menuTriggerStyle}
                accessibilityRole="button"
                accessibilityLabel="Select thinking option"
              >
                <Text style={styles.menuTriggerText}>{selectedThinkingLabel}</Text>
                <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" width={220}>
                {thinkingOptions.map((option) => (
                  <ThinkingItem
                    key={option.id}
                    option={option}
                    selected={option.id === selectedThinkingOptionId}
                    onSelect={handleSelectThinking}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        </View>
      ) : null}
      {features.features.map((feature) => (
        <View key={feature.id} style={settingsStyles.rowBorder}>
          {feature.type === "toggle" ? (
            <FeatureToggleRow feature={feature} onSetFeature={features.setFeatureValue} />
          ) : (
            <FeatureSelectRow feature={feature} onSetFeature={features.setFeatureValue} />
          )}
        </View>
      ))}
    </>
  );
}

export function AgentSection({ serverId }: AgentSectionProps) {
  const { entries, isLoading: isSnapshotLoading } = useProvidersSnapshot(serverId);
  const { preferences } = useFormPreferences();

  const providerEntries = useMemo(() => entries ?? [], [entries]);
  const providerDefinitions = useMemo(
    () => buildProviderDefinitions(providerEntries),
    [providerEntries],
  );

  const readyProviderIds = useMemo(
    () =>
      new Set(
        providerEntries
          .filter((entry) => entry.enabled && entry.status === "ready")
          .map((entry) => entry.provider),
      ),
    [providerEntries],
  );
  const availableProviders = useMemo(
    () => providerDefinitions.filter((definition) => readyProviderIds.has(definition.id)),
    [providerDefinitions, readyProviderIds],
  );

  const allProviderModels = useMemo(
    () => buildProviderModelMap(providerEntries),
    [providerEntries],
  );

  // Local UI selection. Initialised from the persisted preference, but never
  // written back to preferences unless the user actually picks something.
  // This avoids the silent "auto-pin first ready provider" surprise.
  const [uiSelectedProvider, setUiSelectedProvider] = useState<AgentProvider | null>(null);

  // When the persisted provider becomes available (or changes elsewhere), and
  // the user has not yet picked anything in this session, mirror it into the
  // local UI state. We never write back; we only read.
  useEffect(() => {
    if (uiSelectedProvider !== null) return;
    if (preferences.provider && readyProviderIds.has(preferences.provider)) {
      setUiSelectedProvider(preferences.provider);
      return;
    }
    if (availableProviders.length > 0) {
      setUiSelectedProvider(availableProviders[0]?.id ?? null);
    }
  }, [availableProviders, preferences.provider, readyProviderIds, uiSelectedProvider]);

  // If the currently UI-selected provider becomes unavailable (e.g. host
  // toggled it off), fall back to the first ready one for display purposes
  // only; still no write-back.
  useEffect(() => {
    if (!uiSelectedProvider) return;
    if (readyProviderIds.has(uiSelectedProvider)) return;
    setUiSelectedProvider(availableProviders[0]?.id ?? null);
  }, [availableProviders, readyProviderIds, uiSelectedProvider]);

  const handleSelectProvider = useCallback((provider: AgentProvider) => {
    setUiSelectedProvider(provider);
    // Note: we deliberately do NOT mirror chip selection into
    // `preferences.provider` here. `preferences.provider` is the "last actually
    // used" provider. It is updated by the composer when the user starts a run
    // (via setProviderFromUser/setProviderAndModelFromUser in
    // use-agent-form-state). Settings is just a pre-flight editor for the
    // per-provider config bucket, not the global "current provider".
  }, []);

  const canSelectProvider = useCallback(
    (provider: string) => readyProviderIds.has(provider),
    [readyProviderIds],
  );

  const selectedProviderDef = useMemo(
    () =>
      uiSelectedProvider
        ? (availableProviders.find((definition) => definition.id === uiSelectedProvider) ?? null)
        : null,
    [availableProviders, uiSelectedProvider],
  );

  if (!serverId) {
    return null;
  }
  if (availableProviders.length === 0) {
    return null;
  }
  if (!uiSelectedProvider || !selectedProviderDef) {
    return null;
  }

  return (
    <SettingsSection title="Agent" testID="settings-agent-section">
      <View style={settingsStyles.card}>
        <ProviderChipRow
          providers={availableProviders}
          selectedProvider={uiSelectedProvider}
          onSelectProvider={handleSelectProvider}
        />
        <AgentControls
          serverId={serverId}
          selectedProvider={uiSelectedProvider}
          providerDef={selectedProviderDef}
          providerDefinitions={availableProviders}
          allProviderModels={allProviderModels}
          isModelsLoading={isSnapshotLoading}
          canSelectProvider={canSelectProvider}
        />
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  providerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  providerChip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  providerChipHovered: {
    backgroundColor: theme.colors.surface3,
  },
  providerChipSelected: {
    backgroundColor: theme.colors.surface3,
    borderColor: theme.colors.borderAccent,
  },
  providerChipSelectedHovered: {
    backgroundColor: theme.colors.surface3,
  },
  providerChipPressed: {
    opacity: 0.85,
  },
  providerChipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  providerChipTextSelected: {
    color: theme.colors.foreground,
  },
  modelSelectorSlot: {
    maxWidth: 260,
    minWidth: 0,
    alignItems: "flex-end",
  },
  menuTrigger: {
    minHeight: 32,
    maxWidth: 240,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuTriggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  menuTriggerPressed: {
    opacity: 0.85,
  },
  menuTriggerText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
