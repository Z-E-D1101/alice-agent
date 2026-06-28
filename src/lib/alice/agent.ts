import type { Message, ProviderConfig, Thread } from "./types";
import { TOOLS_BY_NAME, toolsForApi } from "./tools";
import { loadMemory, loadProfile, loadSkills, uid } from "./storage";

export interface AgentDelta {
  type: "text" | "reasoning" | "tool_call_start" | "tool_call_args" | "tool_call_run" | "tool_call_done" | "tool_call_error" | "assistant_done" | "iter" | "error";
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  result?: string;
  error?: string;
}

export interface RunOpts {
  thread: Thread;
  userText: string;
  provider: ProviderConfig;
  model: string;
  systemPrompt: string;
  searxngUrl: string;
  temperature: number;
  maxToolSteps: number;
  signal: AbortSignal;
  onDelta: (d: AgentDelta) => void;
  /** if true, do not append a user message (used by scheduler) */
  skipUserAppend?: boolean;
}

function buildContextSystem(base: string): string {
  const profile = loadProfile();
  const memory = loadMemory();
  const skills = loadSkills();
  let ctx = base + "\n\n";
  if (profile.name || profile.about || profile.preferences) {
    ctx += `# User Profile\nName: ${profile.name || "(unknown)"}\nAbout: ${profile.about || "(none)"}\nPreferences: ${profile.preferences || "(none)"}\n\n`;
  }
  if (memory.length) {
    ctx += "# Long-term memory (most recent first)\n";
    for (const m of memory.slice(-25).reverse()) ctx += `- [${m.key}] ${m.value}\n`;
    ctx += "\n";
  }
  if (skills.length) {
    ctx += "# Available learned skills (call run_skill to use)\n";
    for (const s of skills) ctx += `- ${s.name} — ${s.description} (trigger: ${s.trigger})\n`;
    ctx += "\n";
  }
  return ctx;
}

interface ApiMsg {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

function toApiMessages(thread: Thread, system: string, includeUserText?: string): ApiMsg[] {
  const out: ApiMsg[] = [{ role: "system", content: system }];
  for (const m of thread.messages) {
    if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls?.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args || "{}" } })),
      });
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.toolCallId!, name: m.toolName, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  if (includeUserText !== undefined) out.push({ role: "user", content: includeUserText });
  return out;
}

export async function runAgent(opts: RunOpts) {
  const { thread, userText, provider, model, systemPrompt, searxngUrl, temperature, maxToolSteps, signal, onDelta, skipUserAppend } = opts;

  if (!skipUserAppend) {
    thread.messages.push({ id: uid(), role: "user", content: userText, createdAt: Date.now() });
  }

  const assistantMsg: Message = { id: uid(), role: "assistant", content: "", reasoning: "", toolCalls: [], createdAt: Date.now() };
  thread.messages.push(assistantMsg);

  const system = buildContextSystem(systemPrompt);

  for (let step = 0; step < maxToolSteps; step++) {
    onDelta({ type: "iter", text: String(step + 1) });
    const body = {
      model,
      messages: toApiMessages(thread, system),
      temperature,
      stream: true,
      tools: toolsForApi(),
      tool_choice: "auto" as const,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${provider.apiKey || "dummy"}`,
    };
    if (provider.id === "openrouter") {
      headers["HTTP-Referer"] = window.location.origin;
      headers["X-Title"] = "Alice";
    }

    const resp = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", headers, body: JSON.stringify(body), signal,
    });
    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(() => "");
      throw new Error(`provider ${resp.status}: ${t.slice(0, 300)}`);
    }

    // Stream
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finishReason: string | null = null;
    let stepText = "";
    let stepReasoning = "";
    const stepToolCalls: Array<{ id: string; name: string; args: string }> = [];

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (data === "[DONE]") break outer;
        let json: { choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }> };
        try { json = JSON.parse(data); } catch { continue; }
        const choice = json.choices?.[0];
        const delta = choice?.delta;
        if (!delta) continue;
        if (delta.content) {
          stepText += delta.content;
          assistantMsg.content += delta.content;
          onDelta({ type: "text", text: delta.content });
        }
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (reasoning) {
          stepReasoning += reasoning;
          assistantMsg.reasoning = (assistantMsg.reasoning ?? "") + reasoning;
          onDelta({ type: "reasoning", text: reasoning });
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            stepToolCalls[idx] = stepToolCalls[idx] ?? { id: "", name: "", args: "" };
            if (tc.id) stepToolCalls[idx].id = tc.id;
            if (tc.function?.name) {
              stepToolCalls[idx].name = tc.function.name;
              const tcId = stepToolCalls[idx].id || `call_${idx}_${Date.now()}`;
              stepToolCalls[idx].id = tcId;
              const existing = assistantMsg.toolCalls!.find(x => x.id === tcId);
              if (!existing) {
                assistantMsg.toolCalls!.push({ id: tcId, name: tc.function.name, args: "", status: "preparing", startedAt: Date.now() });
                onDelta({ type: "tool_call_start", toolCallId: tcId, toolName: tc.function.name });
              }
            }
            if (tc.function?.arguments) {
              stepToolCalls[idx].args += tc.function.arguments;
              const tcId = stepToolCalls[idx].id;
              const existing = assistantMsg.toolCalls!.find(x => x.id === tcId);
              if (existing) existing.args += tc.function.arguments;
              onDelta({ type: "tool_call_args", toolCallId: tcId, args: tc.function.arguments });
            }
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }

    // Persist accumulated tool_calls on assistant message
    if (stepToolCalls.length === 0) {
      onDelta({ type: "assistant_done" });
      break;
    }

    // Execute each tool call sequentially
    for (const tc of stepToolCalls) {
      const stored = assistantMsg.toolCalls!.find(x => x.id === tc.id)!;
      stored.args = tc.args;
      stored.status = "running";
      onDelta({ type: "tool_call_run", toolCallId: tc.id, toolName: tc.name, args: tc.args });
      const def = TOOLS_BY_NAME[tc.name];
      let result: string;
      try {
        if (!def) throw new Error(`unknown tool: ${tc.name}`);
        const parsed = tc.args ? JSON.parse(tc.args) : {};
        const r = await def.execute(parsed, { searxngUrl });
        result = typeof r === "string" ? r : JSON.stringify(r);
        stored.status = "done";
        stored.result = result;
        stored.endedAt = Date.now();
        onDelta({ type: "tool_call_done", toolCallId: tc.id, toolName: tc.name, result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result = `ERROR: ${msg}`;
        stored.status = "error";
        stored.result = result;
        stored.endedAt = Date.now();
        onDelta({ type: "tool_call_error", toolCallId: tc.id, toolName: tc.name, error: msg });
      }
      thread.messages.push({
        id: uid(), role: "tool", content: result, toolCallId: tc.id, toolName: tc.name, createdAt: Date.now(),
      });
    }

    // Loop continues to let the model react to tool results.
    if (finishReason && finishReason !== "tool_calls") {
      onDelta({ type: "assistant_done" });
      break;
    }
  }

  return assistantMsg;
}

// Discover models from an OpenAI-compatible /models endpoint
export async function discoverModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const j = await r.json() as { data?: Array<{ id: string }> };
  return (j.data ?? []).map(m => m.id).sort();
}
