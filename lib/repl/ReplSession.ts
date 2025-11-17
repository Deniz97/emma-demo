import * as vm from "vm";
import { MetaToolsContext } from "@/types/tool-selector";
import { inspect } from "util";

export type ReplOutput = {
  logs: string[];
  lastValue: any;
  error?: string;
  formattedOutput: string; // Combined output like a real REPL
};

/**
 * ReplSession provides a persistent Node.js REPL-like execution context
 * that maintains state across multiple code executions.
 */
export class ReplSession {
  private context: vm.Context;
  private logs: string[];

  constructor(tools: MetaToolsContext) {
    this.logs = [];

    // Create context with META_TOOLS and custom console
    const contextObject = {
      ...tools,
      console: this.createConsole(),
      // Add common globals that would be available in Node REPL
      require,
      process,
      Buffer,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      // Make Promise available for async/await
      Promise,
    };

    this.context = vm.createContext(contextObject);
    console.log("[ReplSession] Created new REPL session with injected tools");
  }

  /**
   * Creates a custom console object that captures output
   */
  private createConsole() {
    return {
      log: (...args: any[]) => {
        const message = args
          .map((arg) =>
            typeof arg === "object" ? inspect(arg, { depth: 3, colors: false }) : String(arg)
          )
          .join(" ");
        this.logs.push(message);
      },
      error: (...args: any[]) => {
        const message = args
          .map((arg) =>
            typeof arg === "object" ? inspect(arg, { depth: 3, colors: false }) : String(arg)
          )
          .join(" ");
        this.logs.push(`ERROR: ${message}`);
      },
      warn: (...args: any[]) => {
        const message = args
          .map((arg) =>
            typeof arg === "object" ? inspect(arg, { depth: 3, colors: false }) : String(arg)
          )
          .join(" ");
        this.logs.push(`WARN: ${message}`);
      },
      info: (...args: any[]) => {
        const message = args
          .map((arg) =>
            typeof arg === "object" ? inspect(arg, { depth: 3, colors: false }) : String(arg)
          )
          .join(" ");
        this.logs.push(`INFO: ${message}`);
      },
    };
  }

  /**
   * Executes a single line of code in the persistent REPL context
   */
  async runLine(code: string): Promise<ReplOutput> {
    const startLogs = [...this.logs];
    this.logs = []; // Clear logs for this execution

    try {
      // Wrap code to support top-level await
      const wrappedCode = `
        (async () => {
          return ${code};
        })()
      `;

      const script = new vm.Script(wrappedCode, {
        filename: "repl",
      });

      // Execute with timeout to prevent infinite loops
      const result = await script.runInContext(this.context, {
        timeout: 5000, // 5 second timeout
        breakOnSigint: true,
      });

      // Format output like a real REPL
      const formattedOutput = this.formatReplOutput(code, result, this.logs);

      return {
        logs: this.logs,
        lastValue: result,
        formattedOutput,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Format error output like a real REPL
      const formattedOutput = this.formatReplError(code, errorMessage, this.logs);

      return {
        logs: this.logs,
        lastValue: undefined,
        error: errorMessage,
        formattedOutput,
      };
    }
  }

  /**
   * Executes multiple lines sequentially, maintaining state between them
   */
  async runLines(lines: string[]): Promise<ReplOutput[]> {
    const results: ReplOutput[] = [];

    for (const line of lines) {
      const result = await this.runLine(line);
      results.push(result);
      // Continue even if there's an error
    }

    return results;
  }

  /**
   * Formats successful output like a real Node.js REPL
   */
  private formatReplOutput(
    code: string,
    result: any,
    logs: string[]
  ): string {
    let output = `> ${code}\n`;

    // Add console logs if any
    if (logs.length > 0) {
      output += logs.join("\n") + "\n";
    }

    // Add result value (like REPL shows return value)
    if (result !== undefined) {
      const formattedResult =
        typeof result === "object"
          ? inspect(result, { depth: 3, colors: false })
          : String(result);
      output += formattedResult;
    }

    return output;
  }

  /**
   * Formats error output like a real Node.js REPL
   */
  private formatReplError(
    code: string,
    error: string,
    logs: string[]
  ): string {
    let output = `> ${code}\n`;

    // Add console logs if any
    if (logs.length > 0) {
      output += logs.join("\n") + "\n";
    }

    // Add error
    output += `Error: ${error}`;

    return output;
  }

  /**
   * Gets the current context (for debugging)
   */
  getContext(): vm.Context {
    return this.context;
  }
}

