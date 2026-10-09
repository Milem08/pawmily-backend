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
    if (!process.env.RESEND_API_KEY) {
      console.info('[email:dev]', {
        to,
        subject,
        attachments: attachments.map((item) => item.filename),
      });
      return { delivered: false };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
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
      await res.text();
      console.error('[email:error]', res.status);
      return { delivered: false };
    }
    return { delivered: true };
  }
}
