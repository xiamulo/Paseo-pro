import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/stores/session-store";
import { TIMELINE_FETCH_PAGE_SIZE } from "@/timeline/timeline-fetch-policy";
import { getInitDeferred, getInitKey, resolveInitDeferred } from "@/utils/agent-initialization";
import {
  createSetAgentInitializing,
  ensureAgentIsInitialized,
  refreshAgent,
} from "./use-agent-initialization";

const serverId = "server-1";
const agentId = "agent-1";

interface FakeDaemonClient {
  fetchAgentTimeline: ReturnType<typeof vi.fn>;
  refreshAgent: ReturnType<typeof vi.fn>;
}

function makeClient(): FakeDaemonClient {
  return {
    fetchAgentTimeline: vi.fn().mockResolvedValue({
      hasOlder: false,
      startCursor: null,
    }),
    refreshAgent: vi.fn().mockResolvedValue(undefined),
  };
}

function bindSetAgentInitializing() {
  return createSetAgentInitializing(serverId, useSessionStore.getState().setInitializingAgents);
}

afterEach(() => {
  resolveInitDeferred(getInitKey(serverId, agentId));
  useSessionStore.setState({ sessions: {}, agentLastActivity: new Map() });
  vi.restoreAllMocks();
});

describe("ensureAgentIsInitialized", () => {
  it("requests bounded canonical catch-up after the current cursor when authoritative history is loaded", () => {
    const client = makeClient();
    useSessionStore.getState().initializeSession(serverId, client as never);
    useSessionStore
      .getState()
      .setAgentTimelineCursor(
        serverId,
        new Map([[agentId, { epoch: "epoch-1", startSeq: 1, endSeq: 42 }]]),
      );
    useSessionStore.getState().setAgentAuthoritativeHistoryApplied(serverId, agentId, true);

    void ensureAgentIsInitialized({
      serverId,
      agentId,
      client: client as never,
      setAgentInitializing: bindSetAgentInitializing(),
    });

    expect(client.fetchAgentTimeline).toHaveBeenCalledWith(agentId, {
      direction: "after",
      cursor: { epoch: "epoch-1", seq: 42 },
      limit: TIMELINE_FETCH_PAGE_SIZE,
      projection: "canonical",
    });
    expect(getInitDeferred(getInitKey(serverId, agentId))?.requestDirection).toBe("after");
  });

  it("requests a bounded canonical tail when no authoritative cursor is available", () => {
    const client = makeClient();
    useSessionStore.getState().initializeSession(serverId, client as never);

    void ensureAgentIsInitialized({
      serverId,
      agentId,
      client: client as never,
      setAgentInitializing: bindSetAgentInitializing(),
    });

    expect(client.fetchAgentTimeline).toHaveBeenCalledWith(agentId, {
      direction: "tail",
      limit: TIMELINE_FETCH_PAGE_SIZE,
      projection: "canonical",
    });
    expect(getInitDeferred(getInitKey(serverId, agentId))?.requestDirection).toBe("tail");
  });

  it("loads all canonical tail pages on complete-history initialization", async () => {
    const client = makeClient();
    client.fetchAgentTimeline
      .mockResolvedValueOnce({
        hasOlder: true,
        startCursor: { epoch: "epoch-1", seq: 80 },
      })
      .mockResolvedValueOnce({
        hasOlder: false,
        startCursor: { epoch: "epoch-1", seq: 40 },
      });
    useSessionStore.getState().initializeSession(serverId, client as never);

    const promise = ensureAgentIsInitialized({
      serverId,
      agentId,
      client: client as never,
      setAgentInitializing: bindSetAgentInitializing(),
      loadCompleteHistory: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(client.fetchAgentTimeline).toHaveBeenNthCalledWith(1, agentId, {
      direction: "tail",
      limit: TIMELINE_FETCH_PAGE_SIZE,
      projection: "canonical",
    });
    expect(client.fetchAgentTimeline).toHaveBeenNthCalledWith(2, agentId, {
      direction: "before",
      cursor: { epoch: "epoch-1", seq: 80 },
      limit: TIMELINE_FETCH_PAGE_SIZE,
      projection: "canonical",
    });
    expect(getInitDeferred(getInitKey(serverId, agentId))?.requestDirection).toBe("complete-tail");
    resolveInitDeferred(getInitKey(serverId, agentId));
    await promise;
  });

  it("times out initialization after 30 seconds", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    useSessionStore.getState().initializeSession(serverId, client as never);

    const promise = ensureAgentIsInitialized({
      serverId,
      agentId,
      client: client as never,
      setAgentInitializing: bindSetAgentInitializing(),
    });

    vi.advanceTimersByTime(29_999);
    expect(getInitDeferred(getInitKey(serverId, agentId))).toBeDefined();

    vi.advanceTimersByTime(1);

    await expect(promise).rejects.toThrow("History sync timed out after 30s");
    expect(getInitDeferred(getInitKey(serverId, agentId))).toBeUndefined();
    expect(useSessionStore.getState().sessions[serverId]?.initializingAgents.get(agentId)).toBe(
      false,
    );
    vi.useRealTimers();
  });
});

describe("refreshAgent", () => {
  it("fetches a bounded canonical tail after refreshing the agent", async () => {
    const client = makeClient();
    useSessionStore.getState().initializeSession(serverId, client as never);

    await refreshAgent({
      agentId,
      client: client as never,
      setAgentInitializing: bindSetAgentInitializing(),
    });

    expect(client.refreshAgent).toHaveBeenCalledWith(agentId);
    expect(client.fetchAgentTimeline).toHaveBeenCalledWith(agentId, {
      direction: "tail",
      limit: TIMELINE_FETCH_PAGE_SIZE,
      projection: "canonical",
    });
  });
});
