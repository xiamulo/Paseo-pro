import { describe, expect, test } from "vitest";
import {
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
  WSHelloMessageSchema,
  parseServerInfoStatusPayload,
} from "./messages.js";
import { CLIENT_CAPS } from "./client-capabilities.js";

describe("agent input queue messages", () => {
  test("parses queue RPC requests and responses", () => {
    const enqueue = SessionInboundMessageSchema.parse({
      type: "agent.input_queue.enqueue.request",
      requestId: "req-1",
      agentId: "agent-1",
      text: "next prompt",
      clientState: [{ kind: "client-only" }],
    });

    expect(enqueue.type).toBe("agent.input_queue.enqueue.request");
    expect(enqueue.attachments).toEqual([]);
    expect(enqueue.images).toEqual([]);

    const updateRequest = SessionInboundMessageSchema.parse({
      type: "agent.input_queue.update.request",
      requestId: "req-2",
      agentId: "agent-1",
      queueItemId: "queue-1",
      text: "edited prompt",
    });

    expect(updateRequest.type).toBe("agent.input_queue.update.request");
    expect(updateRequest.attachments).toBeUndefined();

    const update = SessionOutboundMessageSchema.parse({
      type: "agent.input_queue.update",
      payload: {
        agentId: "agent-1",
        items: [
          {
            id: "queue-1",
            agentId: "agent-1",
            text: "next prompt",
            images: [],
            attachments: [],
            createdAt: "2026-05-30T00:00:00.000Z",
            updatedAt: "2026-05-30T00:00:00.000Z",
          },
        ],
      },
    });

    expect(update.payload.items[0]?.text).toBe("next prompt");
  });

  test("advertises queue capability through hello and server_info", () => {
    const hello = WSHelloMessageSchema.parse({
      type: "hello",
      clientId: "client-1",
      clientType: "mobile",
      protocolVersion: 1,
      capabilities: {
        [CLIENT_CAPS.agentInputQueue]: true,
      },
    });

    expect(hello.capabilities?.[CLIENT_CAPS.agentInputQueue]).toBe(true);

    const serverInfo = parseServerInfoStatusPayload({
      status: "server_info",
      serverId: "server-1",
      features: {
        agentInputQueue: true,
      },
    });

    expect(serverInfo?.features?.agentInputQueue).toBe(true);
  });
});
