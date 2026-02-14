import { vi } from "vitest";

let capturedOnMount: ((...args: unknown[]) => void) | null = null;
let capturedDiffOnMount: ((...args: unknown[]) => void) | null = null;

export function getCapturedOnMount() {
  return capturedOnMount;
}

export function getCapturedDiffOnMount() {
  return capturedDiffOnMount;
}

export function resetCapturedMounts() {
  capturedOnMount = null;
  capturedDiffOnMount = null;
}

vi.mock("@monaco-editor/react", () => ({
  default: vi.fn(
    ({
      value,
      onChange,
      onMount,
    }: {
      value?: string;
      onChange?: (value: string) => void;
      onMount?: (...args: unknown[]) => void;
    }) => {
      capturedOnMount = onMount ?? null;
      return (
        <div data-testid="monaco-editor">
          <textarea
            data-testid="monaco-textarea"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
          />
        </div>
      );
    },
  ),
  DiffEditor: vi.fn(
    ({ onMount }: { onMount?: (...args: unknown[]) => void }) => {
      capturedDiffOnMount = onMount ?? null;
      return <div data-testid="diff-editor" />;
    },
  ),
}));
