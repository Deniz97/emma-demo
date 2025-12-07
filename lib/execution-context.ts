import vm from "vm";
import {
  get_apps,
  get_classes,
  get_methods,
  get_method_details,
  ask_to_methods,
  ask_to_classes,
  ask_to_apps,
} from "./meta-tools";

export type ExecutionOutput = {
  logs: string[];
  lastValue: unknown;
  error?: string;
  formattedOutput: string;
};

/**
 * Simple execution context using Node.js vm module
 * Variables persist naturally across executions
 */
export class ExecutionContext {
  private context: vm.Context;
  private currentLogs: string[] = [];
  private finishCalled: boolean = false;
  private finishResult: string[] = [];
  private metaToolsCallCount: number = 0;
  private readonly MAX_METATOOLS_CALLS = 30;
  private readonly EXECUTION_TIMEOUT_MS = 120000; // 2 minutes

  constructor() {
    // Create persistent context with META_TOOLS and custom console
    this.context = vm.createContext({
      // META_TOOLS functions (wrapped with call counting)
      get_apps: this.wrapMetaTool(get_apps),
      get_classes: this.wrapMetaTool(get_classes),
      get_methods: this.wrapMetaTool(get_methods),
      get_method_details: this.wrapMetaTool(get_method_details),
      ask_to_apps: this.wrapMetaTool(ask_to_apps),
      ask_to_classes: this.wrapMetaTool(ask_to_classes),
      ask_to_methods: this.wrapMetaTool(ask_to_methods),
      finish: async (method_slugs: string[]) => {
        this.finishCalled = true;
        this.finishResult = Array.isArray(method_slugs) ? method_slugs : [];
        this.currentLogs.push(
          `[finish] Called with ${this.finishResult.length} method slugs`
        );
        return { success: true, count: this.finishResult.length };
      },

      // Custom console for capturing output
      console: {
        log: (...args: unknown[]) => {
          this.currentLogs.push(this.formatArgs(args));
        },
        error: (...args: unknown[]) => {
          this.currentLogs.push(`ERROR: ${this.formatArgs(args)}`);
        },
        warn: (...args: unknown[]) => {
          this.currentLogs.push(`WARN: ${this.formatArgs(args)}`);
        },
        info: (...args: unknown[]) => {
          this.currentLogs.push(this.formatArgs(args));
        },
      },

      // Global scope helpers
      global: undefined, // Prevent access to Node.js globals
      process: undefined, // Prevent access to process
      require: undefined, // Prevent imports
    });

    // Make context reference itself for global assignments
    this.context.global = this.context;
  }

  /**
   * Wrap META_TOOLS functions with call counting and error handling
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wrapMetaTool<T extends (...args: any[]) => any>(
    fn: T
  ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return async (...args: Parameters<T>) => {
      this.metaToolsCallCount++;
      if (this.metaToolsCallCount > this.MAX_METATOOLS_CALLS) {
        const error = `META_TOOLS call limit exceeded (${this.MAX_METATOOLS_CALLS} calls). This usually means your code has an infinite loop.`;
        throw new Error(error);
      }
      return await fn(...args);
    };
  }

  /**
   * Format console arguments to string
   */
  private formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (typeof arg === "undefined") return "undefined";
        if (arg === null) return "null";
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");
  }

  /**
   * Check if code contains await keyword
   */
  private hasAwait(code: string): boolean {
    // Simple check for await keyword (not in strings/comments)
    // This is a heuristic - works for 99% of cases
    const withoutStrings = code.replace(/["'`].*?["'`]/g, "");
    return /\bawait\b/.test(withoutStrings);
  }

  /**
   * Extract variable names from variable declarations
   * Handles: var x = ..., let y = ..., const z = ...
   * Returns array of variable names
   */
  private extractVariableNames(code: string): string[] {
    const varPattern = /\b(var|let|const)\s+(\w+)\s*=/g;
    const matches: string[] = [];
    let match;
    while ((match = varPattern.exec(code)) !== null) {
      matches.push(match[2]);
    }
    return matches;
  }

  /**
   * Execute a single line of code
   */
  async executeLine(code: string): Promise<ExecutionOutput> {
    // Reset logs for this execution
    this.currentLogs = [];

    try {
      let executableCode = code;

      // If code contains await, wrap in async function and persist variables
      if (this.hasAwait(code)) {
        // Extract variable names that need to be persisted
        const varNames = this.extractVariableNames(code);

        // Build code that assigns variables to global context
        const assignments = varNames
          .map((name) => `global.${name} = ${name};`)
          .join(" ");

        // Wrap in async IIFE with variable persistence
        executableCode = `(async () => { ${code}; ${assignments} })()`;
      }

      // Create and execute script
      const script = new vm.Script(executableCode, {
        filename: "tool-selector-code",
        lineOffset: 0,
        columnOffset: 0,
      });

      const result = await script.runInContext(this.context, {
        timeout: this.EXECUTION_TIMEOUT_MS,
        breakOnSigint: true,
      });

      // Format output
      const formattedOutput = this.currentLogs.join("\n") || "(No output)";

      return {
        logs: this.currentLogs,
        lastValue: result,
        formattedOutput,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Add error to logs
      this.currentLogs.push(`Error: ${errorMessage}`);

      return {
        logs: this.currentLogs,
        lastValue: undefined,
        error: errorMessage,
        formattedOutput: this.currentLogs.join("\n"),
      };
    }
  }

  /**
   * Execute multiple lines of code
   */
  async executeLines(lines: string[]): Promise<ExecutionOutput[]> {
    // Reset META_TOOLS counter for this execution batch
    this.metaToolsCallCount = 0;

    const results: ExecutionOutput[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        // Skip empty lines
        continue;
      }

      const result = await this.executeLine(trimmed);
      results.push(result);

      // Continue even if there's an error (LLM can recover in next iteration)
    }

    return results;
  }

  /**
   * Check if finish() was called
   */
  isFinishCalled(): boolean {
    return this.finishCalled;
  }

  /**
   * Get the finish result (method slugs)
   */
  getFinishResult(): string[] | null {
    return this.finishCalled ? this.finishResult : null;
  }

  /**
   * Reset finish state (called at start of each iteration)
   */
  resetFinish(): void {
    this.finishCalled = false;
    this.finishResult = [];
  }

  /**
   * Get the number of META_TOOLS calls made
   */
  getMetaToolsCallCount(): number {
    return this.metaToolsCallCount;
  }

  /**
   * Get a variable from the context (for debugging)
   */
  getVariable(name: string): unknown {
    return this.context[name];
  }

  /**
   * Set a variable in the context (for testing)
   */
  setVariable(name: string, value: unknown): void {
    this.context[name] = value;
  }

  /**
   * No cleanup needed - just let GC handle it
   */
  cleanup(): void {
    // Nothing to do - no child process to kill
  }
}

