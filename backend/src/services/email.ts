import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  return transporter;
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

  await mail.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
  });
}
