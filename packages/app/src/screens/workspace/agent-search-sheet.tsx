import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Bot, CircleAlert, Search, UserRound, Wrench } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type {
  AgentSearchMatch,
  AgentSearchResult,
  DaemonClient,
} from "@server/client/daemon-client";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";

interface AgentSearchSheetProps {
  client: DaemonClient | null;
  connected: boolean;
  visible: boolean;
  serverId: string;
  agentIds?: readonly string[];
  projectId?: string | null;
  cwd?: string | null;
  onClose: () => void;
  onOpenAgent: (agentId: string) => void;
}

const SEARCH_DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 50;
const SNAP_POINTS = ["75%", "92%"];
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedBot = withUnistyles(Bot);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedSearch = withUnistyles(Search);
const ThemedUserRound = withUnistyles(UserRound);
const ThemedWrench = withUnistyles(Wrench);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function formatMatchKind(kind: AgentSearchMatch["kind"]): string {
  switch (kind) {
    case "user_message":
      return "User";
    case "assistant_message":
      return "Assistant";
    case "reasoning":
      return "Reasoning";
    case "tool_call":
      return "Tool";
    case "todo":
      return "Todo";
    case "error":
      return "Error";
    default:
      return "Match";
  }
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getResultTitle(result: AgentSearchResult): string {
  return result.agent.title?.trim() || "New agent";
}

function MatchIcon({ kind }: { kind: AgentSearchMatch["kind"] }) {
  if (kind === "user_message") {
    return <ThemedUserRound size={14} uniProps={foregroundMutedColorMapping} />;
  }
  if (kind === "tool_call") {
    return <ThemedWrench size={14} uniProps={foregroundMutedColorMapping} />;
  }
  if (kind === "error") {
    return <ThemedCircleAlert size={14} uniProps={destructiveColorMapping} />;
  }
  return <ThemedBot size={14} uniProps={foregroundMutedColorMapping} />;
}

interface AgentSearchRowProps {
  result: AgentSearchResult;
  match: AgentSearchMatch;
  onPress: (agentId: string) => void;
}

function AgentSearchRow({ result, match, onPress }: AgentSearchRowProps) {
  const handlePress = useCallback(() => {
    onPress(result.agent.id);
  }, [onPress, result.agent.id]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.row,
      (hovered || pressed) && styles.rowInteractive,
    ],
    [],
  );
  const timestamp = formatTimestamp(match.timestamp);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${getResultTitle(result)}`}
      onPress={handlePress}
      style={rowStyle}
    >
      <View style={styles.rowHeader}>
        <View style={styles.agentTitleGroup}>
          <Text style={styles.agentTitle} numberOfLines={1}>
            {getResultTitle(result)}
          </Text>
          <Text style={styles.agentMeta} numberOfLines={1}>
            {result.project?.projectName ?? result.agent.cwd}
          </Text>
        </View>
        <Text style={styles.timestamp} numberOfLines={1}>
          {timestamp}
        </Text>
      </View>
      <View style={styles.matchMetaRow}>
        <MatchIcon kind={match.kind} />
        <Text style={styles.matchKind} numberOfLines={1}>
          {formatMatchKind(match.kind)}
        </Text>
      </View>
      <Text style={styles.snippet} numberOfLines={3}>
        {match.snippet}
      </Text>
    </Pressable>
  );
}

function flattenSearchResults(results: AgentSearchResult[]): Array<{
  result: AgentSearchResult;
  match: AgentSearchMatch;
}> {
  return results
    .flatMap((result) => result.matches.map((match) => ({ result, match })))
    .sort((left, right) => {
      const leftTimestamp = Date.parse(left.match.timestamp);
      const rightTimestamp = Date.parse(right.match.timestamp);
      const timestampDelta =
        (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) -
        (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
      if (timestampDelta !== 0) {
        return timestampDelta;
      }
      return right.match.seq - left.match.seq;
    });
}

export function AgentSearchSheet({
  client,
  connected,
  visible,
  serverId,
  agentIds,
  projectId,
  cwd,
  onClose,
  onOpenAgent,
}: AgentSearchSheetProps) {
  const [query, setQuery] = useState("");
  const [searchResetKey, bumpSearchResetKey] = useReducer((key: number) => key + 1, 0);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const canSearch = debouncedQuery.length >= MIN_QUERY_LENGTH;
  const enabled = visible && connected && Boolean(client) && canSearch;
  const agentIdsKey = useMemo(() => (agentIds ?? []).join("\0"), [agentIds]);

  const searchQuery = useQuery({
    queryKey: [
      "agent-search",
      serverId,
      agentIdsKey,
      projectId ?? null,
      cwd ?? null,
      debouncedQuery,
    ],
    enabled,
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return client.searchAgents({
        query: debouncedQuery,
        ...(agentIds !== undefined ? { agentIds: [...agentIds] } : {}),
        ...(projectId ? { projectId } : {}),
        ...(cwd ? { cwd } : {}),
        limit: RESULT_LIMIT,
      });
    },
  });

  const handleClose = useCallback(() => {
    setQuery("");
    bumpSearchResetKey();
    onClose();
  }, [onClose]);

  const handleOpenAgent = useCallback(
    (agentId: string) => {
      onOpenAgent(agentId);
      handleClose();
    },
    [handleClose, onOpenAgent],
  );

  const header = useMemo<SheetHeader>(
    () => ({
      title: "Search agents",
      leading: <ThemedSearch size={18} uniProps={foregroundColorMapping} />,
      search: {
        value: query,
        initialValue: query,
        resetKey: `agent-search-${searchResetKey}`,
        onChange: setQuery,
        placeholder: "Search conversations",
        autoFocus: true,
        testID: "agent-search-input",
      },
    }),
    [query, searchResetKey],
  );

  const rows = useMemo(
    () => flattenSearchResults(searchQuery.data?.results ?? []),
    [searchQuery.data?.results],
  );

  const stateText = useMemo(() => {
    if (!connected) {
      return "Host is not connected";
    }
    if (query.trim().length === 0) {
      return "Search messages, reasoning, tool output, and errors";
    }
    if (!canSearch) {
      return "Type at least 2 characters";
    }
    if (searchQuery.isFetching) {
      return "Searching...";
    }
    if (searchQuery.isError) {
      return searchQuery.error instanceof Error ? searchQuery.error.message : "Unable to search";
    }
    if (searchQuery.data?.error) {
      return searchQuery.data.error;
    }
    if (rows.length === 0) {
      return "No matches found";
    }
    return "";
  }, [
    canSearch,
    connected,
    query,
    rows.length,
    searchQuery.data?.error,
    searchQuery.error,
    searchQuery.isError,
    searchQuery.isFetching,
  ]);

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      desktopMaxWidth={720}
      snapPoints={SNAP_POINTS}
      testID="agent-search-sheet"
    >
      {searchQuery.isFetching ? (
        <View style={styles.loadingRow}>
          <ThemedActivityIndicator size={14} uniProps={foregroundMutedColorMapping} />
          <Text style={styles.stateText}>Searching...</Text>
        </View>
      ) : null}

      {stateText && !searchQuery.isFetching ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{stateText}</Text>
        </View>
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.resultsList}>
          {rows.map(({ result, match }) => (
            <AgentSearchRow
              key={`${result.agent.id}:${match.seq}`}
              result={result}
              match={match}
              onPress={handleOpenAgent}
            />
          ))}
        </View>
      ) : null}

      {searchQuery.data?.truncated ? (
        <Text style={styles.footerText} numberOfLines={2}>
          Showing the first {RESULT_LIMIT} matches
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button variant="secondary" onPress={handleClose} style={styles.cancelButton}>
          Cancel
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  stateBox: {
    paddingVertical: theme.spacing[8],
    alignItems: "center",
  },
  stateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  resultsList: {
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surface1,
  },
  row: {
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface2,
  },
  rowInteractive: {
    backgroundColor: theme.colors.surface2,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  agentTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  agentTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  agentMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  timestamp: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  matchMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  matchKind: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  snippet: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  footerText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
  },
  cancelButton: {
    flex: 1,
  },
}));
