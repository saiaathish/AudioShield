import type { P0SoundId } from "./types";

const LABELS: ReadonlyArray<readonly [P0SoundId, string[]]> = [
  ["alarm-siren", ["alarm", "siren", "civil defense siren", "警報"]],
  ["dishes-clatter", ["dishes", "cutlery", "clatter", "glass", "silverware"]],
  ["applause", ["applause", "clapping", "crowd applause"]],
  ["protected-speech", ["speech", "conversation", "human speech", "speaking"]],
];

export function normalizeLabel(label: string): { classId: P0SoundId; label: string } | undefined {
  const normalized = label.trim().toLocaleLowerCase();
  const match = LABELS.find(([, aliases]) => aliases.some((alias) => normalized === alias || normalized.includes(alias)));
  return match ? { classId: match[0], label: match[0] } : undefined;
}
