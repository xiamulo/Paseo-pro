import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronRight, Folder } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useQuery } from "@tanstack/react-query";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { shortenPath } from "@/utils/shorten-path";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useOpenProject } from "@/hooks/use-open-project";
import { buildWorkingDirectorySuggestions } from "@/utils/working-directory-suggestions";
import { isNative, isWeb } from "@/constants/platform";
import { useActiveServerId } from "@/hooks/use-active-server-id";
import {
  deriveInitialProjectBrowseDirectory,
  getParentProjectDirectory,
  getProjectDirectoryName,
  joinProjectDirectoryPath,
  normalizeProjectDirectoryPath,
  resolveProjectDirectoryInput,
} from "@/components/project-picker-paths";

interface DirectoryOption {
  name: string;
  path: string;
}

interface DirectorySuggestionsPayloadLike {
  baseDirectory?: string;
  directories: string[];
  entries?: Array<{ path: string; kind: "file" | "directory" }>;
}

const PROJECT_PICKER_SNAP_POINTS = ["82%", "94%"];

interface DirectoryRowProps {
  option: DirectoryOption;
  active: boolean;
  onPress: (path: string) => void;
}

function DirectoryRow({ option, active, onPress }: DirectoryRowProps) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => {
    onPress(option.path);
  }, [onPress, option.path]);
  const pressableStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed || active) && {
        backgroundColor: theme.colors.surface2,
      },
    ],
    [active, theme.colors.surface2],
  );
  const titleStyle = useMemo(
    () => [styles.rowTitle, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const pathStyle = useMemo(
    () => [styles.rowPath, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );

  return (
    <Pressable
      style={pressableStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${option.name}`}
      testID={`project-picker-directory-${option.path}`}
    >
      <View style={styles.rowContent}>
        <View style={styles.iconSlot}>
          <Folder size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
        </View>
        <View style={styles.rowTextGroup}>
          <Text style={titleStyle} numberOfLines={1}>
            {option.name}
          </Text>
          <Text style={pathStyle} numberOfLines={1}>
            {shortenPath(option.path)}
          </Text>
        </View>
        <ChevronRight size={16} strokeWidth={2.2} color={theme.colors.foregroundMuted} />
      </View>
    </Pressable>
  );
}

export function ProjectPickerModal() {
  const serverId = useActiveServerId();

  if (!serverId) return null;

  return <ProjectPickerModalContent serverId={serverId} />;
}

function ProjectPickerModalContent({ serverId }: { serverId: string }) {
  const { theme } = useUnistyles();

  const open = useKeyboardShortcutsStore((s) => s.projectPickerOpen);
  const setOpen = useKeyboardShortcutsStore((s) => s.setProjectPickerOpen);

  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const recommendedPaths = useRecommendedProjectPaths(serverId);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [inputResetKey, setInputResetKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const openProject = useOpenProject(serverId);

  const homeDirectoryQuery = useQuery({
    queryKey: ["project-picker-home-directory", serverId],
    queryFn: async () => {
      if (!client) return null;
      const result = await client.getDirectorySuggestions({
        query: "~/",
        includeDirectories: true,
        includeFiles: false,
        limit: 1,
      });
      return inferBaseDirectory(result);
    },
    enabled: Boolean(client) && isConnected && open,
    staleTime: 60_000,
    retry: false,
  });

  const directoryQuery = useQuery({
    queryKey: ["project-picker-directory", serverId, currentPath],
    queryFn: async () => {
      if (!client || !currentPath) return [];
      const directory = await client.listDirectory(currentPath, ".");
      return directory.entries
        .filter((entry) => entry.kind === "directory")
        .map((entry) => ({
          name: entry.name,
          path: joinProjectDirectoryPath(currentPath, entry.name),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    enabled: Boolean(client) && isConnected && open && Boolean(currentPath) && !query.trim(),
    retry: false,
  });

  const directorySuggestionsQuery = useQuery({
    queryKey: ["project-picker-directory-suggestions", serverId, query],
    queryFn: async () => {
      if (!client) return [];
      const result = await client.getDirectorySuggestions({
        query,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      return (
        result.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ?? []
      );
    },
    enabled: Boolean(client) && isConnected && open && Boolean(query.trim()),
    staleTime: 15_000,
    retry: false,
  });

  const searchOptions = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const suggestedPaths = buildWorkingDirectorySuggestions({
      recommendedPaths,
      serverPaths: directorySuggestionsQuery.data ?? [],
      query,
    });
    const normalizedQuery = resolveProjectDirectoryInput({
      value: trimmedQuery,
      homeDirectory: homeDirectoryQuery.data ?? null,
    });
    const paths =
      normalizedQuery && !suggestedPaths.includes(normalizedQuery)
        ? [normalizedQuery, ...suggestedPaths]
        : suggestedPaths;

    return paths.map((path) => ({
      name: getProjectDirectoryName(path) || path,
      path,
    }));
  }, [homeDirectoryQuery.data, query, directorySuggestionsQuery.data, recommendedPaths]);

  const isSearching = Boolean(query.trim());
  const visibleOptions = useMemo(
    () => (isSearching ? searchOptions : (directoryQuery.data ?? [])),
    [directoryQuery.data, isSearching, searchOptions],
  );
  const parentPath = currentPath ? getParentProjectDirectory(currentPath) : null;
  const canAddCurrent = Boolean(currentPath) && isConnected && !directoryQuery.isError;

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const navigateToDirectory = useCallback((path: string) => {
    const normalizedPath = normalizeProjectDirectoryPath(path);
    if (!normalizedPath) return;
    setCurrentPath(normalizedPath);
    setQuery("");
    setActiveIndex(0);
    setActionError(null);
    setInputResetKey((value) => value + 1);
  }, []);

  const handleBack = useCallback(() => {
    if (parentPath) {
      navigateToDirectory(parentPath);
    }
  }, [navigateToDirectory, parentPath]);

  const handleChangeQuery = useCallback((text: string) => {
    setQuery(text);
    setActiveIndex(0);
    setActionError(null);
  }, []);

  const handleSelectCurrent = useCallback(async () => {
    if (!currentPath || !canAddCurrent) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const didOpenProject = await openProject(currentPath);
      if (didOpenProject) {
        setOpen(false);
        return;
      }
      setActionError("Unable to open project");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to open project");
    } finally {
      setIsSubmitting(false);
    }
  }, [canAddCurrent, currentPath, openProject, setOpen]);

  const handleSubmitSearch = useCallback(() => {
    const option = visibleOptions[activeIndex] ?? visibleOptions[0];
    if (option) {
      navigateToDirectory(option.path);
      return;
    }

    const trimmedQuery = query.trim();
    const typedPath = resolveProjectDirectoryInput({
      value: trimmedQuery,
      homeDirectory: homeDirectoryQuery.data ?? null,
    });
    if (typedPath) {
      navigateToDirectory(typedPath);
    }
  }, [activeIndex, homeDirectoryQuery.data, navigateToDirectory, query, visibleOptions]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open || wasOpen) {
      return;
    }

    const initialPath = deriveInitialProjectBrowseDirectory({
      recommendedPaths,
      fallbackDirectory: homeDirectoryQuery.data ?? null,
    });
    setCurrentPath(initialPath);
    setQuery("");
    setActiveIndex(0);
    setActionError(null);
    setInputResetKey((value) => value + 1);
  }, [homeDirectoryQuery.data, open, recommendedPaths]);

  useEffect(() => {
    if (!open || currentPath || !homeDirectoryQuery.data) {
      return;
    }
    setCurrentPath(
      deriveInitialProjectBrowseDirectory({
        recommendedPaths,
        fallbackDirectory: homeDirectoryQuery.data,
      }),
    );
  }, [currentPath, homeDirectoryQuery.data, open, recommendedPaths]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex >= visibleOptions.length) {
      setActiveIndex(visibleOptions.length > 0 ? visibleOptions.length - 1 : 0);
    }
  }, [activeIndex, visibleOptions.length, open]);

  useEffect(() => {
    if (!open || !isWeb) return;

    function handler(event: KeyboardEvent) {
      const key = event.key;
      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Escape") return;

      if (key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (key === "Enter") {
        event.preventDefault();
        handleSubmitSearch();
        return;
      }

      if (visibleOptions.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => {
        const delta = key === "ArrowDown" ? 1 : -1;
        const next = current + delta;
        if (next < 0) return visibleOptions.length - 1;
        if (next >= visibleOptions.length) return 0;
        return next;
      });
    }

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [handleSubmitSearch, open, setOpen, visibleOptions.length]);

  const subtitleStyle = useMemo(
    () => [styles.headerSubtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const labelStyle = useMemo(
    () => [styles.sectionLabel, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const currentPathStyle = useMemo(
    () => [styles.currentPath, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const mutedTextStyle = useMemo(
    () => [styles.mutedText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const errorStyle = useMemo(
    () => [
      styles.errorText,
      {
        color: theme.colors.palette.red[300],
      },
    ],
    [theme.colors.palette.red],
  );
  const currentCardStyle = useMemo(
    () => [
      styles.currentCard,
      {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
      },
    ],
    [theme.colors.border, theme.colors.surface0],
  );

  const header = useMemo<SheetHeader>(
    () => ({
      title: "Add project",
      subtitle: (
        <Text style={subtitleStyle} numberOfLines={1}>
          {currentPath ? shortenPath(currentPath) : "Choose a directory"}
        </Text>
      ),
      back: parentPath
        ? {
            onPress: handleBack,
            label: "Parent directory",
            accessibilityLabel: "Go to parent directory",
          }
        : undefined,
      actions: (
        <Button
          variant="default"
          size="sm"
          onPress={handleSelectCurrent}
          disabled={!canAddCurrent || isSubmitting}
          loading={isSubmitting}
          testID="project-picker-add-current"
        >
          Add
        </Button>
      ),
      search: {
        value: query,
        onChange: handleChangeQuery,
        resetKey: inputResetKey,
        placeholder: "Search or enter path",
        autoFocus: !isNative,
        testID: "project-picker-search",
      },
    }),
    [
      canAddCurrent,
      currentPath,
      handleBack,
      handleChangeQuery,
      handleSelectCurrent,
      inputResetKey,
      isSubmitting,
      parentPath,
      query,
      subtitleStyle,
    ],
  );

  return (
    <AdaptiveModalSheet
      visible={open}
      onClose={handleClose}
      header={header}
      snapPoints={PROJECT_PICKER_SNAP_POINTS}
      desktopMaxWidth={640}
      scrollable={false}
      testID="project-picker-modal"
    >
      <View style={styles.body}>
        {actionError ? <Text style={errorStyle}>{actionError}</Text> : null}

        <View style={currentCardStyle}>
          <Text style={labelStyle}>Current directory</Text>
          <Text style={currentPathStyle} numberOfLines={2}>
            {currentPath ? shortenPath(currentPath) : "Loading..."}
          </Text>
        </View>

        <Text style={labelStyle}>{isSearching ? "Matching directories" : "Folders"}</Text>
        <ScrollView
          style={styles.results}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderContent({
            isConnected,
            isSearching,
            isHomeLoading: homeDirectoryQuery.isLoading,
            isDirectoryLoading: directoryQuery.isLoading,
            isSearchLoading: directorySuggestionsQuery.isLoading,
            directoryError: directoryQuery.error,
            searchError: directorySuggestionsQuery.error,
            currentPath,
            options: visibleOptions,
            activeIndex,
            mutedTextStyle,
            errorStyle,
            spinnerColor: theme.colors.foregroundMuted,
            onNavigate: navigateToDirectory,
          })}
        </ScrollView>
      </View>
    </AdaptiveModalSheet>
  );
}

function renderContent(input: {
  isConnected: boolean;
  isSearching: boolean;
  isHomeLoading: boolean;
  isDirectoryLoading: boolean;
  isSearchLoading: boolean;
  directoryError: Error | null;
  searchError: Error | null;
  currentPath: string | null;
  options: DirectoryOption[];
  activeIndex: number;
  mutedTextStyle: object;
  errorStyle: object;
  spinnerColor: string;
  onNavigate: (path: string) => void;
}) {
  if (!input.isConnected) {
    return <Text style={input.mutedTextStyle}>Host is offline</Text>;
  }

  if (!input.currentPath && input.isHomeLoading) {
    return <LoadingState color={input.spinnerColor} label="Loading directories..." />;
  }

  if (!input.currentPath) {
    return <Text style={input.errorStyle}>Unable to load home directory</Text>;
  }

  if (!input.isSearching && input.isDirectoryLoading) {
    return <LoadingState color={input.spinnerColor} label="Loading folders..." />;
  }

  if (input.isSearching && input.isSearchLoading) {
    return <LoadingState color={input.spinnerColor} label="Searching directories..." />;
  }

  if (!input.isSearching && input.directoryError) {
    return <Text style={input.errorStyle}>Unable to list directory</Text>;
  }

  if (input.isSearching && input.searchError) {
    return <Text style={input.errorStyle}>Unable to search directories</Text>;
  }

  if (input.options.length === 0) {
    return (
      <Text style={input.mutedTextStyle}>
        {input.isSearching ? "No matching directories" : "No folders in this directory"}
      </Text>
    );
  }

  return (
    <>
      {input.options.map((option, index) => (
        <DirectoryRow
          key={option.path}
          option={option}
          active={index === input.activeIndex}
          onPress={input.onNavigate}
        />
      ))}
    </>
  );
}

function LoadingState({ color, label }: { color: string; label: string }) {
  const { theme } = useUnistyles();
  const textStyle = useMemo(
    () => [styles.mutedText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  return (
    <View style={styles.loadingRow}>
      <LoadingSpinner color={color} />
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

function inferBaseDirectory(payload: DirectorySuggestionsPayloadLike): string | null {
  if (payload.baseDirectory) {
    return normalizeProjectDirectoryPath(payload.baseDirectory);
  }

  // COMPAT(projectPickerBaseDirectory): added in v0.1.78, remove after 2026-11-20.
  const firstDirectory = payload.directories[0];
  if (firstDirectory) {
    return getParentProjectDirectory(firstDirectory);
  }

  const firstEntry = payload.entries?.find((entry) => entry.kind === "directory");
  return firstEntry ? getParentProjectDirectory(firstEntry.path) : null;
}

const styles = StyleSheet.create((theme) => ({
  body: {
    flex: 1,
    minHeight: 0,
    gap: theme.spacing[4],
  },
  headerSubtitle: {
    fontSize: theme.fontSize.xs,
  },
  currentCard: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1],
  },
  currentPath: {
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  results: {
    flex: 1,
    minHeight: 0,
  },
  resultsContent: {
    paddingBottom: theme.spacing[2],
  },
  row: {
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconSlot: {
    width: 18,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  rowTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
  },
  rowPath: {
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },
  mutedText: {
    paddingVertical: theme.spacing[4],
    fontSize: theme.fontSize.base,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[4],
  },
}));
