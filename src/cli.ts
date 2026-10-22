#!/usr/bin/env node
import { installCrashHandlers, wantsJson } from "./json";
import { type CancelSignal, processRunner, run } from "./run";

const argv = process.argv.slice(2);
// A crash is JSON too: stdout carries one document whatever happens.
if (wantsJson(argv)) {
  const command = argv.find((arg) => arg !== "--json");
  installCrashHandlers(
    command === "completion" || command === "codemod"
      ? `create-shadow-app ${command}`
      : "create-shadow-app",
  );
}
const code = await run(argv, {
  cwd: process.cwd(),
  env: process.env,
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  runner: processRunner,
  // A run listens only while it works, so Ctrl-C and `kill` stop it cleanly, removing what it wrote.
  signals: {
    on: (name: CancelSignal, listener: () => void) => process.on(name, listener),
    off: (name: CancelSignal, listener: () => void) => process.off(name, listener),
  },
  version: __VERSION__,
});
process.exitCode = code;
