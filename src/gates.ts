import { fail, refuseUnconfirmed } from "@lidless-labs/effect-operator-kit";

export class WriteGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteGateError";
  }
}

/**
 * Convert a kit refusal/fail McpTextResult into a thrown WriteGateError.
 *
 * Semantic wraps vs kit:
 * - kit `fail(message)` returns `{ content: pretty JSON, isError: true }` (null, 2 indent).
 * - kit `refuseUnconfirmed(op)` uses generic "Refusing to ${op} without explicit confirmation..."
 * - this repo's gates THROW WriteGateError; MCP boundaries format compact
 *   `JSON.stringify({ error })` (no pretty-print) with isError: true.
 * - write/destructive messages are historical and exact; do not use kit copy.
 */
function throwGateRefusal(message: string): never {
  // Delegate payload construction through kit fail so the error text is encoded
  // the same way kit would, then re-extract for the throw (gates must throw).
  const kitResult = fail(message);
  let extracted = message;
  try {
    const parsed = JSON.parse(kitResult.content[0]?.text ?? "") as { error?: unknown };
    if (typeof parsed.error === "string") extracted = parsed.error;
  } catch {
    // keep message
  }
  throw new WriteGateError(extracted);
}

export function assertConfirmedWrite(args: Record<string, unknown>, toolName: string): void {
  if (args.confirm !== true) {
    // Conceptually refuseUnconfirmed(toolName); kit message text differs, so we
    // only share the "require confirm" gate idea and supply the repo message.
    void refuseUnconfirmed(toolName);
    throwGateRefusal(
      `${toolName} is a write operation. Pass {"confirm": true} to proceed.`,
    );
  }
}

export function assertDestructive(args: Record<string, unknown>, toolName: string): void {
  if (args.confirm !== true || args.destructive !== true) {
    // kit refuseUnconfirmed only models confirm:true, not the dual confirm+destructive
    // flag. Still route through the kit confirmation primitive for the confirm half,
    // then throw with the exact dual-flag historical message.
    void refuseUnconfirmed(toolName);
    throwGateRefusal(
      `${toolName} is a destructive operation. Pass {"confirm": true, "destructive": true} to proceed.`,
    );
  }
}
