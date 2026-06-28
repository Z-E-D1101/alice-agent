import { loadActiveThreadId, loadProviders, loadSettings, loadTasks, loadThreads, saveTasks, saveThreads, uid } from "./storage";
import { runAgent } from "./agent";
import type { Thread } from "./types";

let timer: ReturnType<typeof setInterval> | null = null;

function advance(nextRun: number, intervalMs?: number, dailyAt?: string): number {
  if (intervalMs) return nextRun + intervalMs;
  if (dailyAt) {
    const [h, m] = dailyAt.split(":").map(Number);
    const d = new Date(nextRun);
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  return nextRun + 3600_000;
}

async function tick() {
  const tasks = loadTasks();
  const now = Date.now();
  let mutated = false;
  for (const t of tasks) {
    if (!t.enabled || t.nextRun > now) continue;
    mutated = true;
    t.lastRun = now;
    t.nextRun = advance(now, t.intervalMs, t.dailyAt);
    try {
      const settings = loadSettings();
      const providers = loadProviders();
      const provider = providers.find(p => p.id === settings.activeProviderId);
      if (!provider) { t.lastResult = "no active provider"; continue; }
      if (!settings.activeModel) { t.lastResult = "no model selected"; continue; }
      // Create a fresh thread for this run
      const threads = loadThreads();
      const thread: Thread = {
        id: uid(), title: `⏰ ${t.name}`, createdAt: now, updatedAt: now, messages: [],
      };
      threads.unshift(thread);
      const ac = new AbortController();
      await runAgent({
        thread, userText: t.prompt, provider, model: settings.activeModel,
        systemPrompt: settings.systemPrompt, searxngUrl: settings.searxngUrl,
        temperature: settings.temperature, maxToolSteps: settings.maxToolSteps,
        signal: ac.signal, onDelta: () => {},
      });
      saveThreads(threads);
      const last = thread.messages.filter(m => m.role === "assistant").pop();
      t.lastResult = last?.content?.slice(0, 200) ?? "done";
    } catch (e) {
      t.lastResult = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (mutated) saveTasks(tasks);
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, 5000);
}
export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

// expose for ad-hoc usage
export { loadActiveThreadId };
