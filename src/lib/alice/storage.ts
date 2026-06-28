import type { AppSettings, MemoryEntry, ProviderConfig, ScheduledTask, Skill, Thread, UserProfile } from "./types";

const K = {
  threads: "alice.threads",
  activeThread: "alice.activeThread",
  providers: "alice.providers",
  settings: "alice.settings",
  memory: "alice.memory",
  profile: "alice.profile",
  skills: "alice.skills",
  tasks: "alice.tasks",
  vfs: "alice.vfs",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

// Threads
export const loadThreads = () => read<Thread[]>(K.threads, []);
export const saveThreads = (t: Thread[]) => write(K.threads, t);
export const loadActiveThreadId = () => read<string | null>(K.activeThread, null);
export const saveActiveThreadId = (id: string | null) => write(K.activeThread, id);

// Providers
const defaultProviders = (): ProviderConfig[] => [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"], builtin: true },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-001"], builtin: true },
  { id: "anthropic", name: "Anthropic (via OpenRouter recommended)", baseUrl: "https://api.anthropic.com/v1", apiKey: "", models: ["claude-3-5-sonnet-latest"], builtin: true },
  { id: "9router", name: "9router", baseUrl: "http://localhost:20128/v1", apiKey: "dummy", models: [], builtin: true },
];

export const loadProviders = (): ProviderConfig[] => {
  const stored = read<ProviderConfig[] | null>(K.providers, null);
  if (!stored || stored.length === 0) {
    const d = defaultProviders();
    write(K.providers, d);
    return d;
  }
  // ensure builtin presets exist
  const ids = new Set(stored.map((p) => p.id));
  for (const p of defaultProviders()) if (!ids.has(p.id)) stored.push(p);
  return stored;
};
export const saveProviders = (p: ProviderConfig[]) => write(K.providers, p);

// Settings
export const loadSettings = (): AppSettings => {
  const s = read<AppSettings | null>(K.settings, null);
  if (s) return s;
  const init: AppSettings = {
    activeProviderId: "9router",
    activeModel: "",
    systemPrompt: `You are Alice — a personal, self-improving AI companion who learns about the user over time.
You have access to the real filesystem, a real shell (run_shell/terminal), web search via SearXNG, persistent memory, code execution (Python/Node.js), reusable skills you can create, and a scheduler.
Use tools whenever they help. You can run any shell command, read/write files on the actual filesystem, execute code, and more.
Always think step-by-step. When the user teaches you something or asks you to remember, call the remember tool. After completing a non-trivial multi-step task, consider calling save_skill so you can reuse the workflow later.
Be warm, concise, and curious.`,
    searxngUrl: "http://localhost:8080",
    temperature: 0.7,
    maxToolSteps: 25,
  };
  write(K.settings, init);
  return init;
};
export const saveSettings = (s: AppSettings) => write(K.settings, s);

// Memory & profile
export const loadMemory = () => read<MemoryEntry[]>(K.memory, []);
export const saveMemory = (m: MemoryEntry[]) => write(K.memory, m);
export const loadProfile = (): UserProfile =>
  read<UserProfile>(K.profile, { name: "", about: "", preferences: "", updatedAt: Date.now() });
export const saveProfile = (p: UserProfile) => write(K.profile, p);

// Skills
export const loadSkills = () => read<Skill[]>(K.skills, []);
export const saveSkills = (s: Skill[]) => write(K.skills, s);

// Tasks
export const loadTasks = () => read<ScheduledTask[]>(K.tasks, []);
export const saveTasks = (t: ScheduledTask[]) => write(K.tasks, t);

// VFS
export interface VFSEntry { path: string; content: string; updatedAt: number }
export const loadVFS = () => read<Record<string, VFSEntry>>(K.vfs, {});
export const saveVFS = (v: Record<string, VFSEntry>) => write(K.vfs, v);
