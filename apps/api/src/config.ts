import { z } from 'zod';

const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('/app/data/hal-factory-control.db'),
  FACTORIO_ICON_DIR: z.string().default('/app/data/factorio-icons'),
  TELEMETRY_DOWNLOAD_DIR: z.string().default('/app/downloads'),
  FACTORY_MODE: z.enum(['mock', 'factorio-rcon']).default('mock'),
  FACTORIO_RCON_HOST: z.string().default('server'),
  FACTORIO_RCON_PORT: z.coerce.number().int().positive().default(27015),
  FACTORIO_LOG_PATH: z.string().default('/factorio/factorio-current.log'),
  RCON_PASSWORD_FILE: z.string().default('/run/secrets/factorio_rcon_password'),
  // z.coerce.boolean() treats the non-empty string "false" as true, which is
  // unsafe for a local HTTP mock deployment. Accept only explicit text values.
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
});

export type Config = z.infer<typeof environment>;
export const config = environment.parse(process.env);
