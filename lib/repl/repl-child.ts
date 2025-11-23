#!/usr/bin/env node
/**
 * REPL Child Process Entry Point
 *
 * This script runs as a child process, starting a Node.js REPL server
 * and injecting META_TOOLS stubs that communicate with the parent process via IPC.
 */

import * as repl from "repl";
import {
  IPCMessage,
  ToolRequestMessage,
  ToolResponseMessage,
  generateMessageId,
  deserializeError,
  IPC_TIMEOUT_MS,
} from "./ipc-protocol";

// Store pending requests waiting for responses from parent
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const pendingRequests = new Map<string, PendingRequest>();

/**
 * Send a message to the parent process
 */
function sendToParent(message: IPCMessage): void {
  if (process.send) {
    process.send(message);
  } else {
    console.error("[repl-child] Error: process.send is not available");
  }
}

/**
 * Wait for a response from the parent process
 */
function waitForResponse(messageId: string): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    // Set timeout
    const timeout = setTimeout(() => {
      pendingRequests.delete(messageId);
      reject(new Error(`Tool call timeout after ${IPC_TIMEOUT_MS}ms`));
    }, IPC_TIMEOUT_MS);

    // Store the promise handlers
    pendingRequests.set(messageId, { resolve, reject, timeout });
  });
}

/**
 * Create a stub function for a META_TOOL that communicates with parent
 */
function createToolStub(
  toolName: string
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    const messageId = generateMessageId();

    // Send request to parent
    const request: ToolRequestMessage = {
      type: "tool_request",
      id: messageId,
      tool: toolName,
      args,
    };
    sendToParent(request);

    // Wait for response
    return await waitForResponse(messageId);
  };
}

/**
 * Handle messages from parent process
 */
process.on("message", (message: unknown) => {
  if (!message || typeof message !== "object") {
    return;
  }

  // Type guard for message object
  const msg = message as { type?: string };

  // Handle tool responses
  if (msg.type === "tool_response") {
    const response = message as ToolResponseMessage;
    const pending = pendingRequests.get(response.id);

    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(deserializeError(response.error));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  // Handle ping
  if (msg.type === "ping") {
    sendToParent({ type: "pong" });
  }
});

/**
 * Inject META_TOOLS as global stubs
 */
function injectMetaTools(context: Record<string, unknown>): void {
  const toolNames = [
    "get_apps",
    "get_classes",
    "get_methods",
    "get_method_details",
    "ask_to_methods",
    "ask_to_classes",
    "ask_to_apps",
    "finish",
  ];

  for (const toolName of toolNames) {
    context[toolName] = createToolStub(toolName);
  }
}

/**
 * Start the REPL server
 *
 * Uses Node.js default REPL which natively supports:
 * - Top-level await (since Node.js 16)
 * - Variable persistence with useGlobal: true
 * - Multi-line statements
 * - Incomplete statement detection
 *
 * NO custom eval needed - just instruct LLM to use `var` for declarations!
 */
function startRepl(): void {
  const replServer = repl.start({
    prompt: "",
    useColors: false,
    useGlobal: true, // Variables with 'var' persist automatically
    // No custom eval - using Node.js default!
  });

  // Inject META_TOOLS into REPL context
  injectMetaTools(replServer.context);

  // Notify parent that we're ready
  sendToParent({ type: "ready" });

  // Handle REPL errors
  replServer.on("error", (err) => {
    console.error("[repl-child] REPL error:", err);
  });

  // Handle exit
  replServer.on("exit", () => {
    process.exit(0);
  });
}

// Start the REPL when this script is executed
if (require.main === module) {
  startRepl();
}

export { startRepl, injectMetaTools };
