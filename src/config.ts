export interface Config {
  verifyToken: string;
  appSecret: string;
  igAccessToken: string;
  igUserId: string;
  graphVersion: string;
  port: number;
  dbPath: string;
  rulesPath: string;
  dryRun: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    verifyToken: env.VERIFY_TOKEN ?? "",
    appSecret: env.APP_SECRET ?? "",
    igAccessToken: env.IG_ACCESS_TOKEN ?? "",
    igUserId: env.IG_USER_ID ?? "",
    graphVersion: env.GRAPH_VERSION ?? "v23.0",
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./data/guria.db",
    rulesPath: env.RULES_PATH ?? "./config/rules.json",
    dryRun: env.DRY_RUN === "true",
  };
}
