import { EmailSender } from '../../../src/infrastructure/email/EmailSender';

describe('EmailSender', () => {
  it('en modo consola no escribe token= en el log', async () => {
    const previous = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const sender = new EmailSender();
      await sender.send(
        'persona@example.test',
        'Asunto',
        'abre https://app.example/reset?token=abc',
      );
      const dumped = JSON.stringify(info.mock.calls);
      expect(dumped).not.toContain('token=');
      expect(dumped).toContain('persona@example.test');
      expect(dumped).toContain('Asunto');
    } finally {
      info.mockRestore();
      if (previous === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previous;
    }
  });
});
