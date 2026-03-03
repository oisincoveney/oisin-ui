const ALLOWED_DOCKER_MISE_COMMAND = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*mise\s+run\s+docker:(?:start|stop|restart)(?:\s+.*)?\s*$/i

const BLOCKED_LOCAL_RUN_PATTERNS: RegExp[] = [
  /\bbun\s+run\s+dev\b/i,
  /\bnpm\s+run\s+dev\b/i,
  /\bpnpm\s+(?:run\s+)?dev\b/i,
  /\byarn\s+(?:run\s+)?dev\b/i,
  /\bexpo\s+start\b/i,
  /\breact-native\s+start\b/i,
  /\bnext\s+dev\b/i,
  /\bturbo\s+dev\b/i,
  /\bdocker\s+compose\s+up\b/i,
]

const normalizeCommand = (command: string): string => command.replace(/\s+/g, " ").trim()

export const DockerOnlyGuardPlugin = async () => {
  return {
    "tool.execute.before": async (input: { tool?: string }, output: { args?: { command?: string } }) => {
      if (input.tool !== "bash") {return}

      const rawCommand = output.args?.command
      if (typeof rawCommand !== "string" || rawCommand.length === 0) {return}

      const command = normalizeCommand(rawCommand)

      if (ALLOWED_DOCKER_MISE_COMMAND.test(command)) {return}

      const isBlocked = BLOCKED_LOCAL_RUN_PATTERNS.some((pattern) => pattern.test(command))
      if (!isBlocked) {return}

      throw new Error(
        [
          "Do not run the app locally.",
          "Use Docker via mise only:",
          "- mise run docker:start",
          "- mise run docker:restart",
          "- mise run docker:stop",
        ].join("\n"),
      )
    },
  }
}
