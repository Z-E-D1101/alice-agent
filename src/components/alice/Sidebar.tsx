import { MessageSquarePlus, MessageSquare, Trash2, Brain, Sparkles, Clock, X, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Thread } from "@/lib/alice/types";
import { useEffect } from "react";

export interface SidebarPanel { id: "chats" | "memory" | "skills" | "tasks"; }

export function Sidebar({
  threads, activeId, onSelect, onNew, onDelete, panel, onPanel, mobileOpen, onMobileClose,
}: {
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  panel: SidebarPanel["id"];
  onPanel: (p: SidebarPanel["id"]) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onMobileClose?.(); };
    if (mobileOpen) { document.addEventListener("keydown", handler); return () => document.removeEventListener("keydown", handler); }
  }, [mobileOpen, onMobileClose]);

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 px-3 py-3 border-b border-sidebar-border">
        <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">A</div>
        <div className="font-semibold tracking-tight">Alice</div>
        {/* Close button for mobile drawer */}
        <button onClick={onMobileClose} className="ml-auto md:hidden text-muted-foreground hover:text-foreground p-1">
          <X className="h-5 w-5" />
        </button>
        {/* Desktop toggle */}
        <button onClick={onMobileClose} className="ml-auto hidden md:block text-muted-foreground hover:text-foreground p-1" title="Close sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1 p-2 border-b border-sidebar-border">
        <PanelBtn icon={<MessageSquare className="h-4 w-4" />} label="Chats" active={panel === "chats"} onClick={() => { onPanel("chats"); onMobileClose?.(); }} />
        <PanelBtn icon={<Brain className="h-4 w-4" />} label="Memory" active={panel === "memory"} onClick={() => onPanel("memory")} />
        <PanelBtn icon={<Sparkles className="h-4 w-4" />} label="Skills" active={panel === "skills"} onClick={() => onPanel("skills")} />
        <PanelBtn icon={<Clock className="h-4 w-4" />} label="Tasks" active={panel === "tasks"} onClick={() => onPanel("tasks")} />
      </div>
      {panel === "chats" && (
        <>
          <div className="p-2">
            <Button onClick={() => { onNew(); onMobileClose?.(); }} className="w-full justify-start gap-2" variant="outline">
              <MessageSquarePlus className="h-4 w-4" /> New chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {threads.length === 0 && <div className="text-xs text-muted-foreground px-2 py-3">No chats yet.</div>}
            {threads.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-sidebar-accent",
                  activeId === t.id && "bg-sidebar-accent",
                )}
                onClick={() => { onSelect(t.id); onMobileClose?.(); }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate flex-1">{t.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
          {/* Drawer */}
          <aside className="relative w-80 max-w-[85vw] h-full flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl animate-in slide-in-from-left">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

function PanelBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
      )}
    >
      {icon}<span>{label}</span>
    </button>
  );
}
