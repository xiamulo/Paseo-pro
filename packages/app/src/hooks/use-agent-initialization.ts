import { useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import type { DaemonClient } from "@server/client/daemon-client";
import {
  attachInitTimeout,
  createInitDeferred,
  getInitDeferred,
  getInitKey,
  rejectInitDeferred,
} from "@/utils/agent-initialization";
import { TIMELINE_FETCH_PAGE_SIZE } from "@/timeline/timeline-fetch-policy";

const INIT_TIMEOUT_MS = 30_000;
const COMPLETE_HISTORY_INIT_TIMEOUT_MS = 120_000;

interface EnsureAgentInitializedOptions {
  loadCompleteHistory?: boolean;
}

async function fetchCompleteCanonicalTail(args: {
  client: DaemonClient;
  agentId: string;
}): Promise<void> {
  const { client, agentId } = args;
  let payload = await client.fetchAgentTimeline(agentId, {
    direction: "tail",
    limit: TIMELINE_FETCH_PAGE_SIZE,
    projection: "canonical",
  });

  while (payload.hasOlder) {
    if (!payload.startCursor) {
      throw new Error("Unable to continue loading agent history: missing timeline cursor");
    }

    payload = await client.fetchAgentTimeline(agentId, {
      direction: "before",
      cursor: payload.startCursor,
      limit: TIMELINE_FETCH_PAGE_SIZE,
      projection: "canonical",
    });
  }
}

export function useAgentInitialization({
  serverId,
  client,
}: {
  serverId: string;
  client: DaemonClient | null;
}) {
  const setInitializingAgents = useSessionStore((state) => state.setInitializingAgents);
  const setAgentInitializing = useCallback(
    (agentId: string, initializing: boolean) => {
      setInitializingAgents(serverId, (prev) => {
        if (prev.get(agentId) === initializing) {
          return prev;
        }
        const next = new Map(prev);
        next.set(agentId, initializing);
        return next;
      });
    },
    [serverId, setInitializingAgents],
  );

  const ensureAgentIsInitialized = useCallback(
    (agentId: string, options: EnsureAgentInitializedOptions = {}): Promise<void> => {
      const key = getInitKey(serverId, agentId);
      const existing = getInitDeferred(key);
      if (existing) {
        return existing.promise;
      }

      const session = useSessionStore.getState().sessions[serverId];
      const cursor = session?.agentTimelineCursor.get(agentId);
      const hasAuthoritativeHistory =
        session?.agentAuthoritativeHistoryApplied.get(agentId) === true;
      const timelineRequest =
        hasAuthoritativeHistory && cursor
          ? {
              direction: "after" as const,
              cursor: { epoch: cursor.epoch, seq: cursor.endSeq },
              limit: TIMELINE_FETCH_PAGE_SIZE,
              projection: "canonical" as const,
            }
          : {
              direction: "tail" as const,
              limit: TIMELINE_FETCH_PAGE_SIZE,
              projection: "canonical" as const,
            };
      const shouldLoadCompleteHistory =
        options.loadCompleteHistory && timelineRequest.direction === "tail";

      const deferred = createInitDeferred(
        key,
        shouldLoadCompleteHistory ? "complete-tail" : timelineRequest.direction,
      );
      const initTimeoutMs = shouldLoadCompleteHistory
        ? COMPLETE_HISTORY_INIT_TIMEOUT_MS
        : INIT_TIMEOUT_MS;
      const timeoutId = setTimeout(() => {
        setAgentInitializing(agentId, false);
        rejectInitDeferred(
          key,
          new Error(`History sync timed out after ${Math.round(initTimeoutMs / 1000)}s`),
        );
      }, initTimeoutMs);
      attachInitTimeout(key, timeoutId);

      setAgentInitializing(agentId, true);

      if (!client) {
        setAgentInitializing(agentId, false);
        rejectInitDeferred(key, new Error("Host is not connected"));
        return deferred.promise;
      }

      const fetch = shouldLoadCompleteHistory
        ? fetchCompleteCanonicalTail({ client, agentId })
        : client.fetchAgentTimeline(agentId, timelineRequest);

      fetch.catch((error) => {
        setAgentInitializing(agentId, false);
        rejectInitDeferred(key, error instanceof Error ? error : new Error(String(error)));
      });

      return deferred.promise;
    },
    [client, serverId, setAgentInitializing],
  );

  const refreshAgent = useCallback(
    async (agentId: string) => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      setAgentInitializing(agentId, true);

      try {
        await client.refreshAgent(agentId);
        await client.fetchAgentTimeline(agentId, {
          direction: "tail",
          limit: TIMELINE_FETCH_PAGE_SIZE,
          projection: "canonical",
        });
      } catch (error) {
        setAgentInitializing(agentId, false);
        throw error;
      }
    },
    [client, setAgentInitializing],
  );

  return { ensureAgentIsInitialized, refreshAgent };
}
