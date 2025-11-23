import { ReplSession } from "./ReplSession";
import {
  get_apps,
  get_classes,
  get_methods,
  get_method_details,
  ask_to_methods,
  ask_to_classes,
  ask_to_apps,
} from "../meta-tools";
import { MetaToolsContext } from "@/types/tool-selector";

/**
 * Creates a new REPL session with META_TOOLS injected
 */
export function createReplSession(): ReplSession {
  const META_TOOLS: MetaToolsContext = {
    get_apps,
    get_classes,
    get_methods,
    get_method_details,
    ask_to_methods,
    ask_to_classes,
    ask_to_apps,
    finish: async (method_slugs: string[]) => {
      // This is handled specially by ReplSession via IPC
      // The actual logic stores the slugs and terminates the tool selection loop
      return { success: true, count: method_slugs.length };
    },
  };

  return new ReplSession(META_TOOLS);
}
