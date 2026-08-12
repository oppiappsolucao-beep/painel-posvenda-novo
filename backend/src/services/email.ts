import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter: nodemailer.Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

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

export async function sendContractSignEmail(params: {
  to: string;
  nome: string;
  signUrl: string;
  papel?: "cliente" | "loja";
  brand?: string;
}): Promise<void> {
  const { to, nome, signUrl, papel = "cliente", brand = "SkoobPet" } = params;
  const subject =
    papel === "loja"
      ? `${brand} — contrato aguardando assinatura da loja`
      : `${brand} — seu contrato está pronto para assinatura`;

  const introBody =
    papel === "loja"
      ? "O cliente já assinou (ou o contrato está pronto). Sua assinatura como loja é necessária para concluir o documento."
      : "Seu contrato de compra do filhote está pronto para revisão e assinatura.\n\nAbra o link abaixo, confirme seus dados e responda sobre a documentação do filhote.";

  const text = [
    `Olá ${nome},`,
    "",
    introBody,
    "",
    signUrl,
    "",
    "Abraços,",
    `Equipe ${brand}`,
  ].join("\n");

  const html = `
    <p>Olá <strong>${nome}</strong>,</p>
    <p>${introBody.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>
    <p style="margin:24px 0">
      <a href="${signUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
        Abrir contrato para assinar
      </a>
    </p>
    <p style="color:#64748b;font-size:13px">Ou copie e cole este link no navegador:<br>${signUrl}</p>
    <p>Abraços,<br><strong>Equipe ${brand}</strong></p>
  `;

  const mail = getTransporter();
  if (!mail) {
    throw new Error("Servidor de e-mail não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
  }

  try {
    await mail.sendMail({
      from: config.smtp.from,
      replyTo: config.smtp.from,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    throw new Error(friendlySmtpError(error));
  }
}

export async function sendDocFormAttachmentsEmail(params: {
  storeEmails: string[];
  clientEmail: string;
  clienteNome: string;
  unitLabel: string;
  attachments: Array<{ filename: string; label?: string; content: Buffer }>;
}): Promise<void> {
  const { storeEmails, clientEmail, clienteNome, unitLabel, attachments } = params;
  const brand = `SkoobPet ${unitLabel}`;
  const subject = `${brand} — documentação do filhote anexada`;

  const attachmentLabel = (attachment: { filename: string; label?: string }) =>
    attachment.label || attachment.filename.replace(/_/g, " ").replace(/\.jpg$/i, "");

  const docList = attachments.map((a) => `• ${attachmentLabel(a)}`).join("\n");

  const text = [
    `Olá,`,
    ``,
    `A documentação do filhote referente ao contrato de ${clienteNome} foi enviada pelo painel SkoobPet.`,
    ``,
    `Documentos anexados:`,
    docList,
    ``,
    `Unidade: ${unitLabel}`,
    ``,
    `Abraços,`,
    `Equipe SkoobPet`,
  ].join("\n");

  const html = `
    <p>Olá,</p>
    <p>A documentação do filhote referente ao contrato de <strong>${clienteNome}</strong> foi enviada pelo painel SkoobPet.</p>
    <p><strong>Documentos anexados:</strong></p>
    <ul>${attachments.map((a) => `<li>${attachmentLabel(a)}</li>`).join("")}</ul>
    <p><strong>Unidade:</strong> ${unitLabel}</p>
    <p>Abraços,<br><strong>Equipe SkoobPet</strong></p>
  `;

  const mail = getTransporter();
  if (!mail) {
    throw new Error("Servidor de e-mail não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
  }

  const mailAttachments = attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: "image/jpeg",
  }));

  try {
    await mail.sendMail({
      from: config.smtp.from,
      replyTo: config.smtp.from,
      to: [...storeEmails, clientEmail].join(", "),
      subject,
      text,
      html,
      attachments: mailAttachments,
    });
  } catch (error) {
    throw new Error(friendlySmtpError(error));
  }
}
