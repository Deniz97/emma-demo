#!/usr/bin/env node
/**
 * REPL Child Process Entry Point
 * 
 * This script runs as a child process, starting a Node.js REPL server
 * and injecting META_TOOLS stubs that communicate with the parent process via IPC.
 */

import * as repl from 'repl';
import {
  IPCMessage,
  ToolRequestMessage,
  ToolResponseMessage,
  generateMessageId,
  deserializeError,
  IPC_TIMEOUT_MS,
} from './ipc-protocol';

// Store pending requests waiting for responses from parent
const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

/**
 * Send a message to the parent process
 */
function sendToParent(message: IPCMessage): void {
  if (process.send) {
    process.send(message);
  } else {
    console.error('[repl-child] Error: process.send is not available');
  }
}

/**
 * Wait for a response from the parent process
 */
function waitForResponse(messageId: string): Promise<any> {
  return new Promise((resolve, reject) => {
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
function createToolStub(toolName: string): (...args: any[]) => Promise<any> {
  return async (...args: any[]) => {
    const messageId = generateMessageId();
    
    // Send request to parent
    const request: ToolRequestMessage = {
      type: 'tool_request',
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
process.on('message', (message: any) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  // Handle tool responses
  if (message.type === 'tool_response') {
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
  if (message.type === 'ping') {
    sendToParent({ type: 'pong' });
  }
});

/**
 * Inject META_TOOLS as global stubs
 */
function injectMetaTools(context: any): void {
  const toolNames = [
    'get_apps',
    'get_classes',
    'get_methods',
    'get_method_details',
    'ask_to_methods',
    'ask_to_classes',
    'ask_to_apps',
    'finish',
  ];

  for (const toolName of toolNames) {
    context[toolName] = createToolStub(toolName);
  }
}

/**
 * Start the REPL server
 */
function startRepl(): void {
  const replServer = repl.start({
    prompt: '',
    useColors: false,
    useGlobal: true,
    breakEvalOnSigint: true,
  });

  // Inject META_TOOLS into REPL context
  injectMetaTools(replServer.context);

  // Notify parent that we're ready
  sendToParent({ type: 'ready' });

  // Handle REPL errors
  replServer.on('error', (err) => {
    console.error('[repl-child] REPL error:', err);
  });

  // Handle exit
  replServer.on('exit', () => {
    process.exit(0);
  });
}

// Start the REPL when this script is executed
if (require.main === module) {
  startRepl();
}

export { startRepl, injectMetaTools };

