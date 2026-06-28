export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  args: string; // raw JSON string as streamed
  status: "preparing" | "running" | "done" | "error";
  result?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  reasoning?: string; // expandable thinking
  toolCalls?: ToolCall[];
  toolCallId?: string; // for role=tool
  toolName?: string;
  createdAt: number;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string; // OpenAI-compatible /v1
  apiKey: string;
  models: string[];
  builtin?: boolean;
}

export interface AppSettings {
  activeProviderId: string;
  activeModel: string;
  systemPrompt: string;
  searxngUrl: string;
  temperature: number;
  maxToolSteps: number;
}

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  createdAt: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string; // when to use
  steps: string;   // free-form instructions / template
  createdAt: number;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  schedule: string; // human: "every 60m" | "daily 09:00"
  intervalMs?: number;
  dailyAt?: string;
  nextRun: number;
  enabled: boolean;
  lastRun?: number;
  lastResult?: string;
}

export interface UserProfile {
  name: string;
  about: string;
  preferences: string;
  updatedAt: number;
}
