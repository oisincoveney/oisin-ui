<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.0 | Updated: 2026-02-21 -->

# Technical Domain

**Purpose**: Tech stack, architecture, and development patterns for Paseo.
**Last Updated**: 2026-02-21

## Quick Reference

**Update Triggers**: Tech stack changes | New packages | Architecture decisions
**Audience**: Developers, AI agents

---

## Monorepo Structure

npm workspaces — all packages share one version (synced via `scripts/sync-workspace-versions.mjs`).

| Package            | Role                                               | Key Tech                                                   |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| `packages/server`  | Daemon — manages agents, WebSocket API, MCP server | Node.js, Express, ws, Zod, Pino                            |
| `packages/app`     | Mobile/web client                                  | Expo (React Native), expo-router, Zustand, TanStack Query  |
| `packages/relay`   | WebSocket relay bridge (E2EE)                      | ws, tweetnacl, Cloudflare Workers                          |
| `packages/cli`     | `paseo` CLI                                        | commander, @clack/prompts, chalk                           |
| `packages/desktop` | Desktop wrapper                                    | Tauri v2                                                   |
| `packages/website` | Marketing site                                     | TanStack Router, React 19, Tailwind v4, Cloudflare Workers |

---

## Primary Stack

| Layer             | Technology                                             | Notes                             |
| ----------------- | ------------------------------------------------------ | --------------------------------- |
| Language          | TypeScript (strict, ESM)                               | All packages                      |
| Server runtime    | Node.js + Express + ws                                 | Daemon HTTP + WebSocket           |
| Mobile/web client | Expo 54 + React Native 0.81 + React 19                 | Cross-platform                    |
| Client routing    | expo-router (file-based)                               | `src/app/` directory              |
| State management  | Zustand + TanStack Query                               | Stores + server state             |
| Styling           | react-native-unistyles (theme tokens)                  | App; Tailwind v4 for website      |
| Validation        | Zod                                                    | Server inbound messages + schemas |
| Logging           | Pino                                                   | Server-side structured logging    |
| Testing           | Vitest (unit) + Playwright (E2E)                       | All packages                      |
| Formatting        | Prettier                                               | Root-level config                 |
| AI SDKs           | @anthropic-ai/claude-agent-sdk, openai, @ai-sdk/openai | Server                            |
| MCP               | @modelcontextprotocol/sdk                              | Server MCP server + client        |
| Desktop           | Tauri v2                                               | Wraps Expo web build              |

---

## Code Patterns

### Server — WebSocket message handler

```typescript
// Inbound messages validated with Zod schema
const parsed = WSInboundMessageSchema.safeParse(rawMessage);
if (!parsed.success) {
  logger.warn({ error: parsed.error }, "Invalid inbound message");
  return;
}
// Typed outbound responses
const response: WSOutboundMessage = { type: "agent_state", payload: ... };
ws.send(JSON.stringify(response));
```

### App — Screen component

```typescript
export function AgentsScreen({ serverId }: { serverId: string }) {
  const { agents, isRevalidating, refreshAll } = useAllAgentsList({ serverId });
  const sortedAgents = useMemo(() => [...agents].sort(...), [agents]);

  return (
    <View style={styles.container}>
      <AgentList agents={sortedAgents} onRefresh={refreshAll} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface0 },
}));
```

### App — Custom hook

```typescript
export function useAggregatedAgents(): AggregatedAgentsResult {
  const { daemons } = useDaemonRegistry();
  const sessionAgents = useSessionStore(useShallow((state) => ...));
  const result = useMemo(() => { /* derive from store */ }, [sessionAgents]);
  return { agents: result, isLoading, refreshAll };
}
```

---

## Naming Conventions

| Type             | Convention               | Example                                         |
| ---------------- | ------------------------ | ----------------------------------------------- |
| Files            | kebab-case               | `agent-list.tsx`, `use-aggregated-agents.ts`    |
| Components       | PascalCase               | `AgentList`, `AgentsScreen`                     |
| Functions/hooks  | camelCase, `use-` prefix | `useAllAgentsList`, `buildHostAgentDetailRoute` |
| Stores           | kebab-case + `-store`    | `session-store.ts`                              |
| Types/interfaces | PascalCase               | `AggregatedAgent`, `HostRuntimeSnapshot`        |
| Test files       | `*.test.ts` suffix       | `agent-list.test.ts`                            |
| Platform splits  | `.native.ts` / `.web.ts` | `use-audio-player.native.ts`                    |

---

## Code Standards

- TypeScript strict mode, ESM modules throughout all packages
- Zod for all runtime validation (server inbound messages, config schemas)
- Pino for structured logging (server-side only)
- Vitest for unit/integration tests; Playwright for E2E
- Prettier for formatting (root-level config, run via `npm run format`)
- Platform splits via `.native.ts` / `.web.ts` for React Native vs web divergence
- Path aliases: `@/` → `packages/app/src/`, `@server/` → `packages/server/src/`
- `tsx` for running TypeScript scripts directly in dev (no compile step)
- Typecheck runs across all workspaces before release (`npm run typecheck`)

---

## Security Requirements

- `express-basic-auth` on HTTP endpoints
- WebSocket connections validated via allowed-hosts config (`allowed-hosts.ts`)
- E2EE via tweetnacl in relay package (`packages/relay/src/e2ee.ts`)
- Zod validation on all inbound WebSocket messages
- Daemon keypair for server identity (`daemon-keypair.ts`)
- Pairing QR flow for client onboarding (`pairing-qr.ts`, `pairing-offer.ts`)
- PID lock to prevent multiple daemon instances (`pid-lock.ts`)
- Agent providers handle their own auth — Paseo never manages API keys or tokens

---

## 📂 Codebase References

| What               | Where                                               |
| ------------------ | --------------------------------------------------- |
| Server entry       | `packages/server/src/server/index.ts`               |
| Daemon bootstrap   | `packages/server/src/server/bootstrap.ts`           |
| WebSocket server   | `packages/server/src/server/websocket-server.ts`    |
| Agent manager      | `packages/server/src/server/agent/agent-manager.ts` |
| Message schemas    | `packages/server/src/server/messages.ts`            |
| App screens        | `packages/app/src/screens/`                         |
| App components     | `packages/app/src/components/`                      |
| App hooks          | `packages/app/src/hooks/`                           |
| Zustand stores     | `packages/app/src/stores/`                          |
| Theme tokens       | `packages/app/src/styles/theme.ts`                  |
| Relay E2EE         | `packages/relay/src/e2ee.ts`                        |
| CLI entry          | `packages/cli/src/index.js`                         |
| Website routes     | `packages/website/src/routes/`                      |
| Workspace versions | `scripts/sync-workspace-versions.mjs`               |

## Related Files

- `navigation.md` — Quick overview of all project-intelligence files
- `decisions-log.md` — Major architectural decisions with rationale
- `living-notes.md` — Active issues, debt, open questions
