import { useCallback, useMemo } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useSessionStore } from "@/stores/session-store";
import {
  attachInitTimeout,
  createInitDeferred,
  getInitDeferred,
  getInitKey,
  rejectInitDeferred,
} from "@/utils/agent-initialization";
import {
  planInitialAgentTimelineSync,
  planTimelineOlderFetch,
  planTimelineTailFetch,
} from "@/timeline/timeline-sync-plan";

export const INIT_TIMEOUT_MS = 30_000;
export const COMPLETE_HISTORY_INIT_TIMEOUT_MS = 120_000;

export type SetAgentInitializing = (agentId: string, initializing: boolean) => void;

export interface EnsureAgentIsInitializedInput {
  serverId: string;
  agentId: string;
  client: Pick<DaemonClient, "fetchAgentTimeline"> | null;
  setAgentInitializing: SetAgentInitializing;
  loadCompleteHistory?: boolean;
}

export function ensureAgentIsInitialized(input: EnsureAgentIsInitializedInput): Promise<void> {
  const { serverId, agentId, client, setAgentInitializing, loadCompleteHistory = false } = input;
  const key = getInitKey(serverId, agentId);
  const existing = getInitDeferred(key);
  if (existing) {
    return existing.promise;
  }

  const session = useSessionStore.getState().sessions[serverId];
  const cursor = session?.agentTimelineCursor.get(agentId);
  const hasAuthoritativeHistory = session?.agentAuthoritativeHistoryApplied.get(agentId) === true;
  const timelineRequest = planInitialAgentTimelineSync({ cursor, hasAuthoritativeHistory });
  const shouldLoadCompleteHistory = loadCompleteHistory && timelineRequest.direction === "tail";

  const deferred = createInitDeferred(
    key,
    shouldLoadCompleteHistory ? "complete-tail" : timelineRequest.direction,
  );
  const timeoutMs = shouldLoadCompleteHistory ? COMPLETE_HISTORY_INIT_TIMEOUT_MS : INIT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    setAgentInitializing(agentId, false);
    rejectInitDeferred(
      key,
      new Error(`History sync timed out after ${Math.round(timeoutMs / 1000)}s`),
    );
  }, timeoutMs);
  attachInitTimeout(key, timeoutId);

  setAgentInitializing(agentId, true);

  if (!client) {
    setAgentInitializing(agentId, false);
    rejectInitDeferred(key, new Error("Host is not connected"));
    return deferred.promise;
  }

  const fetchPromise = shouldLoadCompleteHistory
    ? fetchCompleteCanonicalTail({ client, agentId })
    : client.fetchAgentTimeline(agentId, timelineRequest);

  fetchPromise.catch((error) => {
    setAgentInitializing(agentId, false);
    rejectInitDeferred(key, error instanceof Error ? error : new Error(String(error)));
  });

  return deferred.promise;
}

async function fetchCompleteCanonicalTail(input: {
  client: Pick<DaemonClient, "fetchAgentTimeline">;
  agentId: string;
}): Promise<void> {
  let payload = await input.client.fetchAgentTimeline(input.agentId, planTimelineTailFetch());

  while (payload.hasOlder) {
    if (!payload.startCursor) {
      throw new Error("Unable to continue loading agent history: missing timeline cursor");
    }

    payload = await input.client.fetchAgentTimeline(
      input.agentId,
      planTimelineOlderFetch(payload.startCursor),
    );
  }
}

export interface EnsureAgentInitializedOptions {
  loadCompleteHistory?: boolean;
}

export interface RefreshAgentInput {
  agentId: string;
  client: Pick<DaemonClient, "refreshAgent" | "fetchAgentTimeline"> | null;
  setAgentInitializing: SetAgentInitializing;
}

export async function refreshAgent(input: RefreshAgentInput): Promise<void> {
  const { agentId, client, setAgentInitializing } = input;
  if (!client) {
    throw new Error("Host is not connected");
  }
  setAgentInitializing(agentId, true);

  try {
    await client.refreshAgent(agentId);
    await client.fetchAgentTimeline(agentId, planTimelineTailFetch());
  } catch (error) {
    setAgentInitializing(agentId, false);
    throw error;
  }
}

export function createSetAgentInitializing(
  serverId: string,
  setInitializingAgents: ReturnType<typeof useSessionStore.getState>["setInitializingAgents"],
): SetAgentInitializing {
  return (agentId, initializing) => {
    setInitializingAgents(serverId, (prev) => {
      if (prev.get(agentId) === initializing) {
        return prev;
      }
      const next = new Map(prev);
      next.set(agentId, initializing);
      return next;
    });
  };
}

export function useAgentInitialization({
  serverId,
  client,
}: {
  serverId: string;
  client: DaemonClient | null;
}) {
  const setInitializingAgents = useSessionStore((state) => state.setInitializingAgents);
  const setAgentInitializing = useMemo(
    () => createSetAgentInitializing(serverId, setInitializingAgents),
    [serverId, setInitializingAgents],
  );

  const ensureAgentIsInitializedCallback = useCallback(
    (agentId: string, options: EnsureAgentInitializedOptions = {}): Promise<void> =>
      ensureAgentIsInitialized({
        serverId,
        agentId,
        client,
        setAgentInitializing,
        loadCompleteHistory: options.loadCompleteHistory,
      }),
    [client, serverId, setAgentInitializing],
  );

  const refreshAgentCallback = useCallback(
    (agentId: string): Promise<void> => refreshAgent({ agentId, client, setAgentInitializing }),
    [client, setAgentInitializing],
  );

  return {
    ensureAgentIsInitialized: ensureAgentIsInitializedCallback,
    refreshAgent: refreshAgentCallback,
  };
}
