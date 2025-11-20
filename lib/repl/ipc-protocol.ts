/**
 * IPC Protocol for REPL Parent-Child Communication
 * 
 * This module defines the message types and utilities for communication
 * between the parent process (ReplSession) and the child Node.js REPL process.
 */

// Message Types

export type ToolRequestMessage = {
  type: 'tool_request';
  id: string;
  tool: string;
  args: any[];
};

export type ToolResponseMessage = {
  type: 'tool_response';
  id: string;
  result?: any;
  error?: string;
};

export type HeartbeatMessage = {
  type: 'ping' | 'pong';
};

export type ReadyMessage = {
  type: 'ready';
};

export type FinishRequestMessage = {
  type: 'finish_request';
  id: string;
  method_slugs: string[];
};

export type IPCMessage = 
  | ToolRequestMessage 
  | ToolResponseMessage 
  | HeartbeatMessage
  | ReadyMessage
  | FinishRequestMessage;

// Constants

export const IPC_TIMEOUT_MS = 2*120000; // 120 seconds (2 minutes)
export const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds

// Utilities

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Serialize an error for IPC transmission
 */
export function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }
  return String(error);
}

/**
 * Deserialize an error from IPC transmission
 */
export function deserializeError(errorString: string): Error {
  try {
    const parsed = JSON.parse(errorString);
    const error = new Error(parsed.message);
    error.name = parsed.name;
    error.stack = parsed.stack;
    return error;
  } catch {
    return new Error(errorString);
  }
}

/**
 * Create a promise that rejects after a timeout
 */
export function createTimeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
}

/**
 * Validate that a message is a valid IPC message
 */
export function isValidMessage(msg: any): msg is IPCMessage {
  if (!msg || typeof msg !== 'object') {
    return false;
  }
  
  const validTypes = ['tool_request', 'tool_response', 'ping', 'pong', 'ready', 'finish_request'];
  return validTypes.includes(msg.type);
}

