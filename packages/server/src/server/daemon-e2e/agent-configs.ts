/**
 * Shared agent configurations for e2e tests.
 * Enables running the same tests against Claude and OpenCode providers.
 */
import { isCommandAvailable } from "../agent/provider-launch-config.js";

export interface AgentTestConfig {
  provider: "claude" | "opencode";
  model: string;
  thinkingOptionId?: string;
  modes: {
    full: string; // No permissions required
    ask: string; // Requires permission approval
  };
}

const opencodeModel = process.env.PASEO_TEST_OPENCODE_MODEL?.trim() || "opencode/gpt-5-nano";

export const agentConfigs = {
  claude: {
    provider: "claude",
    model: "haiku",
    modes: {
      full: "bypassPermissions",
      ask: "default",
    },
  },
  opencode: {
    provider: "opencode",
    model: opencodeModel,
    modes: {
      full: "default",
      ask: "default",
    },
  },
} as const satisfies Record<string, AgentTestConfig>;

export type AgentProvider = keyof typeof agentConfigs;

const hasClaudeCredentials =
  !!process.env.CLAUDE_CODE_OAUTH_TOKEN || !!process.env.ANTHROPIC_API_KEY;

/**
 * Get test config for creating an agent with full permissions (no prompts).
 */
export function getFullAccessConfig(provider: AgentProvider) {
  const config = agentConfigs[provider];
  const thinkingOptionId = "thinkingOptionId" in config ? config.thinkingOptionId : undefined;
  return {
    provider: config.provider,
    model: config.model,
    ...(thinkingOptionId ? { thinkingOptionId } : {}),
    modeId: config.modes.full,
  };
}

/**
 * Get test config for creating an agent that requires permission approval.
 */
export function getAskModeConfig(provider: AgentProvider) {
  const config = agentConfigs[provider];
  const thinkingOptionId = "thinkingOptionId" in config ? config.thinkingOptionId : undefined;
  return {
    provider: config.provider,
    model: config.model,
    ...(thinkingOptionId ? { thinkingOptionId } : {}),
    modeId: config.modes.ask,
  };
}

/**
 * Whether the real provider is executable in this environment.
 * Claude additionally requires credentials.
 */
export function isRealProviderReady(provider: AgentProvider): boolean {
  if (provider === "claude") {
    return isCommandAvailable("claude") && hasClaudeCredentials;
  }
  return isCommandAvailable("opencode");
}

/**
 * Helper to run a test for each provider.
 */
export const allProviders: AgentProvider[] = ["claude", "opencode"];
