import { describe, expect, it } from "vitest";
import { searchAgentTimelineRows } from "./agent-search.js";
import type { AgentTimelineRow } from "./agent-timeline-store-types.js";

describe("searchAgentTimelineRows", () => {
  it("matches recent conversation text and returns snippets in newest-first order", () => {
    const rows: AgentTimelineRow[] = [
      {
        seq: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        item: { type: "user_message", text: "Please inspect the checkout state" },
      },
      {
        seq: 2,
        timestamp: "2026-01-01T00:01:00.000Z",
        item: { type: "assistant_message", text: "The checkout has a failing lint task" },
      },
      {
        seq: 3,
        timestamp: "2026-01-01T00:02:00.000Z",
        item: { type: "reasoning", text: "Need to rerun lint after formatting" },
      },
    ];

    const matches = searchAgentTimelineRows(rows, "lint", 10);

    expect(matches.map((match) => [match.kind, match.seq])).toEqual([
      ["reasoning", 3],
      ["assistant_message", 2],
    ]);
    expect(matches[0]?.snippet).toContain("rerun lint");
    expect(matches[0]).not.toHaveProperty("text");
  });

  it("requires every search term and includes tool output", () => {
    const rows: AgentTimelineRow[] = [
      {
        seq: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        item: {
          type: "tool_call",
          callId: "call-1",
          name: "exec_command",
          status: "completed",
          error: null,
          detail: {
            type: "shell",
            command: "npm run lint",
            output: "Found 0 warnings and 0 errors",
          },
        },
      },
    ];

    expect(searchAgentTimelineRows(rows, "lint errors", 10)).toMatchObject([
      {
        kind: "tool_call",
        seq: 1,
      },
    ]);
    expect(searchAgentTimelineRows(rows, "lint typecheck", 10)).toEqual([]);
  });
});
