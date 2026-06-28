import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Download, Upload, Play, Pause } from "lucide-react";
import type { MemoryEntry, ScheduledTask, Skill } from "@/lib/alice/types";
import { toast } from "sonner";

export function MemoryPanel({ entries, onDelete, onClear }: {
  entries: MemoryEntry[]; onDelete: (id: string) => void; onClear: () => void;
}) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Long-term memory</h3>
        {entries.length > 0 && <Button size="sm" variant="ghost" onClick={onClear}>Clear all</Button>}
      </div>
      {entries.length === 0 && <p className="text-xs text-muted-foreground">Empty. Alice will save things here via the <code>remember</code> tool.</p>}
      <div className="space-y-1.5">
        {entries.slice().reverse().map((m) => (
          <div key={m.id} className="rounded-md border border-border p-2 text-xs group">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-primary">{m.key}</div>
              <button onClick={() => onDelete(m.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="text-foreground/80 whitespace-pre-wrap break-words">{m.value}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkillsPanel({ skills, onDelete, onExport, onImport }: {
  skills: Skill[];
  onDelete: (id: string) => void;
  onExport: (s: Skill) => void;
  onImport: (json: string) => void;
}) {
  const [importing, setImporting] = useState(false);
  const [json, setJson] = useState("");
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Learned skills</h3>
        <Button size="sm" variant="ghost" onClick={() => setImporting((v) => !v)}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Import
        </Button>
      </div>
      {importing && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <Textarea rows={5} placeholder='{"name":"…","description":"…","trigger":"…","steps":"…"}' value={json} onChange={(e) => setJson(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { try { onImport(json); setJson(""); setImporting(false); toast.success("imported"); } catch (e) { toast.error(e instanceof Error ? e.message : "bad json"); } }}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setImporting(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {skills.length === 0 && <p className="text-xs text-muted-foreground">No skills yet. Ask Alice to save one after completing a task.</p>}
      <div className="space-y-1.5">
        {skills.map((s) => (
          <div key={s.id} className="rounded-md border border-border p-2 text-xs space-y-1 group">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-primary">{s.name}</div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => onExport(s)} className="text-muted-foreground hover:text-foreground" title="Download"><Download className="h-3 w-3" /></button>
                <button onClick={() => onDelete(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="text-foreground/80">{s.description}</div>
            <div className="text-[10px] text-muted-foreground">when: {s.trigger}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TasksPanel({ tasks, onAdd, onDelete, onToggle, onRunNow }: {
  tasks: ScheduledTask[];
  onAdd: (name: string, prompt: string, schedule: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onRunNow: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("every 60m");
  return (
    <div className="p-3 space-y-2">
      <h3 className="text-sm font-semibold">Scheduled tasks</h3>
      <div className="space-y-2 rounded-md border border-border p-2">
        <Input placeholder="task name" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea rows={2} placeholder="What should Alice do?" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <Input placeholder="schedule (every 60m, daily 09:00)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        <Button size="sm" className="w-full" disabled={!name || !prompt} onClick={() => { onAdd(name, prompt, schedule); setName(""); setPrompt(""); }}>
          Schedule
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Scheduler runs only while this tab is open.</p>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.id} className="rounded-md border border-border p-2 text-xs space-y-1 group">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-primary">{t.name}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => onRunNow(t.id)} className="text-muted-foreground hover:text-foreground" title="Run now"><Play className="h-3 w-3" /></button>
                <button onClick={() => onToggle(t.id)} className="text-muted-foreground hover:text-foreground" title={t.enabled ? "Pause" : "Enable"}><Pause className="h-3 w-3" /></button>
                <button onClick={() => onDelete(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="text-foreground/80 line-clamp-2">{t.prompt}</div>
            <div className="text-[10px] text-muted-foreground">
              {t.schedule} · next {new Date(t.nextRun).toLocaleString()} {t.enabled ? "" : "(paused)"}
            </div>
            {t.lastResult && <div className="text-[10px] text-muted-foreground italic line-clamp-1">last: {t.lastResult}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
