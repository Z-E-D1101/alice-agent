import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Sidebar, type SidebarPanel } from "@/components/alice/Sidebar";
import { ModelPicker } from "@/components/alice/ModelPicker";
import { SettingsDialog } from "@/components/alice/SettingsDialog";
import { Composer } from "@/components/alice/Composer";
import { MessageView } from "@/components/alice/MessageView";
import { ThinkingSpinner } from "@/components/alice/Spinner";
import { MemoryPanel, SkillsPanel, TasksPanel } from "@/components/alice/RightPanel";
import {
  loadActiveThreadId, loadMemory, loadProfile, loadProviders, loadSettings, loadSkills, loadTasks, loadThreads,
  saveActiveThreadId, saveMemory, saveProfile, saveProviders, saveSettings, saveSkills, saveTasks, saveThreads, uid,
} from "@/lib/alice/storage";
import type { AppSettings, MemoryEntry, ProviderConfig, ScheduledTask, Skill, Thread, UserProfile } from "@/lib/alice/types";
import { runAgent } from "@/lib/alice/agent";
import { parseSchedule, TOOLS } from "@/lib/alice/tools";
import { startScheduler } from "@/lib/alice/scheduler";
import { pullFromCloud, schedulePush } from "@/lib/alice/cloudSync";
import { PanelLeft, Brain, Sparkles, Clock, Plus, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Alice — your personal AI" },
      { name: "description", content: "A self-improving, multi-provider AI companion with memory, learned skills, tool use, and a scheduler. Runs in your browser." },
      { property: "og:title", content: "Alice — your personal AI" },
      { property: "og:description", content: "A self-improving, multi-provider AI companion with memory, learned skills, tool use, and a scheduler." },
    ],
  }),
  component: AlicePage,
});

function AlicePage() {
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [panel, setPanel] = useState<SidebarPanel["id"]>("chats");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); // forces re-render during streaming
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState<SidebarPanel["id"] | null>(null);

  // Hydrate — pull from cloud DB first, then read into state
  useEffect(() => {
    (async () => {
      try {
        const r = await pullFromCloud();
        if (r.source === "cloud") toast.success("Loaded from cloud");
      } catch (e) {
        console.error(e);
        toast.error("Cloud sync failed — using local cache");
      }
      const t = loadThreads();
      let aid = loadActiveThreadId();
      if (!t.find(x => x.id === aid)) aid = t[0]?.id ?? null;
      setThreads(t);
      setActiveId(aid);
      setProviders(loadProviders());
      setSettings(loadSettings());
      setMemory(loadMemory());
      setProfile(loadProfile());
      setSkills(loadSkills());
      setTasks(loadTasks());
      setHydrated(true);
      startScheduler();
    })();
  }, []);

  // Periodic refresh of side panels (memory/skills/tasks can be mutated by agent)
  useEffect(() => {
    const i = setInterval(() => {
      setMemory(loadMemory()); setSkills(loadSkills()); setTasks(loadTasks());
    }, 1500);
    return () => clearInterval(i);
  }, []);

  // Persist — write to localStorage + debounced push to cloud
  useEffect(() => { if (hydrated) { saveThreads(threads); schedulePush(); } }, [threads, hydrated]);
  useEffect(() => { if (hydrated) { saveActiveThreadId(activeId); schedulePush(); } }, [activeId, hydrated]);
  useEffect(() => { if (hydrated) { saveProviders(providers); schedulePush(); } }, [providers, hydrated]);
  useEffect(() => { if (hydrated && settings) { saveSettings(settings); schedulePush(); } }, [settings, hydrated]);
  useEffect(() => { if (hydrated) { saveMemory(memory); schedulePush(); } }, [memory, hydrated]);
  useEffect(() => { if (hydrated && profile) { saveProfile(profile); schedulePush(); } }, [profile, hydrated]);
  useEffect(() => { if (hydrated) { saveSkills(skills); schedulePush(); } }, [skills, hydrated]);
  useEffect(() => { if (hydrated) { saveTasks(tasks); schedulePush(); } }, [tasks, hydrated]);

  // Auto-scroll
  const active = useMemo(() => threads.find(t => t.id === activeId) ?? null, [threads, activeId]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, tick]);

  const newChat = useCallback(() => {
    const t: Thread = { id: uid(), title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    setThreads((cur) => [t, ...cur]);
    setActiveId(t.id);
  }, []);

  const deleteThread = (id: string) => {
    setThreads((cur) => {
      const next = cur.filter(t => t.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const onPickerChange = (providerId: string, model: string) => {
    if (!settings) return;
    setSettings({ ...settings, activeProviderId: providerId, activeModel: model });
  };
  const onPickerRefresh = (providerId: string, models: string[]) => {
    setProviders((ps) => ps.map(p => p.id === providerId ? { ...p, models } : p));
  };

  const ensureActive = (): Thread => {
    if (active) return active;
    const t: Thread = { id: uid(), title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    setThreads((cur) => [t, ...cur]);
    setActiveId(t.id);
    return t;
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!settings) return;
    const provider = providers.find(p => p.id === settings.activeProviderId);
    if (!provider) { toast.error("Pick a provider in Settings"); return; }
    if (!settings.activeModel) { toast.error("Pick a model"); return; }

    const thread = ensureActive();
    if (thread.messages.length === 0) {
      thread.title = text.slice(0, 60);
    }

    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await runAgent({
        thread, userText: text, provider, model: settings.activeModel,
        systemPrompt: settings.systemPrompt, searxngUrl: settings.searxngUrl,
        temperature: settings.temperature, maxToolSteps: settings.maxToolSteps,
        signal: ac.signal,
        onDelta: () => {
          // re-render
          setTick((n) => n + 1);
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort")) {
        const last = thread.messages[thread.messages.length - 1];
        if (last?.role === "assistant") last.content = (last.content || "") + "\n\n_…stopped._";
      } else {
        toast.error(msg);
        thread.messages.push({ id: uid(), role: "assistant", content: `**Error:** ${msg}`, createdAt: Date.now() });
      }
    } finally {
      thread.updatedAt = Date.now();
      setThreads((cur) => [...cur]); // trigger persist
      setBusy(false);
      abortRef.current = null;
    }
  }, [providers, settings]);

  const onAbort = () => { abortRef.current?.abort(); };

  if (!hydrated || !settings || !profile) {
    return <div className="grid h-screen place-items-center text-muted-foreground">Loading Alice…</div>;
  }

  const provider = providers.find(p => p.id === settings.activeProviderId);
  const ready = !!provider && !!settings.activeModel;
  const showLiveSpinner = busy && active && (() => {
    const last = active.messages[active.messages.length - 1];
    return !last || last.role === "user" || (last.role === "assistant" && !last.content && !last.toolCalls?.length);
  })();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        threads={threads}
        activeId={activeId}
        onSelect={(id) => { setActiveId(id); setPanel("chats"); setMobilePanelOpen(null); }}
        onNew={newChat}
        onDelete={deleteThread}
        panel={panel}
        onPanel={(p) => { setPanel(p); if (p !== "chats") setMobilePanelOpen(p); }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      <main className="flex flex-1 flex-col min-w-0">
        {/* Fixed header */}
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 backdrop-blur-sm px-3 py-2 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-muted-foreground hover:text-foreground p-1 -ml-1" aria-label="Open sidebar">
            <PanelLeft className="h-5 w-5" />
          </button>
          <ModelPicker
            providers={providers}
            activeProviderId={settings.activeProviderId}
            activeModel={settings.activeModel}
            onChange={onPickerChange}
            onRefresh={onPickerRefresh}
          />
          <div className="ml-auto hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <span>{TOOLS.length} tools</span>
            <span>·</span>
            <span>{skills.length} skills</span>
            <span>·</span>
            <span>{memory.length} memories</span>
          </div>
          <SettingsDialog
            settings={settings}
            providers={providers}
            profile={profile}
            onSave={(s, p, pr) => { setSettings(s); setProviders(p); setProfile(pr); saveProfile(pr); }}
          />
        </header>

        {/* Scrollable chat area */}
        <section className="flex flex-1 min-h-0">
          <div className="flex flex-1 flex-col min-w-0 max-w-full">
            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
              <div className="mx-auto max-w-3xl px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-5 min-h-full">
                {!active || active.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[calc(100vh-16rem)] text-center px-4 space-y-3">
                    <div className="text-4xl md:text-5xl">🐇</div>
                    <h1 className="text-xl md:text-2xl font-semibold">Hello, I'm Alice.</h1>
                    <p className="text-muted-foreground max-w-md text-xs md:text-sm">
                      I learn about you over time, remember our past conversations, build my own skills, and use tools to actually get things done. Ask me anything.
                    </p>
                    {!ready && (
                      <p className="text-xs text-destructive">
                        Pick a provider & model in Settings (top right) first.
                      </p>
                    )}
                  </div>
                ) : (
                  active.messages.map((m, i) => (
                    <MessageView key={m.id} msg={m} live={busy && i === active.messages.length - 1} />
                  ))
                )}
                {showLiveSpinner && <ThinkingSpinner />}
              </div>
            </div>
          </div>

          {/* Desktop right panel */}
          {(panel === "memory" || panel === "skills" || panel === "tasks") && (
            <aside className="hidden md:block w-72 md:w-80 shrink-0 border-l border-border bg-card/20 overflow-y-auto">
              {panel === "memory" && (
                <MemoryPanel entries={memory} onDelete={(id) => { const n = memory.filter(m => m.id !== id); setMemory(n); saveMemory(n); }} onClear={() => { setMemory([]); saveMemory([]); }} />
              )}
              {panel === "skills" && (
                <SkillsPanel skills={skills} onDelete={(id) => { const n = skills.filter(s => s.id !== id); setSkills(n); saveSkills(n); }} onExport={(s) => { const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `alice-skill-${s.name.replace(/\s+/g, "-")}.json`; a.click(); }} onImport={(json) => { const parsed = JSON.parse(json) as Skill; const sk: Skill = { ...parsed, id: uid(), createdAt: Date.now() }; const n = [...skills, sk]; setSkills(n); saveSkills(n); }} />
              )}
              {panel === "tasks" && (
                <TasksPanel tasks={tasks} onAdd={(name, prompt, schedule) => { const ps = parseSchedule(schedule); const t: ScheduledTask = { id: uid(), name, prompt, schedule, intervalMs: ps.intervalMs, dailyAt: ps.dailyAt, nextRun: ps.nextRun, enabled: true }; const n = [...tasks, t]; setTasks(n); saveTasks(n); toast.success("scheduled"); }} onDelete={(id) => { const n = tasks.filter(t => t.id !== id); setTasks(n); saveTasks(n); }} onToggle={(id) => { const n = tasks.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t); setTasks(n); saveTasks(n); }} onRunNow={(id) => { const n = tasks.map(t => t.id === id ? { ...t, nextRun: Date.now() } : t); setTasks(n); saveTasks(n); }} />
              )}
            </aside>
          )}
        </section>

        {/* Fixed composer */}
        <div className="shrink-0">
          <Composer onSend={sendMessage} onAbort={onAbort} busy={busy} disabled={!ready} />
        </div>

        {/* Mobile bottom sheet for memory/skills/tasks */}
        {mobilePanelOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobilePanelOpen(null)} />
            <div className="relative max-h-[70vh] rounded-t-2xl bg-card border border-border overflow-y-auto shadow-2xl animate-in slide-in-from-bottom">
              <div className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold capitalize">{mobilePanelOpen}</h2>
                <button onClick={() => setMobilePanelOpen(null)} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-3">
                {mobilePanelOpen === "memory" && (
                  <MemoryPanel entries={memory} onDelete={(id) => { const n = memory.filter(m => m.id !== id); setMemory(n); saveMemory(n); }} onClear={() => { setMemory([]); saveMemory([]); }} />
                )}
                {mobilePanelOpen === "skills" && (
                  <SkillsPanel skills={skills} onDelete={(id) => { const n = skills.filter(s => s.id !== id); setSkills(n); saveSkills(n); }} onExport={(s) => { const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `alice-skill-${s.name.replace(/\s+/g, "-")}.json`; a.click(); }} onImport={(json) => { const parsed = JSON.parse(json) as Skill; const sk: Skill = { ...parsed, id: uid(), createdAt: Date.now() }; const n = [...skills, sk]; setSkills(n); saveSkills(n); }} />
                )}
                {mobilePanelOpen === "tasks" && (
                  <TasksPanel tasks={tasks} onAdd={(name, prompt, schedule) => { const ps = parseSchedule(schedule); const t: ScheduledTask = { id: uid(), name, prompt, schedule, intervalMs: ps.intervalMs, dailyAt: ps.dailyAt, nextRun: ps.nextRun, enabled: true }; const n = [...tasks, t]; setTasks(n); saveTasks(n); toast.success("scheduled"); }} onDelete={(id) => { const n = tasks.filter(t => t.id !== id); setTasks(n); saveTasks(n); }} onToggle={(id) => { const n = tasks.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t); setTasks(n); saveTasks(n); }} onRunNow={(id) => { const n = tasks.map(t => t.id === id ? { ...t, nextRun: Date.now() } : t); setTasks(n); saveTasks(n); }} />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-md pb-safe">
        <div className="flex items-center justify-around py-1.5">
          <MobileNavBtn icon={<MessageSquare className="h-5 w-5" />} label="Chats" active={panel === "chats" && !mobilePanelOpen} onClick={() => { setPanel("chats"); setMobilePanelOpen(null); }} />
          <MobileNavBtn icon={<Brain className="h-5 w-5" />} label="Memory" active={mobilePanelOpen === "memory"} onClick={() => { setPanel("memory"); setMobilePanelOpen("memory"); }} />
          <MobileNavBtn icon={<Plus className="h-5 w-5" />} label="New" active={false} onClick={newChat} highlight />
          <MobileNavBtn icon={<Sparkles className="h-5 w-5" />} label="Skills" active={mobilePanelOpen === "skills"} onClick={() => { setPanel("skills"); setMobilePanelOpen("skills"); }} />
          <MobileNavBtn icon={<Clock className="h-5 w-5" />} label="Tasks" active={mobilePanelOpen === "tasks"} onClick={() => { setPanel("tasks"); setMobilePanelOpen("tasks"); }} />
        </div>
      </nav>

      <Toaster theme="dark" position="top-center" />
    </div>
  );
}

function MobileNavBtn({ icon, label, active, onClick, highlight }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition-colors rounded-md min-w-[56px]",
        highlight
          ? "text-primary"
          : active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
      )}
    >
      <div className={cn(highlight && "rounded-full bg-primary/20 p-1.5 -mt-1")}>
        {icon}
      </div>
      <span>{label}</span>
    </button>
  );
}
