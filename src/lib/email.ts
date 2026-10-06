import { bindings } from "./env";
import { digest, token } from "./auth";
export const emailConfigured = () => {
  const e = bindings();
  return !!(e.RESEND_API_KEY && e.EMAIL_FROM);
};
export async function sendEmail(to: string, subject: string, text: string) {
  const e = bindings();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + e.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: e.EMAIL_FROM, to, subject, text }),
  });
  if (!r.ok) throw new Error("Email service returned " + r.status);
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
