/**
 * Reusable email service (Resend). Use for note acknowledgements, access requests,
 * invites, OTP login, etc. Sends via the Resend REST API (no extra dependency).
 */
import {
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  RESEND_FROM_NAME,
} from "constants/secrets";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Minimal, email-client-safe HTML shell. */
function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.5">
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#888">BUTEX NoteBot · This is an automated message.</p>
</div>`;
}

/** Default sign-off block. */
const SIGNATURE = `<p style="margin-top:16px"><b>Afshin Nahian Tripto</b><br/><span style="color:#666;font-size:13px">Senior Full Stack Engineer, Provision Capital<br/>Software Engineer, REDQ<br/>Founder, BUTEX NoteBOT</span></p>`;

export const emailService = {
  /** Low-level send. Returns the Resend response id, or throws on failure. */
  async send({ to, subject, html, text, replyTo }: SendEmailArgs): Promise<{ id?: string }> {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend ${res.status}: ${body}`);
    }
    return (await res.json()) as { id?: string };
  },

  /** A note submission was published to NoteBot — thank the author. */
  async sendNoteApproved(args: {
    to: string;
    authorName: string;
    subject: string;
    topic: string;
    thanksFrom: string;
  }) {
    const html = shell(
      `<p>Hi ${esc(args.authorName)},</p>
       <p>Your submission — <b>${esc(args.subject)} — ${esc(args.topic)}</b> — is now live on BUTEX NoteBot. 🎉</p>
       <p>Thank you for contributing and helping fellow students.</p>
       ${SIGNATURE}`
    );
    return this.send({
      to: args.to,
      subject: `Your NoteBot submission is live: ${args.subject} — ${args.topic}`,
      html,
    });
  },

  /** A submitted Google Drive file is not shared — ask the author to grant access. */
  async sendAccessRequest(args: {
    to: string;
    authorName: string;
    subject: string;
    topic: string;
    link: string;
    thanksFrom: string;
  }) {
    const html = shell(
      `<p>Hi ${esc(args.authorName)},</p>
       <p>Thanks for submitting <b>${esc(args.subject)} — ${esc(args.topic)}</b> to BUTEX NoteBot.</p>
       <p>We couldn't add it because the Google Drive file isn't shared. Please open it, set
       <b>General access → "Anyone with the link" (Viewer)</b>, and it'll be added automatically.</p>
       <p><a href="${esc(args.link)}">${esc(args.link)}</a></p>
       ${SIGNATURE}`
    );
    return this.send({
      to: args.to,
      subject: `Action needed: share your NoteBot submission (${args.subject})`,
      html,
    });
  },

  /** Generic OTP / login code email. */
  async sendOtp(args: { to: string; code: string; minutes?: number }) {
    const mins = args.minutes ?? 10;
    const html = shell(
      `<p>Your BUTEX NoteBot login code:</p>
       <p style="font-size:28px;font-weight:700;letter-spacing:4px">${esc(args.code)}</p>
       <p style="color:#666">Expires in ${mins} minutes. If you didn't request this, ignore this email.</p>`
    );
    return this.send({ to: args.to, subject: `${args.code} is your NoteBot login code`, html });
  },

  /** Generic invite email. */
  async sendInvite(args: { to: string; inviterName: string; link: string; role?: string }) {
    const html = shell(
      `<p>${esc(args.inviterName)} invited you${args.role ? ` as a <b>${esc(args.role)}</b>` : ""} to BUTEX NoteBot.</p>
       <p><a href="${esc(args.link)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Accept invite</a></p>
       <p style="color:#666">Or paste this link: ${esc(args.link)}</p>`
    );
    return this.send({ to: args.to, subject: `You're invited to BUTEX NoteBot`, html });
  },
};
