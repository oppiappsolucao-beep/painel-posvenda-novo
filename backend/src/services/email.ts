import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  if (!transporter) {
    const port = config.smtp.port;
    const secure = config.smtp.secure;
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port,
      secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      ...(port === 587 && !secure ? { requireTLS: true } : {}),
      tls: {
        minVersion: "TLSv1.2",
      },
    });
  }

  return transporter;
}

function friendlySmtpError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/535|EAUTH|authentication failed/i.test(message)) {
    return [
      "Não foi possível autenticar no e-mail.",
      "Confira no EasyPanel: SMTP_USER = e-mail completo (contato@skoobpet.com.br), SMTP_PASS = senha dessa caixa.",
      "Se o e-mail for Titan (Hostinger), use SMTP_HOST=smtp.titan.email, ative 'Titan em outros apps' no webmail e tente porta 465 com SMTP_SECURE=true.",
      "Teste a senha em https://webmail.hostinger.com antes de salvar no painel.",
    ].join(" ");
  }
  return message;
}

export async function sendTwoFactorCode(params: {
  to: string;
  code: string;
  username: string;
  unitLabel?: string;
}): Promise<void> {
  const { to, code, username, unitLabel } = params;
  const subject = "Código de verificação — Painel SkoobPet";
  const text = [
    "Olá,",
    "",
    "Foi solicitado acesso ao Painel SkoobPet.",
    "",
    `Usuário: ${username}`,
    unitLabel ? `Unidade: ${unitLabel}` : "",
    "",
    `Código de verificação: ${code}`,
    "",
    "Este código expira em 10 minutos.",
    "",
    "Se você não solicitou este acesso, ignore este e-mail.",
  ].filter(Boolean).join("\n");

  const html = `
    <p>Olá,</p>
    <p>Foi solicitado acesso ao <strong>Painel SkoobPet</strong>.</p>
    <ul>
      <li><strong>Usuário:</strong> ${username}</li>
      ${unitLabel ? `<li><strong>Unidade:</strong> ${unitLabel}</li>` : ""}
    </ul>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;margin:24px 0">${code}</p>
    <p>Este código expira em <strong>10 minutos</strong>.</p>
    <p style="color:#64748b;font-size:13px">Se você não solicitou este acesso, ignore este e-mail.</p>
  `;

  const mail = getTransporter();
  if (!mail) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[2FA] Código para ${username}: ${code} (enviaria para ${to})`);
      return;
    }
    throw new Error("Servidor de e-mail não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
  }

  try {
    await mail.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    throw new Error(friendlySmtpError(error));
  }
}
