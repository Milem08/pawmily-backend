import { env } from '../config/env';

export type EmailAttachment = {
  filename: string;
  content: string;
};

export class EmailSender {
  async send(
    to: string,
    subject: string,
    text: string,
    options?: { attachments?: EmailAttachment[] },
  ): Promise<{ delivered: boolean }> {
    const attachments = options?.attachments ?? [];
    if (!env.resendApiKey) {
      console.info('[email:dev]', {
        to,
        subject,
        text,
        attachments: attachments.map((item) => item.filename),
      });
      return { delivered: false };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [to],
        subject,
        text,
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[email:error]', res.status, body);
      return { delivered: false };
    }
    return { delivered: true };
  }
}
