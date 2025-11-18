import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { MetaToolsContext } from '@/types/tool-selector';
import {
  ToolRequestMessage,
  ToolResponseMessage,
  FinishRequestMessage,
  serializeError,
  isValidMessage,
  IPC_TIMEOUT_MS,
} from './ipc-protocol';

export type ReplOutput = {
  logs: string[];
  lastValue: unknown;
  error?: string;
  formattedOutput: string; // Combined output like a real REPL
};

/**
 * ReplSession provides a persistent Node.js REPL execution context
 * by spawning a real Node.js child process and communicating via IPC.
 */
export class ReplSession {
  private childProcess: ChildProcess;
  private metaTools: MetaToolsContext;
  private outputBuffer: string = '';
  private isReady: boolean = false;
  private readyPromise: Promise<void>;
  private finishResult: { methodSlugs: string[] } | null = null;

  constructor(tools: MetaToolsContext) {
    this.metaTools = tools;
    
    // Spawn the child REPL process
    const projectRoot = process.cwd();
    const childScriptPath = join(projectRoot, 'lib/repl/repl-child.ts');
    const tsxBinary = join(projectRoot, 'node_modules/.bin/tsx');
    this.childProcess = spawn(tsxBinary, [childScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // Setup IPC message handler
    this.childProcess.on('message', (message: unknown) => {
      this.handleChildMessage(message);
    });

    // Capture stdout
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.outputBuffer += text;
    });

    // Capture stderr (only log errors)
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('Error') || text.includes('error')) {
        console.error('[ReplSession]', text.trim());
      }
    });

    // Handle process errors
    this.childProcess.on('error', (error) => {
      console.error('[ReplSession] Process error:', error.message);
    });

    // Wait for ready signal
    this.readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('REPL child process failed to start within timeout'));
      }, 10000);

      const messageHandler = (msg: unknown) => {
        if (msg && typeof msg === 'object' && 'type' in msg && msg.type === 'ready') {
          clearTimeout(timeout);
          this.isReady = true;
          resolve();
        }
      };

      this.childProcess.on('message', messageHandler);
    });
  }

  /**
   * Handle messages from the child process
   */
  private handleChildMessage(message: unknown): void {
    if (!isValidMessage(message)) {
      console.warn('[ReplSession] Invalid message from child:', message);
      return;
    }

    // Handle finish requests (special case)
    if (message.type === 'finish_request') {
      this.handleFinishRequest(message as FinishRequestMessage);
      return;
    }

    // Handle tool requests
    if (message.type === 'tool_request') {
      this.handleToolRequest(message as ToolRequestMessage);
    }
  }

  /**
   * Handle a finish request from the child process
   */
  private handleFinishRequest(request: FinishRequestMessage): void {
    // Store the method slugs
    this.finishResult = { methodSlugs: request.method_slugs };
    
    // Send success response back to child (so REPL doesn't error)
    const response: ToolResponseMessage = {
      type: 'tool_response',
      id: request.id,
      result: { success: true },
    };

    this.childProcess.send(response);
  }

  /**
   * Handle a tool execution request from the child process
   */
  private async handleToolRequest(request: ToolRequestMessage): Promise<void> {
    // Special handling for 'finish' tool - treat it as finish request
    if (request.tool === 'finish') {
      const methodSlugs = Array.isArray(request.args[0]) ? request.args[0] : [];
      this.finishResult = { methodSlugs };
      
      // Send success response back to child
      const response: ToolResponseMessage = {
        type: 'tool_response',
        id: request.id,
        result: { success: true },
      };

      this.childProcess.send(response);
      return;
    }

    try {
      const toolFn = this.metaTools[request.tool as keyof MetaToolsContext];
      
      if (!toolFn) {
        throw new Error(`Tool not found: ${request.tool}`);
      }

      // Execute the tool
      const result = await (toolFn as (...args: unknown[]) => Promise<unknown>)(...request.args);

      // Send response back to child
      const response: ToolResponseMessage = {
        type: 'tool_response',
        id: request.id,
        result,
      };

      this.childProcess.send(response);
    } catch (error) {
      // Send error back to child
      const response: ToolResponseMessage = {
        type: 'tool_response',
        id: request.id,
        error: serializeError(error),
      };

      this.childProcess.send(response);
    }
  }

  /**
   * Wait for the REPL to be ready
   */
  private async ensureReady(): Promise<void> {
    if (!this.isReady) {
      await this.readyPromise;
    }
  }

  /**
   * Get the finish result if finish() was called
   */
  getFinishResult(): string[] | null {
    return this.finishResult?.methodSlugs || null;
  }

  /**
   * Reset finish result (called at start of each runLines call)
   */
  private resetFinishResult(): void {
    this.finishResult = null;
  }

  /**
   * Executes a single line of code in the persistent REPL context
   */
  async runLine(code: string): Promise<ReplOutput> {
    await this.ensureReady();

    // Clear output buffer
    this.outputBuffer = '';

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        reject(new Error(`Code execution timeout after ${IPC_TIMEOUT_MS}ms`));
      }, IPC_TIMEOUT_MS);

      // Send code to REPL
      this.childProcess.stdin?.write(code + '\n');

      // Wait for output (heuristic: wait for a short delay after data stops)
      let outputTimeout: NodeJS.Timeout;
      const dataHandler = () => {
        clearTimeout(outputTimeout);
        outputTimeout = setTimeout(() => {
          clearTimeout(timeout);
          this.childProcess.stdout?.removeListener('data', dataHandler);
          
          // Parse the output
          const output = this.parseOutput(code, this.outputBuffer);
          resolve(output);
        }, 100); // Wait 100ms after last data chunk
      };

      this.childProcess.stdout?.on('data', dataHandler);
    });
  }

  /**
   * Parse REPL output into structured format
   */
  private parseOutput(code: string, rawOutput: string): ReplOutput {
    const lines = rawOutput.split('\n');
    const logs: string[] = [];
    const lastValue: unknown = undefined;
    let error: string | undefined = undefined;

    // Try to detect errors
    if (rawOutput.includes('Error:') || rawOutput.includes('Uncaught')) {
      error = rawOutput.trim();
    }

    // Extract console logs and result
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip empty lines, REPL prompts, ellipsis, and standalone "undefined"
      if (!trimmedLine || 
          trimmedLine === 'undefined' || 
          line.includes('>') || 
          line.includes('...')) {
        continue;
      }
      
      // Only add non-error output
      if (!error) {
        logs.push(trimmedLine);
      }
    }

    // Format output - filter out standalone undefined lines
    const filteredLines = rawOutput
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && trimmed !== 'undefined';
      })
      .join('\n');
    
    const formattedOutput = filteredLines || `> ${code}`;

    return {
      logs,
      lastValue,
      error,
      formattedOutput,
    };
  }

  /**
   * Executes multiple lines sequentially, maintaining state between them
   */
  async runLines(lines: string[]): Promise<ReplOutput[]> {
    // Reset finish result at start of execution
    this.resetFinishResult();
    
    const results: ReplOutput[] = [];

    for (const line of lines) {
      const result = await this.runLine(line);
      results.push(result);
      // Continue even if there's an error
    }

    return results;
  }

  /**
   * Clean up the child process
   */
  cleanup(): void {
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (!this.childProcess.killed) {
          this.childProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Gets the child process (for debugging)
   */
  getProcess(): ChildProcess {
    return this.childProcess;
  }
}
