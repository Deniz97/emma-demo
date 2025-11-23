import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { MetaToolsContext } from "@/types/tool-selector";
import {
  ToolRequestMessage,
  ToolResponseMessage,
  FinishRequestMessage,
  serializeError,
  isValidMessage,
  IPC_TIMEOUT_MS,
  MAX_METATOOLS_CALLS_PER_EXECUTION,
} from "./ipc-protocol";

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
  private outputBuffer: string = "";
  private isReady: boolean = false;
  private readyPromise: Promise<void>;
  private finishResult: { methodSlugs: string[] } | null = null;
  private metaToolsCallCount: number = 0;

  constructor(tools: MetaToolsContext) {
    this.metaTools = tools;

    // Spawn the child REPL process
    const projectRoot = process.cwd();
    const childScriptPath = join(projectRoot, "lib/repl/repl-child.ts");
    const tsxBinary = join(projectRoot, "node_modules/.bin/tsx");
    this.childProcess = spawn(tsxBinary, [childScriptPath], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    // Setup IPC message handler
    this.childProcess.on("message", (message: unknown) => {
      this.handleChildMessage(message);
    });

    // Capture stdout
    this.childProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      this.outputBuffer += text;
    });

    // Capture stderr (only log errors)
    this.childProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.includes("Error") || text.includes("error")) {
        console.error("[ReplSession]", text.trim());
      }
    });

    // Handle process errors
    this.childProcess.on("error", (error) => {
      console.error("[ReplSession] Process error:", error.message);
    });

    // Wait for ready signal
    this.readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("REPL child process failed to start within timeout"));
      }, 10000);

      const messageHandler = (msg: unknown) => {
        if (
          msg &&
          typeof msg === "object" &&
          "type" in msg &&
          msg.type === "ready"
        ) {
          clearTimeout(timeout);
          this.isReady = true;
          resolve();
        }
      };

      this.childProcess.on("message", messageHandler);
    });
  }

  /**
   * Handle messages from the child process
   */
  private handleChildMessage(message: unknown): void {
    if (!isValidMessage(message)) {
      console.warn("[ReplSession] Invalid message from child:", message);
      return;
    }

    // Handle finish requests (special case)
    if (message.type === "finish_request") {
      this.handleFinishRequest(message as FinishRequestMessage);
      return;
    }

    // Handle tool requests
    if (message.type === "tool_request") {
      this.handleToolRequest(message as ToolRequestMessage);
    }
  }

  /**
   * Handle a finish request from the child process
   */
  private handleFinishRequest(request: FinishRequestMessage): void {
    // Store the method slugs
    this.finishResult = { methodSlugs: request.method_slugs };
    console.log(
      `[ReplSession] finish() called with ${request.method_slugs.length} method slugs`
    );

    // Send success response back to child (so REPL doesn't error)
    const response: ToolResponseMessage = {
      type: "tool_response",
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
    if (request.tool === "finish") {
      const methodSlugs = Array.isArray(request.args[0]) ? request.args[0] : [];
      this.finishResult = { methodSlugs };
      console.log(
        `[ReplSession] finish() called (via tool_request) with ${methodSlugs.length} method slugs`
      );

      // Send success response back to child
      const response: ToolResponseMessage = {
        type: "tool_response",
        id: request.id,
        result: { success: true },
      };

      this.childProcess.send(response);
      return;
    }

    // Increment META_TOOLS call counter and check limit (prevent infinite loops)
    this.metaToolsCallCount++;
    if (this.metaToolsCallCount > MAX_METATOOLS_CALLS_PER_EXECUTION) {
      const errorMsg = `META_TOOLS call limit exceeded (${MAX_METATOOLS_CALLS_PER_EXECUTION} calls). This usually means your code has an infinite loop. Add a break condition or call finish().`;
      console.error(`[ReplSession] ${errorMsg}`);

      // Send error back to child
      const response: ToolResponseMessage = {
        type: "tool_response",
        id: request.id,
        error: errorMsg,
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
      const result = await (toolFn as (...args: unknown[]) => Promise<unknown>)(
        ...request.args
      );

      // Send response back to child
      const response: ToolResponseMessage = {
        type: "tool_response",
        id: request.id,
        result,
      };

      this.childProcess.send(response);
    } catch (error) {
      // Send error back to child
      const response: ToolResponseMessage = {
        type: "tool_response",
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
    const result = this.finishResult?.methodSlugs || null;
    console.log(
      `[ReplSession] getFinishResult() called, returning:`,
      result ? `${result.length} slugs` : "null"
    );
    return result;
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
    this.outputBuffer = "";

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        reject(new Error(`Code execution timeout after ${IPC_TIMEOUT_MS}ms`));
      }, IPC_TIMEOUT_MS);

      // Send code to REPL
      this.childProcess.stdin?.write(code + "\n");

      // Wait for output (heuristic: wait for a short delay after data stops)
      let outputTimeout: NodeJS.Timeout;
      const dataHandler = () => {
        clearTimeout(outputTimeout);
        outputTimeout = setTimeout(() => {
          clearTimeout(timeout);
          this.childProcess.stdout?.removeListener("data", dataHandler);

          // Parse the output
          const output = this.parseOutput(code, this.outputBuffer);
          resolve(output);
        }, 100); // Wait 100ms after last data chunk
      };

      this.childProcess.stdout?.on("data", dataHandler);
    });
  }

  /**
   * Parse REPL output into structured format
   */
  private parseOutput(code: string, rawOutput: string): ReplOutput {
    const lines = rawOutput.split("\n");
    const logs: string[] = [];
    const lastValue: unknown = undefined;
    let error: string | undefined = undefined;

    // Try to detect errors
    if (rawOutput.includes("Error:") || rawOutput.includes("Uncaught")) {
      error = rawOutput.trim();
    }

    // Extract console logs and result
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip empty lines, REPL prompts, ellipsis, and standalone "undefined"
      if (
        !trimmedLine ||
        trimmedLine === "undefined" ||
        line.includes(">") ||
        line.includes("...")
      ) {
        continue;
      }

      // Only add non-error output
      if (!error) {
        logs.push(trimmedLine);
      }
    }

    // Format output - filter out echoed code lines (lines starting with '>' or containing the code itself)
    // Only keep actual output (console.log, return values, errors)
    const filteredLines = rawOutput
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        // Skip empty lines
        if (!trimmed) return false;
        // Skip standalone "undefined"
        if (trimmed === "undefined") return false;
        // Skip REPL prompt lines (lines starting with '>' or '...')
        if (trimmed.startsWith(">") || trimmed.startsWith("...")) return false;
        // Keep error lines
        if (trimmed.includes("Error") || trimmed.includes("Uncaught"))
          return true;
        // Keep everything else (console.log output, return values)
        return true;
      })
      .join("\n");

    // If no output after filtering, return a minimal placeholder
    const formattedOutput = filteredLines || "(No output)";

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
    // Note: We do NOT reset finish result here anymore
    // The finish result should persist across iterations so the main loop can detect it

    // Reset META_TOOLS call counter at the start of each execution
    this.metaToolsCallCount = 0;
    console.log(
      `[ReplSession] Starting new execution, META_TOOLS counter reset to 0`
    );

    // If we have multiple lines, combine them as a single statement
    // Join with semicolons to ensure REPL treats it as one evaluation
    if (lines.length > 1) {
      const combinedCode = lines.join("; ");
      const result = await this.runLine(combinedCode);
      console.log(
        `[ReplSession] Execution complete: ${this.metaToolsCallCount} META_TOOLS calls made`
      );
      return [result];
    }

    // Single line - execute normally
    const results: ReplOutput[] = [];
    for (const line of lines) {
      const result = await this.runLine(line);
      results.push(result);
      // Continue even if there's an error
    }

    console.log(
      `[ReplSession] Execution complete: ${this.metaToolsCallCount} META_TOOLS calls made`
    );
    return results;
  }

  /**
   * Clean up the child process
   */
  cleanup(): void {
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (!this.childProcess.killed) {
          this.childProcess.kill("SIGKILL");
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
