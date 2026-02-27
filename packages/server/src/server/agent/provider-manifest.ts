import { z } from "zod";
import type { AgentMode } from "./agent-sdk-types.js";

export interface AgentProviderDefinition {
  id: string;
  label: string;
  description: string;
  defaultModeId: string | null;
  modes: AgentMode[];
  voice?: {
    enabled: boolean;
    defaultModeId: string;
    defaultModel?: string;
  };
}

const CLAUDE_MODES: AgentMode[] = [
  {
    id: "default",
    label: "Always Ask",
    description: "Prompts for permission the first time a tool is used",
  },
  {
    id: "acceptEdits",
    label: "Accept File Edits",
    description: "Automatically approves edit-focused tools without prompting",
  },
  {
    id: "plan",
    label: "Plan Mode",
    description: "Analyze the codebase without executing tools or edits",
  },
  {
    id: "bypassPermissions",
    label: "Bypass",
    description: "Skip all permission prompts (use with caution)",
  },
];

const OPENCODE_MODES: AgentMode[] = [
  {
    id: "default",
    label: "Default",
    description: "Standard permission rules",
  },
];

export const AGENT_PROVIDER_DEFINITIONS: AgentProviderDefinition[] = [
  {
    id: "claude",
    label: "Claude",
    description:
      "Anthropic's multi-tool assistant with MCP support, streaming, and deep reasoning",
    defaultModeId: "default",
    modes: CLAUDE_MODES,
    voice: {
      enabled: true,
      defaultModeId: "default",
      defaultModel: "haiku",
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    description:
      "Open-source coding assistant with multi-provider model support",
    defaultModeId: "default",
    modes: OPENCODE_MODES,
    voice: {
      enabled: true,
      defaultModeId: "default",
    },
  },
];

export function getAgentProviderDefinition(provider: string): AgentProviderDefinition {
  const definition = AGENT_PROVIDER_DEFINITIONS.find((entry) => entry.id === provider);
  if (!definition) {
    throw new Error(`Unknown agent provider: ${provider}`);
  }
  return definition;
}

export const AGENT_PROVIDER_IDS = AGENT_PROVIDER_DEFINITIONS.map((d) => d.id) as [string, ...string[]];

export const AgentProviderSchema = z.enum(AGENT_PROVIDER_IDS);

export function isValidAgentProvider(value: string): boolean {
  return AGENT_PROVIDER_IDS.includes(value);
}
