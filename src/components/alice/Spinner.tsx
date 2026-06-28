import { useEffect, useState } from "react";

const SPINNER_FRAMES = ["◜", "◠", "◝", "◞", "◟", "◡", "◜"];
const FACES = ["(｡•́︿•̀｡)", "(⊙_⊙)", "(ᵕ̣ᵕ̣)", "(˚ᵕ˚)", "(｡◕‿◕｡)"];

const HINTS = [
  "thinking",
  "musing",
  "ruminating",
  "weaving thoughts",
  "consulting memory",
  "hunting in the rabbit hole",
  "polishing the answer",
];

export function ThinkingSpinner({ label }: { label?: string }) {
  const [frame, setFrame] = useState(0);
  const [face, setFace] = useState(0);
  const [hint, setHint] = useState(0);

  useEffect(() => {
    const a = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 120);
    const b = setInterval(() => setFace((f) => (f + 1) % FACES.length), 1400);
    const c = setInterval(() => setHint((h) => (h + 1) % HINTS.length), 2400);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm font-mono text-thinking alice-pulse">
      <span className="text-base">{SPINNER_FRAMES[frame]}</span>
      <span>{FACES[face]}</span>
      <span className="text-muted-foreground">{label ?? HINTS[hint]}…</span>
    </div>
  );
}
