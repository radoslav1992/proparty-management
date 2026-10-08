import { bindings } from "./env";
import { digest, token } from "./auth";
import { senderAddress } from "./domain";
/** Email is on once the sender address is set; the EMAIL binding (Cloudflare Email Service) is declared in wrangler.jsonc. */
export const emailConfigured = () => {
  const e = bindings();
  return !!(e.EMAIL && e.EMAIL_FROM);
};
export async function sendEmail(to: string, subject: string, text: string) {
  const e = bindings();
  if (!e.EMAIL || !e.EMAIL_FROM) throw new Error("Email is not configured");
  try {
    await e.EMAIL.send({
      from: senderAddress(e.EMAIL_FROM),
      to,
      subject,
      text,
      ...(e.EMAIL_REPLY_TO ? { replyTo: e.EMAIL_REPLY_TO } : {}),
    });
  } catch (err) {
    // Email Service errors carry a code such as E_SENDER_NOT_VERIFIED or E_RECIPIENT_SUPPRESSED.
    const code = (err as { code?: string }).code;
    throw new Error(
      `Email not sent${code ? ` (${code})` : ""}: ${err instanceof Error ? err.message : "unknown"}`,
      { cause: err },
    );
  }
}
export async function sendVerification(
  userId: string,
  email: string,
  origin: string,
) {
  const t = token();
  await bindings()
    .DB.prepare(
      "INSERT INTO verify_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .bind(await digest(t), userId, Math.floor(Date.now() / 1000) + 86400)
    .run();
  await sendEmail(
    email,
    "Confirm your Proparty email",
    `Confirm your email address within 24 hours: ${origin}/verify-email?token=${t}\nIf you did not create a Proparty account, ignore this message.`,
  );
}
export async function sendPasswordReset(
  userId: string,
  email: string,
  origin: string,
) {
  const t = token();
  await bindings()
    .DB.prepare(
      "INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .bind(await digest(t), userId, Math.floor(Date.now() / 1000) + 1800)
    .run();
  await sendEmail(
    email,
    "Reset your Proparty password",
    `Reset your password within 30 minutes: ${origin}/reset-password?token=${t}\nIf you did not request this, ignore this message.`,
  );
}
