import { useState } from "react";
import { Check, ChevronsUpDown, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProviderConfig } from "@/lib/alice/types";
import { discoverModels } from "@/lib/alice/agent";
import { toast } from "sonner";

export function ModelPicker({
  providers, activeProviderId, activeModel, onChange, onRefresh,
}: {
  providers: ProviderConfig[];
  activeProviderId: string;
  activeModel: string;
  onChange: (providerId: string, model: string) => void;
  onRefresh: (providerId: string, models: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const refresh = async (p: ProviderConfig) => {
    setLoading(p.id);
    try {
      const m = await discoverModels(p.baseUrl, p.apiKey);
      onRefresh(p.id, m);
      toast.success(`${p.name}: ${m.length} models`);
    } catch (e) {
      toast.error(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLoading(null); }
  };

  const activeProvider = providers.find(p => p.id === activeProviderId);
  const label = activeModel
    ? `${activeProvider?.name ?? activeProviderId} · ${activeModel}`
    : "Choose model";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-9 justify-between gap-2 min-w-[260px]">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No models. Refresh a provider.</CommandEmpty>
            {providers.map((p) => (
              <CommandGroup
                key={p.id}
                heading={
                  <div className="flex items-center justify-between gap-2 pr-1">
                    <span>{p.name}</span>
                    <button
                      onClick={(e) => { e.preventDefault(); void refresh(p); }}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      title="Discover models from /v1/models"
                    >
                      <RefreshCw className={cn("h-3 w-3", loading === p.id && "animate-spin")} /> refresh
                    </button>
                  </div>
                }
              >
                {p.models.length === 0 && (
                  <CommandItem disabled className="text-xs text-muted-foreground">
                    no models — click refresh
                  </CommandItem>
                )}
                {p.models.map((m) => {
                  const active = p.id === activeProviderId && m === activeModel;
                  return (
                    <CommandItem
                      key={`${p.id}:${m}`}
                      value={`${p.name} ${m}`}
                      onSelect={() => { onChange(p.id, m); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", active ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{m}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
