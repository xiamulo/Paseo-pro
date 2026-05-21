import type { AgentTimelineItem } from "./agent-sdk-types.js";
import type { AgentTimelineRow } from "./agent-timeline-store-types.js";

export type AgentSearchMatchKind =
  | "user_message"
  | "assistant_message"
  | "reasoning"
  | "tool_call"
  | "todo"
  | "error";

export interface AgentTimelineSearchMatch {
  kind: AgentSearchMatchKind;
  snippet: string;
  timestamp: string;
  seq: number;
}

const SNIPPET_RADIUS = 96;

function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function buildAgentSearchTerms(query: string): string[] {
  return Array.from(new Set(query.split(/\s+/).map(normalizeSearchTerm).filter(Boolean)));
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function pushIfPresent(chunks: string[], value: string | null | undefined): void {
  if (value) {
    chunks.push(value);
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildSnippet(text: string, firstIndex: number): string {
  const start = Math.max(0, firstIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, firstIndex + SNIPPET_RADIUS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${compactText(text.slice(start, end))}${suffix}`;
}

function readToolCallDetailText(item: Extract<AgentTimelineItem, { type: "tool_call" }>): string {
  const detail = item.detail;
  const chunks: string[] = [item.name];

  switch (detail.type) {
    case "shell":
      chunks.push(detail.command);
      pushIfPresent(chunks, detail.cwd);
      pushIfPresent(chunks, detail.output);
      break;
    case "read":
      chunks.push(detail.filePath);
      pushIfPresent(chunks, detail.content);
      break;
    case "edit":
      chunks.push(detail.filePath);
      pushIfPresent(chunks, detail.oldString);
      pushIfPresent(chunks, detail.newString);
      pushIfPresent(chunks, detail.unifiedDiff);
      break;
    case "write":
      chunks.push(detail.filePath);
      pushIfPresent(chunks, detail.content);
      break;
    case "search":
      chunks.push(detail.query);
      pushIfPresent(chunks, detail.content);
      chunks.push(...(detail.filePaths ?? []));
      for (const result of detail.webResults ?? []) {
        chunks.push(result.title, result.url);
      }
      chunks.push(...(detail.annotations ?? []));
      break;
    case "fetch":
      chunks.push(detail.url);
      pushIfPresent(chunks, detail.prompt);
      pushIfPresent(chunks, detail.result);
      break;
    case "plan":
      chunks.push(detail.text);
      break;
    case "plain_text":
      pushIfPresent(chunks, detail.label);
      pushIfPresent(chunks, detail.text);
      break;
    case "sub_agent":
      pushIfPresent(chunks, detail.description);
      chunks.push(detail.log);
      for (const action of detail.actions ?? []) {
        chunks.push(action.toolName);
        pushIfPresent(chunks, action.summary);
      }
      break;
    case "unknown": {
      const input = stringFromUnknown(detail.input);
      const output = stringFromUnknown(detail.output);
      pushIfPresent(chunks, input);
      pushIfPresent(chunks, output);
      break;
    }
    default:
      break;
  }

  const error = stringFromUnknown(item.error);
  pushIfPresent(chunks, error);
  return chunks.join("\n");
}

function readTimelineText(
  item: AgentTimelineItem,
): { kind: AgentSearchMatchKind; text: string } | null {
  switch (item.type) {
    case "user_message":
    case "assistant_message":
    case "reasoning":
      return { kind: item.type, text: item.text };
    case "tool_call":
      return { kind: "tool_call", text: readToolCallDetailText(item) };
    case "todo":
      return { kind: "todo", text: item.items.map((entry) => entry.text).join("\n") };
    case "error":
      return { kind: "error", text: item.message };
    case "compaction":
      return null;
    default:
      return null;
  }
}

export function searchAgentTimelineRows(
  rows: readonly AgentTimelineRow[],
  query: string,
  limit: number,
): AgentTimelineSearchMatch[] {
  const terms = buildAgentSearchTerms(query);
  if (terms.length === 0 || limit <= 0) {
    return [];
  }

  const matches: AgentTimelineSearchMatch[] = [];
  for (let index = rows.length - 1; index >= 0 && matches.length < limit; index -= 1) {
    const row = rows[index];
    const readable = readTimelineText(row.item);
    if (!readable) {
      continue;
    }
    const text = compactText(readable.text);
    if (!text) {
      continue;
    }
    const lowerText = text.toLowerCase();
    if (!terms.every((term) => lowerText.includes(term))) {
      continue;
    }
    const firstIndex = Math.min(
      ...terms.map((term) => lowerText.indexOf(term)).filter((termIndex) => termIndex >= 0),
    );
    matches.push({
      kind: readable.kind,
      snippet: buildSnippet(text, firstIndex),
      timestamp: row.timestamp,
      seq: row.seq,
    });
  }

  return matches;
}
