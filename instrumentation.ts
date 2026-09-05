/** Runs once when a server instance starts. Next calls `register()` on its
 *  own — nothing imports this file.
 *
 *  The Node-only code lives in ./instrumentation-node and is pulled in by a
 *  conditional dynamic import, which is what Next's own instrumentation
 *  guide prescribes (node_modules/next/dist/docs/01-app/02-guides/
 *  instrumentation.md, "Importing runtime-specific code"). `register()` is
 *  called in EVERY runtime, so a top-level `process.on` here makes the
 *  build warn that a Node API is unsupported on the edge — a runtime
 *  `if` does not help, because the bundler reads the file statically. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
