import { Resend } from 'resend';
import type { OtpPurpose } from '../config/auth';
import { frontendUrl } from '../config/auth';

let client: Resend | undefined;

const getClient = (): Resend | undefined => {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[email] RESEND_API_KEY is not set — email delivery is disabled.');
        return undefined;
    }
    client ??= new Resend(process.env.RESEND_API_KEY);
    return client;
};

const from = () => process.env.EMAIL_FROM || 'Cogni <no-reply@example.com>';

/** Branded, dependency-free markup (no third-party tracking resources). */
const layout = (title: string, body: string) => `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px;background:#F1F5F9;font-family:Lexend,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;">
      <tr><td style="font-size:22px;font-weight:800;color:#0F4B80;">Cogni · Rehab-me</td></tr>
      <tr><td style="padding-top:20px;font-size:20px;font-weight:700;">${title}</td></tr>
      <tr><td style="padding-top:16px;font-size:15px;line-height:1.6;">${body}</td></tr>
      <tr><td style="padding-top:24px;font-size:12px;color:#64748B;">
        If you did not request this, you can safely ignore this email.
      </td></tr>
    </table>
  </body>
</html>`;

type SendArgs = {
    to: string;
    subject: string;
    html: string;
    text: string;
    tag: string;
};

const send = async ({to, subject, html, text, tag}: SendArgs): Promise<void> => {
    const resend = getClient();
    if (!resend) return;

    try {
        const {data, error} = await resend.emails.send({
            from: from(),
            to: [to],
            subject,
            html,
            text,
            tags: [{name: 'purpose', value: tag}],
        }, {
            // Resend sends this as the Idempotency-Key header.
            idempotencyKey: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        if (error) {
            // Never log OTP/reset values — only the provider error.
            console.error('[email] Resend error:', error.message);
            return;
        }
        console.log('[email] sent message', data?.id);
    } catch (err) {
        console.error('[email] send failed:', err instanceof Error ? err.message : err);
    }
};

const purposeCopy: Record<OtpPurpose, {title: string; label: string}> = {
    signup_verify: {title: 'Verify your email', label: 'email verification'},
    login_2fa: {title: 'Your sign-in code', label: 'sign-in'},
};

export const sendOtpEmail = async (email: string, code: string, purpose: OtpPurpose): Promise<void> => {
    const {title, label} = purposeCopy[purpose];
    const minutes = purpose === 'signup_verify' ? 15 : 5;
    const html = layout(title, `
      <p>Use this one-time code to complete ${label}:</p>
      <p style="margin:20px 0;text-align:center;font-size:34px;font-weight:800;letter-spacing:0.3em;color:#0F4B80;">${code}</p>
      <p>This code expires in ${minutes} minutes and can only be used once.</p>
    `);
    await send({
        to: email,
        // Keep the code out of the subject line (notification previews/lockscreens).
        subject: title,
        html,
        text: `${title}. Your one-time code is ${code}. It expires in ${minutes} minutes. If you did not request this, ignore this email.`,
        tag: purpose,
    });
};

export const sendResetEmail = async (email: string, url: string): Promise<void> => {
    const html = layout('Reset your password', `
      <p>We received a request to reset your password.</p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${url}" style="background:#0F4B80;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:14px;font-weight:700;">Reset password</a>
      </p>
      <p>This link expires in 15 minutes and can only be used once. If you did not request it, ignore this email.</p>
    `);
    await send({
        to: email,
        subject: 'Reset your Cogni password',
        html,
        text: `Reset your password using this link (expires in 15 minutes): ${url}`,
        tag: 'password_reset',
    });
};

export const sendPasswordChangedEmail = async (email: string): Promise<void> => {
    const html = layout('Your password was changed', `
      <p>Your Cogni password was just changed successfully.</p>
      <p>If this was not you, contact your administrator immediately.</p>
    `);
    await send({
        to: email,
        subject: 'Your Cogni password was changed',
        html,
        text: 'Your Cogni password was just changed. If this was not you, contact your administrator immediately.',
        tag: 'password_changed',
    });
};
