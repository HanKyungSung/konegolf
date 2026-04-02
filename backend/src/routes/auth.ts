import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import logger from '../lib/logger';
import { createUser, findUserByEmail, findUserByPhone, hashPassword, verifyPassword, createSession, getSession, invalidateSession, createEmailVerificationToken, consumeEmailVerificationToken, createPasswordResetToken, consumePasswordResetToken } from '../services/authService';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { normalizePhone } from '../utils/phoneUtils';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().min(1, 'Phone number is required'),
  password: z.string().min(10).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must contain a letter and a number'),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date format')
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const verifySchema = z.object({ email: z.string().email(), token: z.string().min(10) });
const resendSchema = z.object({ email: z.string().email() });

// POST /auth/register (password-based, sends verification email; no session until verified)
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, name, phone, password, dateOfBirth } = parsed.data;
  const normEmail = email.toLowerCase();
  const normPhone = normalizePhone(phone);
  
  // Check if email already exists
  const existing = await findUserByEmail(normEmail);
  if (existing) return res.status(409).json({ error: 'Email already in use' });
  
  // Check if phone already exists
  const existingPhone = await findUserByPhone(normPhone);
  if (existingPhone) return res.status(409).json({ error: 'Phone number already in use' });
  
  const passwordHash = await hashPassword(password);
  const user = await createUser(normEmail, name, normPhone, passwordHash, new Date(dateOfBirth));
  
  // Auto-link existing guest bookings with matching phone number
  const linkedCount = await prisma.$executeRaw`
    UPDATE "Booking"
    SET "userId" = ${user.id}
    WHERE "customerPhone" = ${normPhone}
      AND "userId" IS NULL
  `;
  
  if (linkedCount > 0) {
    req.log.info({ linkedCount, userId: user.id }, 'Linked guest bookings to new user');
  }
  
  const { plain, expiresAt } = await createEmailVerificationToken(user.id);
  try {
    if (user.email) {
      await sendVerificationEmail({ to: user.email, email: user.email, token: plain, expiresAt });
    }
  } catch (e) {
    req.log.error({ err: e }, 'Failed to send verification email');
  }
  req.log.info({ userId: user.id, email: normEmail, phone: normPhone }, 'User registered');
  return res.status(201).json({ message: 'Verification email sent', expiresAt });
});

// POST /auth/login (requires verified email)
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const normEmail = email.toLowerCase();
  const user = await findUserByEmail(normEmail);
  if (!user) return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'No account found for this email' });
  if (!(user as any).passwordHash) {
    return res.status(400).json({
      code: 'PASSWORD_LOGIN_NOT_ENABLED',
      message: 'Password login is not enabled for this account',
    });
  }
  if (!user.emailVerifiedAt) return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' });
  const ok = await verifyPassword(password, (user as any).passwordHash);
  if (!ok) return res.status(401).json({ code: 'WRONG_PASSWORD', message: 'Wrong password' });
  const { sessionToken } = await createSession(user.id);
  setAuthCookie(res, sessionToken);
  req.log.info({ userId: user.id, email: normEmail, role: (user as any).role }, 'User logged in');
  return res.json({ user: { id: user.id, email: user.email, name: user.name, phone: (user as any).phone, role: (user as any).role } });
});

// POST /auth/verify (email + token) => sets emailVerifiedAt and issues session
router.post('/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, token } = parsed.data;
  const user = await findUserByEmail(email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
  if (user.emailVerifiedAt) {
    const { sessionToken } = await createSession(user.id);
    setAuthCookie(res, sessionToken);
    return res.json({ user: { id: user.id, email: user.email, name: user.name, emailVerifiedAt: user.emailVerifiedAt } });
  }
  const consumed = await consumeEmailVerificationToken(user.id, token);
  if (!consumed) return res.status(400).json({ error: 'Invalid or expired token' });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  const { sessionToken } = await createSession(user.id);
  setAuthCookie(res, sessionToken);
  req.log.info({ userId: user.id, email: email.toLowerCase() }, 'Email verified');
  return res.json({ user: { id: updated.id, email: updated.email, name: updated.name, emailVerifiedAt: updated.emailVerifiedAt } });
});

// GET /auth/me
router.get('/me', async (req, res) => {
  const token = readAuthCookie(req);
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthenticated' });
  return res.json({ user: { id: session.user.id, email: session.user.email, name: (session.user as any).name, phone: (session.user as any).phone, role: (session.user as any).role } });
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  const token = readAuthCookie(req);
  if (token) await invalidateSession(token);
  clearAuthCookie(res);
  return res.json({ ok: true });
});

// POST /auth/resend (resend verification email if account exists and not verified)
// Simple in-memory cooldown to avoid abuse in dev/single instance
const RESEND_COOLDOWN_MS = 60_000; // 60s
const resendCooldown = new Map<string, number>();
router.post('/resend', async (req, res) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const email = parsed.data.email.toLowerCase();

  // Generic response to avoid account enumeration
  const generic = { message: 'If the account exists and is not verified, a new link will be sent shortly.' } as const;

  // Cooldown with remaining seconds feedback
  const now = Date.now();
  const last = resendCooldown.get(email) || 0;
  const remainingMs = RESEND_COOLDOWN_MS - (now - last);
  if (remainingMs > 0) {
    return res.status(429).json({ ...generic, retryAfterSeconds: Math.ceil(remainingMs / 1000) });
  }

  // Set cooldown regardless of account existence to keep responses generic
  resendCooldown.set(email, now);

  const user = await findUserByEmail(email);
  if (!user) return res.json({ ...generic, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) });
  if ((user as any).emailVerifiedAt) return res.json({ message: 'Email is already verified.' });

  const { plain, expiresAt } = await createEmailVerificationToken(user.id);
  try {
    await sendVerificationEmail({ to: user.email, email: user.email, token: plain, expiresAt });
  } catch (e) {
    req.log.error({ err: e }, 'Failed to send verification email (resend)');
    // Still return generic to avoid info leakage
  }
  return res.json({ message: 'Verification email resent.', expiresAt, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) });
});

// POST /auth/forgot-password (send password reset link)
const forgotPasswordSchema = z.object({ email: z.string().email() });
const FORGOT_COOLDOWN_MS = 60_000;
const forgotCooldown = new Map<string, number>();
router.post('/forgot-password', async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const email = parsed.data.email.toLowerCase();

  // Generic response to prevent account enumeration
  const generic = { message: 'If an account exists with that email, a password reset link has been sent.' } as const;

  // Cooldown
  const now = Date.now();
  const last = forgotCooldown.get(email) || 0;
  const remainingMs = FORGOT_COOLDOWN_MS - (now - last);
  if (remainingMs > 0) {
    return res.status(429).json({ ...generic, retryAfterSeconds: Math.ceil(remainingMs / 1000) });
  }
  forgotCooldown.set(email, now);

  const user = await findUserByEmail(email);
  if (!user || !user.email) {
    return res.json({ ...generic, retryAfterSeconds: Math.ceil(FORGOT_COOLDOWN_MS / 1000) });
  }

  const { plain, expiresAt } = await createPasswordResetToken(user.id);
  try {
    await sendPasswordResetEmail({ to: user.email, email: user.email, token: plain, expiresAt });
  } catch (e) {
    req.log.error({ err: e }, 'Failed to send password reset email');
  }
  return res.json({ ...generic, retryAfterSeconds: Math.ceil(FORGOT_COOLDOWN_MS / 1000) });
});

// POST /auth/reset-password (consume token, set new password, invalidate all sessions)
const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
  password: z.string().min(10).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must contain a letter and a number'),
});
router.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, token, password } = parsed.data;
  const user = await findUserByEmail(email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid or expired reset link' });

  const consumed = await consumePasswordResetToken(user.id, token);
  if (!consumed) return res.status(400).json({ error: 'Invalid or expired reset link' });

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordUpdatedAt: new Date() },
  });

  // Invalidate all existing sessions for security
  await prisma.session.deleteMany({ where: { userId: user.id } });

  req.log.info({ userId: user.id, email: email.toLowerCase() }, 'Password reset completed');
  return res.json({ message: 'Password reset successfully. Please log in with your new password.' });
});

// --- Cookie Helpers ---
import type { Response, Request } from 'express';
const COOKIE_NAME = 'session';
function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 24 * 3600 * 1000,
  });
}
function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}
function readAuthCookie(req: Request) {
  return (req.cookies && req.cookies[COOKIE_NAME]) || null;
}

export { router as authRouter };
