import dns from 'dns';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Node uses c-ares with getServers(); a stale local DNS shim (127.0.0.1) breaks Atlas SRV lookups.
const dnsServers = process.env.DNS_SERVERS?.split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
if (dnsServers?.length) {
  dns.setServers(dnsServers);
} else {
  const current = dns.getServers();
  const onlyLocalhost =
    current.length === 0 ||
    current.every((server) => server === '127.0.0.1' || server === '::1');
  if (onlyLocalhost) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required in .env'),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  REMINDER_FROM: z.string().default('finance-app@localhost'),
  DEFAULT_REMINDER_EMAIL: z.string().default(''),
  TIMEZONE: z.string().default('Asia/Kolkata'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${message}`);
}

export const env = {
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGODB_URI,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN,
  smtpHost: parsed.data.SMTP_HOST,
  smtpPort: parsed.data.SMTP_PORT,
  smtpSecure: parsed.data.SMTP_SECURE,
  smtpUser: parsed.data.SMTP_USER,
  smtpPass: parsed.data.SMTP_PASS,
  reminderFrom: parsed.data.REMINDER_FROM,
  defaultReminderEmail: parsed.data.DEFAULT_REMINDER_EMAIL,
  timezone: parsed.data.TIMEZONE,
};
