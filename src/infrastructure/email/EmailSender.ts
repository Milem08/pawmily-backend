import { env } from '../config/env';

export class EmailSender {
  async send(to: string, subject: string, text: string): Promise<void> {
    if (!env.resendApiKey) {
      console.info('[email:dev]', { to, subject, text });
      return;
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
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[email:error]', res.status, body);
    }
  }
}
