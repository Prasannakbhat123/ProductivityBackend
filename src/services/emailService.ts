import nodemailer from 'nodemailer';
import { env } from '../config/env';

type ReminderMailInput = {
  to: string;
  subject: string;
  text: string;
};

function createTransport() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

export async function sendReminderMail(input: ReminderMailInput): Promise<void> {
  const transporter = createTransport();
  if (!transporter) {
    return;
  }

  await transporter.sendMail({
    from: env.reminderFrom,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
