// Test only: just enough SMTP for nodemailer's required STARTTLS and its `verify`, over a real certificate.
import { createServer, type Socket } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';

export interface StubMail {
  to: string;
  raw: string;
}

export async function startSmtpStub(input: { key: Buffer; cert: Buffer; port?: number; rejectAuth?: boolean; onMail?: (mail: StubMail) => void }) {
  const tlsContext = createSecureContext({ key: input.key, cert: input.cert });
  function speakSmtp(start: Socket | TLSSocket) {
    let buffer = '';
    let inData = false;
    let to = '';
    const say = (line: string) => start.write(`${line}\r\n`);
    start.on('error', () => {});
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('latin1');
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) return;
        input.onMail?.({ to, raw: buffer.slice(0, end) });
        buffer = buffer.slice(end + 5);
        inData = false;
        say('250 stored');
      }
      let at: number;
      while ((at = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const verb = line.split(/[ :]/, 1)[0]!.toUpperCase();
        if (verb === 'EHLO') {
          const secure = start instanceof TLSSocket;
          start.write(`250-localhost\r\n${secure ? '250 AUTH PLAIN\r\n' : '250 STARTTLS\r\n'}`);
        } else if (verb === 'STARTTLS') {
          say('220 go');
          start.off('data', onData);
          const secure = new TLSSocket(start, { isServer: true, secureContext: tlsContext });
          speakSmtp(secure);
          return;
        } else if (verb === 'AUTH') say(input.rejectAuth ? '535 no' : '235 ok');
        else if (verb === 'MAIL') say('250 ok');
        else if (verb === 'RCPT') {
          to = /<(.*)>/.exec(line)?.[1] ?? '';
          say('250 ok');
        } else if (verb === 'DATA') {
          inData = true;
          say('354 go');
          return onData(Buffer.alloc(0));
        } else if (verb === 'QUIT') {
          say('221 bye');
          start.end();
        } else say('250 ok');
      }
    };
    start.on('data', onData);
  }
  const server = createServer((socket) => {
    socket.write('220 localhost ready\r\n');
    speakSmtp(socket);
  });
  await new Promise<void>((resolve) => server.listen(input.port ?? 0, '127.0.0.1', resolve));
  return { server, port: (server.address() as { port: number }).port, close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }) };
}
