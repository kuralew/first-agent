import "dotenv/config";
import * as readline from "node:readline";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "./agent.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const history: Anthropic.MessageParam[] = [];

function prompt(): void {
  rl.question("You: ", async (input) => {
    const text = input.trim();

    if (!text) {
      prompt();
      return;
    }

    if (text.toLowerCase() === "exit") {
      console.log("Goodbye!");
      rl.close();
      return;
    }

    history.push({ role: "user", content: text });

    try {
      const reply = await runAgent(history);
      console.log(`\nClaude: ${reply}\n`);
    } catch (err) {
      console.error("Error:", err);
    }

    prompt();
  });
}

console.log('Agent ready. Type "exit" to quit.\n');
prompt();
