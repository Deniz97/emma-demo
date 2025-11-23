import { selectTools } from "../lib/tool-selector";
import { config } from "dotenv";

config();

async function test() {
  console.log("🧪 Testing tool selection with Ethereum query...\n");

  const result = await selectTools(
    "What is the current price of Ethereum and its market cap?",
    [],
    10
  );

  console.log("\n📊 Tool Selection Result:");
  console.log("Tools found:", result.tools.length);
  console.log("Reasoning:", result.reasoning);

  if (result.debugData?.executionHistory) {
    console.log("\n🔍 Execution History:");
    result.debugData.executionHistory.forEach((item) => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Step ${item.step}:`);
      console.log("─".repeat(60));
      console.log("Code Lines:");
      item.lines.forEach((line, idx) => {
        console.log(`  ${idx + 1}. ${line}`);
      });
      console.log("\nThought:");
      if (item.thought.reasoning) {
        console.log(`  Reasoning: ${item.thought.reasoning}`);
      }

      if (item.finishMethodSlugs !== undefined) {
        console.log(`\nFinish() Called:`);
        console.log(`  Method Slugs (${item.finishMethodSlugs.length}):`);
        if (item.finishMethodSlugs.length > 0) {
          item.finishMethodSlugs.forEach((slug) => {
            console.log(`    - ${slug}`);
          });
        } else {
          console.log(`    (empty array - conversational query)`);
        }
      }

      if (item.result.outputs && item.result.outputs.length > 0) {
        console.log("\nOutputs:");
        item.result.outputs.forEach((output, idx) => {
          console.log(`\n  Output ${idx + 1}:`);
          console.log("  " + output.formattedOutput.split("\n").join("\n  "));
        });
      }
    });
    console.log(`\n${"=".repeat(60)}`);
  }

  console.log("\n✅ Test completed");
}

test().catch(console.error);
