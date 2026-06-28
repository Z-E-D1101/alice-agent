import { supabase } from "@/integrations/supabase/client";
import {
  loadMemory, loadProfile, loadProviders, loadSettings, loadSkills,
  loadTasks, loadThreads, loadActiveThreadId, loadVFS,
  saveMemory, saveProfile, saveProviders, saveSettings, saveSkills,
  saveTasks, saveThreads, saveActiveThreadId, saveVFS,
} from "./storage";

const ROW_ID = "default";

interface CloudBlob {
  memory?: ReturnType<typeof loadMemory>;
  profile?: ReturnType<typeof loadProfile>;
  providers?: ReturnType<typeof loadProviders>;
  settings?: ReturnType<typeof loadSettings>;
  skills?: ReturnType<typeof loadSkills>;
  tasks?: ReturnType<typeof loadTasks>;
  threads?: ReturnType<typeof loadThreads>;
  activeThreadId?: string | null;
  vfs?: ReturnType<typeof loadVFS>;
}

function snapshot(): CloudBlob {
  return {
    memory: loadMemory(),
    profile: loadProfile(),
    providers: loadProviders(),
    settings: loadSettings(),
    skills: loadSkills(),
    tasks: loadTasks(),
    threads: loadThreads(),
    activeThreadId: loadActiveThreadId(),
    vfs: loadVFS(),
  };
}

function applyBlob(b: CloudBlob) {
  if (b.memory) saveMemory(b.memory);
  if (b.profile) saveProfile(b.profile);
  if (b.providers) saveProviders(b.providers);
  if (b.settings) saveSettings(b.settings);
  if (b.skills) saveSkills(b.skills);
  if (b.tasks) saveTasks(b.tasks);
  if (b.threads) saveThreads(b.threads);
  if (b.activeThreadId !== undefined) saveActiveThreadId(b.activeThreadId);
  if (b.vfs) saveVFS(b.vfs);
}

/** Pulls cloud state into localStorage. If cloud is empty, seeds it with whatever's local. */
export async function pullFromCloud(): Promise<{ source: "cloud" | "local-seed" }> {
  const { data, error } = await supabase
    .from("app_state")
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;

  const cloud = (data?.data ?? {}) as CloudBlob;
  const hasCloud = Object.keys(cloud).length > 0 &&
    ((cloud.threads?.length ?? 0) > 0 ||
     (cloud.memory?.length ?? 0) > 0 ||
     (cloud.skills?.length ?? 0) > 0 ||
     (cloud.tasks?.length ?? 0) > 0 ||
     !!cloud.profile?.name ||
     !!cloud.settings);

  if (hasCloud) {
    applyBlob(cloud);
    return { source: "cloud" };
  }
  // Seed cloud with current local state
  await pushToCloud();
  return { source: "local-seed" };
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushAt = 0;

export function schedulePush(debounceMs = 800) {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pendingTimer = null; void pushToCloud(); }, debounceMs);
}

export async function pushToCloud() {
  const blob = snapshot();
  lastPushAt = Date.now();
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: ROW_ID, data: blob as never, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) console.error("[cloudSync] push failed", error);
}

export function lastPush() { return lastPushAt; }
