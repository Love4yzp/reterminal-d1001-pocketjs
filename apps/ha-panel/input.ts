export type InputEvent =
  | { source: "keyboard"; key: string }
  | { source: "button"; button: string };

export type InputIntent =
  | { type: "focus-next" | "focus-previous" | "activate" | "details" | "back" | "page-next" | "page-previous" };

export type FocusTarget =
  | { kind: "light" | "sensor" | "scene"; id: string }
  | { kind: "back"; id: "back" };

/** Front-end seam for a future keyboard/button driver or a host preview mock. */
export interface InputSource {
  subscribe(listener: (event: InputEvent) => void): () => void;
}

export interface InputDisplayState {
  available: boolean;
  source: "none" | "keyboard" | "button" | "touch";
  lastAction: string;
}

export function createInputDisplayState(available = false): InputDisplayState {
  return { available, source: "none", lastAction: available ? "等待输入" : "待接入" };
}

export function readInputSource(): InputSource | undefined {
  return (globalThis as typeof globalThis & { __haPanelInput?: InputSource }).__haPanelInput;
}

export function inputIntent(event: InputEvent): InputIntent | null {
  if (event.source === "button") {
    switch (event.button) {
      case "next": return { type: "focus-next" };
      case "previous": return { type: "focus-previous" };
      case "activate": return { type: "activate" };
      case "details": return { type: "details" };
      case "back": return { type: "back" };
      case "page-next": return { type: "page-next" };
      case "page-previous": return { type: "page-previous" };
      default: return null;
    }
  }
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown": return { type: "focus-next" };
    case "ArrowLeft":
    case "ArrowUp": return { type: "focus-previous" };
    case "Enter":
    case " ": return { type: "activate" };
    case "d":
    case "D": return { type: "details" };
    case "Escape": return { type: "back" };
    case "PageDown": return { type: "page-next" };
    case "PageUp": return { type: "page-previous" };
    default: return null;
  }
}

export function focusKey(target: FocusTarget | null): string {
  return target ? `${target.kind}:${target.id}` : "";
}

export function sameFocus(left: FocusTarget | null, right: FocusTarget | null): boolean {
  return focusKey(left) === focusKey(right);
}

export function moveFocus(
  targets: readonly FocusTarget[],
  current: FocusTarget | null,
  direction: -1 | 1,
): FocusTarget | null {
  if (targets.length === 0) return null;
  const index = targets.findIndex(target => sameFocus(target, current));
  if (index < 0) return targets[direction > 0 ? 0 : targets.length - 1]!;
  return targets[(index + direction + targets.length) % targets.length]!;
}
