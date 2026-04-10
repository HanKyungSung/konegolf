import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import type { ReceiptData } from '../repositories/receiptRepo';
import logger from '../lib/logger';

const log = logger.child({ module: 'email' });

export interface VerificationEmailParams {
  to: string;
  token: string;
  expiresAt: Date;
  email: string; // explicit duplicate
}

export interface ReceiptEmailParams {
  to: string;
  receipt: ReceiptData;
}

export interface BookingConfirmationParams {
  to: string;
  customerName: string;
  bookingId: string;
  roomName: string;
  date: string; // YYYY-MM-DD
  startTime: Date;
  endTime: Date;
  hours: number;
  price: string;
  customerTimezone?: string; // Customer's timezone (e.g., 'America/Halifax')
}

export interface BookingCancellationParams {
  to: string;
  customerName: string;
  bookingId: string;
  roomName: string;
  date: string; // YYYY-MM-DD
  startTime: Date;
  endTime: Date;
  hours: number;
  price: string;
  cancelledBy: 'customer' | 'staff' | 'admin';
  customerTimezone?: string;
}

export interface ContactEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  message: string;
}

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    log.warn('Missing GMAIL_USER/GMAIL_APP_PASSWORD; logging emails only.');
    return null;
  }
  cachedTransport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return cachedTransport;
}

export async function sendVerificationEmail({ to, token, expiresAt, email }: VerificationEmailParams) {
  // Always point verification links to the FRONTEND app
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  // Frontend page will handle POST /api/auth/verify
  const link = `${origin.replace(/\/$/, '')}/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  const subject = 'Your K one Golf sign-in link';
  const text = `Sign in: ${link}\n\nExpires: ${expiresAt.toISOString()}\nIf you did not request this, ignore.`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif"><h2>K one Golf Sign-In</h2><p>Click the button below to sign in. Expires in 15 minutes.</p><p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Verify & Sign In</a></p><p style="font-size:12px;color:#555">If the button doesn't work, use this URL:<br>${link}</p></body></html>`;
  const transport = getTransport();
  if (!transport) {
    log.info({ to, link }, 'Dev-log: verification email (no transport)');
    return;
  }
  await transport.sendMail({ from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>', to, subject, text, html });
}

export interface PasswordResetEmailParams {
  to: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export async function sendPasswordResetEmail({ to, email, token, expiresAt }: PasswordResetEmailParams) {
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const link = `${origin.replace(/\/$/, '')}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  const subject = 'Reset your K one Golf password';
  const text = `Reset your password: ${link}\n\nExpires: ${expiresAt.toISOString()}\nIf you did not request this, ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:20px"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1)"><div style="background:linear-gradient(135deg,#f59e0b 0%,#eab308 100%);padding:24px;text-align:center"><h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">K ONE GOLF</h1><p style="margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:13px">Password Reset</p></div><div style="padding:32px 24px"><p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px">We received a request to reset your password. Click the button below to create a new password. This link expires in 15 minutes.</p><p style="text-align:center;margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Reset Password</a></p><p style="font-size:12px;color:#64748b;margin:20px 0 0;line-height:1.5">If the button doesn't work, copy and paste this URL into your browser:<br><a href="${link}" style="color:#2563eb;word-break:break-all">${link}</a></p><p style="font-size:12px;color:#94a3b8;margin:16px 0 0">If you didn't request a password reset, you can safely ignore this email.</p></div></div></body></html>`;
  const transport = getTransport();
  if (!transport) {
    log.info({ to, link }, 'Dev-log: password reset email (no transport)');
    return;
  }
  await transport.sendMail({ from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>', to, subject, text, html });
}

/**
 * Generate HTML for receipt email
 */
function generateReceiptHTML(receipt: ReceiptData): string {
  const seatRows = receipt.items.seats
    .map(
      (seat) => {
        const hasDiscounts = seat.discounts && seat.discounts.length > 0;
        return `
        <tr>
          <td colspan="3" style="padding: 12px 0 4px 0; font-weight: 600; color: #334155; border-top: 1px solid #e2e8f0;">
            Seat ${seat.seatIndex}
          </td>
        </tr>
        ${seat.orders
          .map(
            (order) => `
          <tr>
            <td style="padding: 4px 8px; color: #475569;">${order.name}</td>
            <td style="padding: 4px 8px; text-align: center; color: #475569;">×${order.quantity}</td>
            <td style="padding: 4px 8px; text-align: right; color: #475569;">$${order.total.toFixed(2)}</td>
          </tr>
        `
          )
          .join('')}
        ${hasDiscounts ? `
          <tr>
            <td colspan="2" style="padding: 4px 8px; color: #64748b; font-size: 12px; border-top: 1px dashed #e2e8f0;">Subtotal</td>
            <td style="padding: 4px 8px; text-align: right; color: #64748b; font-size: 12px; border-top: 1px dashed #e2e8f0;">$${seat.preDiscountSubtotal.toFixed(2)}</td>
          </tr>
          ${seat.discounts
            .map(
              (d) => `
            <tr>
              <td colspan="2" style="padding: 2px 8px; color: #059669; font-size: 12px;">↳ ${d.name}</td>
              <td style="padding: 2px 8px; text-align: right; color: #059669; font-size: 12px;">-$${Math.abs(d.total).toFixed(2)}</td>
            </tr>
          `
            )
            .join('')}
        ` : ''}
      `;
      }
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>K one Golf Receipt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">K ONE GOLF</h1>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Premium Screen Golf</p>
    </div>
    
    <!-- Receipt Content -->
    <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Receipt Number -->
      <div style="text-align: center; padding-bottom: 24px; border-bottom: 2px solid #f1f5f9;">
        <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Receipt</p>
        <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 20px; font-weight: 600;">${receipt.receiptNumber}</p>
      </div>
      
      <!-- Customer Info -->
      <div style="padding: 20px 0; border-bottom: 1px solid #f1f5f9;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Customer:</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; text-align: right; font-weight: 500;">${receipt.customer.name}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Phone:</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; text-align: right; font-weight: 500;">${receipt.customer.phone}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Date:</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; text-align: right; font-weight: 500;">${receipt.booking.date}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Time:</td>
            <td style="padding: 4px 0; color: #0f172a; font-size: 13px; text-align: right; font-weight: 500;">${receipt.booking.startTime} - ${receipt.booking.endTime}</td>
          </tr>
        </table>
      </div>
      
      <!-- Items -->
      <div style="padding: 20px 0;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px; font-weight: 600;">Items</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${receipt.items.roomCharge.total > 0 ? `
          <tr>
            <td style="padding: 8px 0; color: #475569; font-weight: 500;">${receipt.items.roomCharge.description}</td>
            <td style="padding: 8px 0; text-align: center; color: #475569;">×${receipt.items.roomCharge.quantity}</td>
            <td style="padding: 8px 0; text-align: right; color: #0f172a; font-weight: 600;">$${receipt.items.roomCharge.total.toFixed(2)}</td>
          </tr>
          ` : ''}
          ${seatRows}
        </table>
      </div>
      
      <!-- Totals -->
      <div style="padding: 20px 0; border-top: 2px solid #f1f5f9;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Subtotal:</td>
            <td style="padding: 6px 0; text-align: right; color: #0f172a; font-size: 14px; font-weight: 500;">$${receipt.totals.subtotal}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Tax (${receipt.totals.taxRate}%):</td>
            <td style="padding: 6px 0; text-align: right; color: #0f172a; font-size: 14px; font-weight: 500;">$${receipt.totals.tax}</td>
          </tr>
          ${parseFloat(receipt.totals.tip) > 0 ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Tip:</td>
            <td style="padding: 6px 0; text-align: right; color: #0f172a; font-size: 14px; font-weight: 500;">$${receipt.totals.tip}</td>
          </tr>
          ` : ''}
          <tr style="border-top: 2px solid #0f172a;">
            <td style="padding: 12px 0 0 0; color: #0f172a; font-size: 18px; font-weight: 700;">Total:</td>
            <td style="padding: 12px 0 0 0; text-align: right; color: #f59e0b; font-size: 18px; font-weight: 700;">$${receipt.totals.grandTotal}</td>
          </tr>
        </table>
      </div>
      
      <!-- Payment Status -->
      <div style="padding: 16px; background: ${receipt.payment.status === 'PAID' ? '#dcfce7' : '#fef3c7'}; border-radius: 8px; text-align: center; margin-top: 20px;">
        <p style="margin: 0; color: ${receipt.payment.status === 'PAID' ? '#15803d' : '#a16207'}; font-size: 14px; font-weight: 600;">
          ${receipt.payment.status === 'PAID' ? '✓ PAID' : receipt.payment.status === 'PARTIAL' ? '◐ PARTIALLY PAID' : '○ UNPAID'}
        </p>
        ${receipt.payment.method ? `<p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px;">Payment Method: ${receipt.payment.method}</p>` : ''}
      </div>
      
      <!-- Sign-Up CTA -->
      <div style="margin-top: 24px; padding: 24px; background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); border-radius: 12px; text-align: center;">
        <p style="margin: 0 0 8px 0; color: white; font-size: 18px; font-weight: 700;">📱 Book Faster Next Time!</p>
        <p style="margin: 0 0 16px 0; color: rgba(255,255,255,0.95); font-size: 14px;">Create a free account to view your booking history and enjoy a streamlined booking experience.</p>
        <a href="${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/signup" style="display: inline-block; padding: 12px 32px; background: white; color: #f59e0b; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Create Free Account</a>
      </div>
      
      <!-- Footer -->
      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
        <p style="margin: 0; color: #0f172a; font-size: 14px; font-weight: 600;">${receipt.business.name}</p>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px;">${receipt.business.address}</p>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px;">${receipt.business.phone}</p>
        <p style="margin: 16px 0 0 0; color: #94a3b8; font-size: 11px;">Thank you for choosing K one Golf!</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send receipt to customer via email
 */
export async function sendReceiptEmail({ to, receipt }: ReceiptEmailParams) {
  const subject = `K one Golf Receipt - ${receipt.receiptNumber}`;
  const html = generateReceiptHTML(receipt);
  const text = `
K one Golf Receipt
${receipt.receiptNumber}

Customer: ${receipt.customer.name}
Date: ${receipt.booking.date}
Time: ${receipt.booking.startTime} - ${receipt.booking.endTime}

${receipt.items.roomCharge.total > 0 ? `Room Charge: $${receipt.items.roomCharge.total.toFixed(2)}\n` : ''}
${receipt.items.seats.map((seat) => `
Seat ${seat.seatIndex}:
${seat.orders.map((order) => `  ${order.name} ×${order.quantity} - $${order.total.toFixed(2)}`).join('\n')}
`).join('\n')}

Subtotal: $${receipt.totals.subtotal}
Tax (${receipt.totals.taxRate}%): $${receipt.totals.tax}
${parseFloat(receipt.totals.tip) > 0 ? `Tip: $${receipt.totals.tip}\n` : ''}
Total: $${receipt.totals.grandTotal}

Payment Status: ${receipt.payment.status}
${receipt.payment.method ? `Payment Method: ${receipt.payment.method}` : ''}

Thank you for choosing K-Golf!
${receipt.business.name}
${receipt.business.address}
${receipt.business.phone}
  `.trim();

  const transport = getTransport();
  if (!transport) {
    log.info({ to, receiptNumber: receipt.receiptNumber }, 'Dev-log: receipt email (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to,
    subject,
    text,
    html,
  });
}

/**
 * Generate ICS calendar file content
 */
function generateICS(params: BookingConfirmationParams): string {
  const { customerName, bookingId, roomName, startTime, endTime, hours, price } = params;
  
  // Format dates for ICS (YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const now = new Date();
  const dtstamp = formatICSDate(now);
  const dtstart = formatICSDate(startTime);
  const dtend = formatICSDate(endTime);
  
  // Generate UID
  const uid = `booking-${bookingId}@konegolf.ca`;
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//K one Golf//Booking System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:K one Golf - ${roomName}`,
    `DESCRIPTION:Your screen golf booking at K one Golf\\n\\nRoom: ${roomName}\\nDuration: ${hours} hour${hours > 1 ? 's' : ''}\\nPrice: $${price}\\n\\nBooking ID: ${bookingId}\\n\\nAddress: 45 Keltic Dr\\, Unit 6\\, Sydney\\, NS\\nPhone: (902) 270-2259`,
    'LOCATION:K one Golf\\, 45 Keltic Dr\\, Unit 6\\, Sydney\\, NS',
    `ORGANIZER;CN=K one Golf:mailto:${process.env.EMAIL_FROM || 'no-reply@konegolf.ca'}`,
    `ATTENDEE;CN=${customerName};RSVP=TRUE:mailto:${params.to}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:K one Golf booking in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  
  return icsContent;
}

/**
 * Generate HTML for booking confirmation email
 */
function generateBookingConfirmationHTML(params: BookingConfirmationParams): string {
  const { customerName, roomName, date, startTime, endTime, hours, price, customerTimezone } = params;
  
  // Use customer's timezone or default to Halifax
  const tz = customerTimezone || 'America/Halifax';
  
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true,
    timeZone: tz
  });
  
  const formatDate = (dateStr: string) => {
    // Parse date string as UTC to avoid timezone shifts
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: tz
    });
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation - K one Golf</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">K ONE GOLF</h1>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Premium Screen Golf</p>
    </div>
    
    <!-- Confirmation Content -->
    <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Success Message -->
      <div style="text-align: center; padding-bottom: 24px; border-bottom: 2px solid #f1f5f9;">
        <table style="width: 64px; height: 64px; margin: 0 auto 16px; background: #dcfce7; border-radius: 50%;">
          <tr>
            <td style="text-align: center; vertical-align: middle;">
              <span style="font-size: 32px; line-height: 1; color: #15803d;">✓</span>
            </td>
          </tr>
        </table>
        <h2 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 700;">Booking Confirmed!</h2>
        <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">We're excited to see you, ${customerName}!</p>
      </div>
      
      <!-- Booking Details -->
      <div style="padding: 24px 0;">
        <h3 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Booking Details</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td colspan="2" style="padding: 12px 16px; background: #f8fafc; border-radius: 8px 8px 0 0;">
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Room</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${roomName}</p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 12px 16px; background: #f8fafc;">
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Date</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${formatDate(date)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; background: #f8fafc; border-radius: 0 0 0 8px;">
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Time</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${formatTime(startTime)} - ${formatTime(endTime)}</p>
            </td>
            <td style="padding: 12px 16px; background: #f8fafc; border-radius: 0 0 8px 0;">
              <p style="margin: 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${hours} hour${hours > 1 ? 's' : ''}</p>
            </td>
          </tr>
        </table>
        
        <!-- Price -->
        <div style="margin-top: 20px; padding: 16px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #78350f; font-size: 14px; font-weight: 600;">Total Amount</p>
          <p style="margin: 4px 0 0 0; color: #78350f; font-size: 32px; font-weight: 700;">$${price}</p>
          <p style="margin: 4px 0 0 0; color: #92400e; font-size: 12px;">Payment due at the venue</p>
        </div>
      </div>
      
      <!-- Location -->
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px; font-weight: 600;">📍 Location</h3>
        <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.6;">
          <strong>K one Golf</strong><br>
          45 Keltic Dr, Unit 6<br>
          Sydney, NS B1S 1P4<br>
          Phone: (902) 270-2259
        </p>
        <p style="margin: 12px 0 0 0;">
          <a href="https://maps.google.com/?q=45+Keltic+Dr+Unit+6+Sydney+NS" style="color: #f59e0b; text-decoration: none; font-weight: 600; font-size: 14px;">Get Directions →</a>
        </p>
      </div>
      
      <!-- Calendar Attachment Info -->
      <div style="padding: 16px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin-top: 20px;">
        <p style="margin: 0; color: #1e40af; font-size: 14px;">
          <strong>📅 Add to Calendar</strong>
        </p>
        <p style="margin: 4px 0 0 0; color: #3b82f6; font-size: 13px;">
          A calendar file (.ics) is attached. Click it to add this booking to your calendar app.
        </p>
      </div>
      
      <!-- Manage Booking -->
      <div style="margin-top: 24px; text-align: center;">
        <a href="${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/dashboard" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">View My Bookings</a>
      </div>
      
      <!-- Footer -->
      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          Questions? Contact us at (902) 270-2259 or visit our website
        </p>
        <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11px;">
          Hours: 10:00 AM - 12:00 AM Daily
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send booking confirmation email with ICS calendar attachment
 */
export async function sendBookingConfirmation(params: BookingConfirmationParams) {
  const subject = `Booking Confirmed - K one Golf`;
  const html = generateBookingConfirmationHTML(params);
  const icsContent = generateICS(params);
  
  const tz = params.customerTimezone || 'America/Halifax';
  
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true,
    timeZone: tz
  });
  
  const text = `
K one Golf - Booking Confirmation

Hi ${params.customerName},

Your booking has been confirmed!

Booking Details:
- Room: ${params.roomName}
- Date: ${params.date}
- Time: ${formatTime(params.startTime)} - ${formatTime(params.endTime)}
- Duration: ${params.hours} hour${params.hours > 1 ? 's' : ''}
- Total: $${params.price}

Location:
K one Golf
45 Keltic Dr, Unit 6
Sydney, NS B1S 1P4
Phone: (902) 270-2259

A calendar file is attached to help you add this booking to your calendar.

See you soon!

---
K one Golf - Premium Screen Golf
Hours: 10:00 AM - 12:00 AM Daily
  `.trim();

  const transport = getTransport();
  if (!transport) {
    log.info({ to: params.to }, 'Dev-log: booking confirmation (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to: params.to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: 'booking.ics',
        content: icsContent,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST'
      }
    ]
  });
}

/**
 * Generate ICS calendar CANCEL event (removes booking from calendar apps)
 */
function generateCancelICS(params: BookingCancellationParams): string {
  const { customerName, bookingId, roomName, startTime, endTime } = params;

  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const dtstamp = formatICSDate(new Date());
  const dtstart = formatICSDate(startTime);
  const dtend = formatICSDate(endTime);
  // Same UID as confirmation so calendar apps match and remove
  const uid = `booking-${bookingId}@konegolf.ca`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//K one Golf//Booking System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:CANCEL',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:CANCELLED - K one Golf - ${roomName}`,
    `DESCRIPTION:This booking has been cancelled.\\n\\nRoom: ${roomName}\\nBooking ID: ${bookingId}`,
    'LOCATION:K one Golf\\, 45 Keltic Dr\\, Unit 6\\, Sydney\\, NS',
    `ORGANIZER;CN=K one Golf:mailto:${process.env.EMAIL_FROM || 'no-reply@konegolf.ca'}`,
    `ATTENDEE;CN=${customerName};RSVP=TRUE:mailto:${params.to}`,
    'STATUS:CANCELLED',
    'SEQUENCE:1',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Generate HTML for booking cancellation email
 */
function generateBookingCancellationHTML(params: BookingCancellationParams): string {
  const { customerName, roomName, date, startTime, endTime, hours, price, cancelledBy, customerTimezone } = params;

  const tz = customerTimezone || 'America/Halifax';

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz
  });

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    const parsed = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
    return parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: tz
    });
  };

  const cancelNote = cancelledBy === 'customer'
    ? 'You cancelled this booking.'
    : 'This booking was cancelled by our team.';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Cancelled - K one Golf</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">K ONE GOLF</h1>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Premium Screen Golf</p>
    </div>
    
    <!-- Cancellation Content -->
    <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <!-- Cancelled Message -->
      <div style="text-align: center; padding-bottom: 24px; border-bottom: 2px solid #f1f5f9;">
        <table style="width: 64px; height: 64px; margin: 0 auto 16px; background: #fee2e2; border-radius: 50%;">
          <tr>
            <td style="text-align: center; vertical-align: middle;">
              <span style="font-size: 32px; line-height: 1; color: #dc2626;">✕</span>
            </td>
          </tr>
        </table>
        <h2 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 700;">Booking Cancelled</h2>
        <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">${cancelNote}</p>
      </div>
      
      <!-- Booking Details -->
      <div style="padding: 24px 0;">
        <h3 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Cancelled Booking Details</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td colspan="2" style="padding: 12px 16px; background: #fef2f2; border-radius: 8px 8px 0 0;">
              <p style="margin: 0; color: #991b1b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Room</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600; text-decoration: line-through; opacity: 0.7;">${roomName}</p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 12px 16px; background: #fef2f2;">
              <p style="margin: 0; color: #991b1b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Date</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600; text-decoration: line-through; opacity: 0.7;">${formatDate(date)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; background: #fef2f2; border-radius: 0 0 0 8px;">
              <p style="margin: 0; color: #991b1b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Time</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600; text-decoration: line-through; opacity: 0.7;">${formatTime(startTime)} - ${formatTime(endTime)}</p>
            </td>
            <td style="padding: 12px 16px; background: #fef2f2; border-radius: 0 0 8px 0;">
              <p style="margin: 0; color: #991b1b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</p>
              <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600; text-decoration: line-through; opacity: 0.7;">${hours} hour${hours > 1 ? 's' : ''}</p>
            </td>
          </tr>
        </table>
      </div>
      
      <!-- Rebook CTA -->
      <div style="margin-top: 8px; text-align: center;">
        <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px;">Want to book again? We'd love to see you!</p>
        <a href="${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Book Again</a>
      </div>
      
      <!-- Contact -->
      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; margin-top: 24px;">
        <p style="margin: 0; color: #475569; font-size: 14px; text-align: center;">
          Questions about this cancellation? Contact us at <strong>(902) 270-2259</strong>
        </p>
      </div>
      
      <!-- Footer -->
      <div style="margin-top: 16px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          K one Golf · 45 Keltic Dr, Unit 6 · Sydney, NS B1S 1P4
        </p>
        <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11px;">
          Hours: 10:00 AM - 12:00 AM Daily
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send booking cancellation email with ICS calendar CANCEL attachment
 */
export async function sendBookingCancellationEmail(params: BookingCancellationParams) {
  const subject = `Booking Cancelled - K one Golf`;
  const html = generateBookingCancellationHTML(params);
  const icsContent = generateCancelICS(params);

  const tz = params.customerTimezone || 'America/Halifax';

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz
  });

  const cancelNote = params.cancelledBy === 'customer'
    ? 'You cancelled this booking.'
    : 'This booking was cancelled by our team.';

  const text = `
K one Golf - Booking Cancelled

Hi ${params.customerName},

${cancelNote}

Cancelled Booking Details:
- Room: ${params.roomName}
- Date: ${params.date}
- Time: ${formatTime(params.startTime)} - ${formatTime(params.endTime)}
- Duration: ${params.hours} hour${params.hours > 1 ? 's' : ''}

Want to book again? Visit ${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}

Questions? Contact us at (902) 270-2259.

---
K one Golf - Premium Screen Golf
45 Keltic Dr, Unit 6, Sydney, NS B1S 1P4
Hours: 10:00 AM - 12:00 AM Daily
  `.trim();

  const transport = getTransport();
  if (!transport) {
    log.info({ to: params.to, bookingId: params.bookingId }, 'Dev-log: booking cancellation email (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to: params.to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: 'cancel-booking.ics',
        content: icsContent,
        contentType: 'text/calendar; charset=utf-8; method=CANCEL'
      }
    ]
  });
  log.info({ to: params.to, bookingId: params.bookingId }, 'Booking cancellation email sent');
}

/**
 * Send contact form email to general@konegolf.ca
 */
export async function sendContactEmail({ firstName, lastName, email, message }: ContactEmailParams) {
  const to = process.env.CONTACT_EMAIL || 'general@konegolf.ca';
  const subject = `Contact Form: ${firstName} ${lastName}`;
  
  const text = `
New Contact Form Submission

Name: ${firstName} ${lastName}
Email: ${email}

Message:
${message}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact Form Submission</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #eab308 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">New Contact Form</h1>
    </div>
    
    <!-- Content -->
    <div style="background: white; padding: 32px 24px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #334155;">Name:</p>
        <p style="margin: 0; color: #475569;">${firstName} ${lastName}</p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #334155;">Email:</p>
        <p style="margin: 0; color: #475569;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #334155;">Message:</p>
        <p style="margin: 0; color: #475569; white-space: pre-wrap;">${message}</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 20px; text-align: center; color: #64748b; font-size: 12px;">
      <p>This message was sent from the K one Golf contact form.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const transport = getTransport();
  if (!transport) {
    log.info({ from: email }, 'Dev-log: contact form (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to,
    subject,
    text,
    html,
    replyTo: email,
  });
}

// ─── Coupon Email ──────────────────────────────────────────────

export interface CouponEmailParams {
  to: string;
  customerName: string;
  couponCode: string;
  couponType: 'birthday' | 'loyalty' | 'custom' | string;
  description: string;
  discountAmount: number;
  expiresAt?: Date | null;
}

function getCouponEmailContent(type: string): { emoji: string; heading: string; subtext: string } {
  switch (type) {
    case 'birthday':
      return { emoji: '🎂', heading: 'Happy Birthday!', subtext: 'You\'ve earned 1 hour free at K one Golf — tax included!' };
    case 'loyalty':
      return { emoji: '⭐', heading: 'Thank You for Your Loyalty!', subtext: 'You\'ve reached a milestone and earned a reward!' };
    default:
      return { emoji: '🎟️', heading: 'You\'ve Received a Coupon!', subtext: 'Here\'s a special offer just for you!' };
  }
}

export async function sendCouponEmail(params: CouponEmailParams) {
  const { to, customerName, couponCode, couponType, description, discountAmount, expiresAt } = params;
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const couponUrl = `${origin.replace(/\/$/, '')}/coupon/${couponCode}`;
  const { emoji, heading, subtext } = getCouponEmailContent(couponType);

  // Generate QR code as base64 PNG for inline embedding
  const qrDataUrl = await QRCode.toDataURL(couponUrl, {
    width: 200,
    margin: 2,
    color: { dark: '#1e293b', light: '#ffffff' },
  });
  // Convert data URL to buffer for cid attachment
  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrBuffer = Buffer.from(qrBase64, 'base64');

  const expiryLine = expiresAt
    ? `<p style="font-size:13px;color:#94a3b8;margin:12px 0 0;text-align:center">Expires: ${new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Halifax' })}</p>`
    : '';

  const subject = couponType === 'birthday'
    ? `${emoji} Happy Birthday, ${customerName}! 1 Hour Free from K one Golf`
    : couponType === 'loyalty'
      ? `${emoji} Thank you, ${customerName}! You've earned a reward from K one Golf!`
      : `${emoji} ${customerName}, you've received a coupon from K one Golf!`;

  const isBirthday = couponType.toLowerCase() === 'birthday';
  const valueDisplay = isBirthday
    ? '1 Hour Free (Tax Included)'
    : `$${discountAmount.toFixed(2)}`;

  const text = `${heading}\n\nHi ${customerName},\n\n${subtext}\n\n${description}\nValue: ${valueDisplay}\n\nYour coupon code: ${couponCode}\nView your coupon: ${couponUrl}\n\nShow this code or QR to staff to redeem.\n${expiresAt ? `Expires: ${new Date(expiresAt).toLocaleDateString()}\n` : ''}`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:20px;margin:0">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
  <div style="background:linear-gradient(135deg,#f59e0b 0%,#eab308 100%);padding:28px 24px;text-align:center">
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">K ONE GOLF</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:14px">${emoji} ${heading}</p>
  </div>
  <div style="padding:32px 24px;text-align:center">
    <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 8px">Hi <strong>${customerName}</strong>,</p>
    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px">${subtext}</p>
    <div style="background:#fffbeb;border:2px dashed #f59e0b;border-radius:12px;padding:24px;margin:0 0 24px">
      <p style="margin:0 0 4px;font-size:13px;color:#92400e;text-transform:uppercase;letter-spacing:1px;font-weight:600">Your Coupon</p>
      <p style="margin:0 0 12px;font-size:28px;font-weight:800;color:#1e293b;letter-spacing:2px">${couponCode}</p>
      <p style="margin:0 0 4px;font-size:15px;color:#334155;font-weight:600">${description}</p>
      <p style="margin:0;font-size:14px;color:#64748b">Value: <strong>${valueDisplay}</strong></p>
    </div>
    <div style="margin:0 0 24px">
      <p style="font-size:13px;color:#64748b;margin:0 0 12px">Scan QR code to view your coupon:</p>
      <img src="cid:couponQR" alt="Coupon QR Code" width="180" height="180" style="border-radius:8px" />
    </div>
    <a href="${couponUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Coupon</a>
    ${expiryLine}
    <p style="font-size:13px;color:#94a3b8;margin:20px 0 0">Show this code or QR to staff at K one Golf to redeem.</p>
  </div>
</div>
</body></html>`;

  const transport = getTransport();
  if (!transport) {
    log.info({ to, couponCode }, 'Dev-log: coupon email (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to,
    subject,
    text,
    html,
    attachments: [{
      filename: 'coupon-qr.png',
      content: qrBuffer,
      cid: 'couponQR',
    }],
  });
}

// ── Uncompleted Bookings Report Email ──────────────────────────

export interface UncompletedBookingsEmailParams {
  to: string;
  date: string; // e.g. "Mon, Mar 16, 2026"
  bookings: {
    customerName: string;
    customerPhone: string;
    roomName: string;
    startTime: string;
    endTime: string;
    paymentStatus: string;
    bookingSource: string;
    bookingId: string;
  }[];
}

export async function sendUncompletedBookingsEmail({ to, date, bookings }: UncompletedBookingsEmailParams) {
  const count = bookings.length;
  const subject = `[Kone Golf] ${count} Uncompleted Booking${count > 1 ? 's' : ''} from ${date}`;

  const rows = bookings.map((b, i) => {
    const payBadgeColor = b.paymentStatus === 'PAID' ? '#16a34a' : '#dc2626';
    const isQuickSale = b.bookingSource === 'QUICK_SALE';
    const nameBadge = isQuickSale
      ? ` <span style="background:#f97316;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;vertical-align:middle">QUICK SALE</span>`
      : '';
    const timeDisplay = b.endTime ? `${b.startTime} – ${b.endTime}` : b.startTime;
    return `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:10px 12px;color:#334155">${i + 1}</td>
      <td style="padding:10px 12px;color:#334155;font-weight:600">${b.customerName}${nameBadge}</td>
      <td style="padding:10px 12px;color:#334155">${b.customerPhone}</td>
      <td style="padding:10px 12px;color:#334155">${b.roomName}</td>
      <td style="padding:10px 12px;color:#334155">${timeDisplay}</td>
      <td style="padding:10px 12px"><span style="background:${payBadgeColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${b.paymentStatus}</span></td>
    </tr>`;
  }).join('');

  const html = `<!doctype html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#1e293b;padding:24px 32px">
      <h1 style="margin:0;color:#f59e0b;font-size:20px">⚠️ Uncompleted Bookings Report</h1>
      <p style="margin:6px 0 0;color:#94a3b8;font-size:14px">${date} — ${count} booking${count > 1 ? 's' : ''} still in BOOKED status</p>
    </div>
    <div style="padding:24px 32px">
      <p style="color:#475569;font-size:14px;margin:0 0 16px">
        The following booking${count > 1 ? 's were' : ' was'} not marked as completed or cancelled yesterday.
        Please review and update ${count > 1 ? 'their' : 'its'} status.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0">
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">#</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Customer</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Phone</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Room</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Time</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Payment</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
      <p style="margin:0;color:#94a3b8;font-size:12px">
        This is an automated report from Kone Golf POS. 
        <a href="https://konegolf.ca" style="color:#f59e0b">Open POS →</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Uncompleted Bookings Report — ${date}\n\n${count} booking(s) still in BOOKED status:\n\n` +
    bookings.map((b, i) => {
      const source = b.bookingSource === 'QUICK_SALE' ? ' [Quick Sale]' : '';
      const time = b.endTime ? `${b.startTime} – ${b.endTime}` : b.startTime;
      return `${i + 1}. ${b.customerName}${source} | ${b.customerPhone} | ${b.roomName} | ${time} | ${b.paymentStatus}`;
    }).join('\n') +
    '\n\nPlease review and update their status at https://konegolf.ca';

  const transport = getTransport();
  if (!transport) {
    log.info({ to, count, bookings: bookings.map(b => ({ customer: b.customerName, room: b.roomName, time: `${b.startTime} – ${b.endTime}`, payment: b.paymentStatus })) }, 'Dev-log: uncompleted bookings email (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to,
    subject,
    text,
    html,
  });

  log.info({ to, subject, count }, 'Uncompleted bookings email sent successfully');
}

// ============= Shift Report Email =============

export interface ShiftReportEmailParams {
  to: string;
  date: string;
  employees: Array<{
    name: string;
    shifts: Array<{ clockIn: string; clockOut: string | null; hours: number; minutes: number }>;
    totalHours: number;
    totalMinutes: number;
    hasOpenShift: boolean;
  }>;
}

export async function sendShiftReportEmail({ to, date, employees }: ShiftReportEmailParams) {
  const totalEmployees = employees.length;
  const openShifts = employees.filter(e => e.hasOpenShift).length;
  const subject = `[Kone Golf] Daily Shift Report — ${date}`;

  const employeeRows = employees.map(emp => {
    const shiftDetails = emp.shifts.map(s => {
      const clockOut = s.clockOut || '<span style="color:#e53e3e;font-weight:600">Still In</span>';
      return `${s.clockIn} → ${clockOut} (${s.hours}h ${s.minutes}m)`;
    }).join('<br>');

    const warning = emp.hasOpenShift ? ' ⚠️' : '';
    const totalStr = `${emp.totalHours}h ${emp.totalMinutes}m`;

    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:500">${emp.name}${warning}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">${shiftDetails}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;text-align:right">${totalStr}</td>
    </tr>`;
  }).join('');

  const html = `<!doctype html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a202c;margin-bottom:4px">Daily Shift Report</h2>
  <p style="color:#718096;margin-top:0">${date} · ${totalEmployees} employee${totalEmployees !== 1 ? 's' : ''}${openShifts > 0 ? ` · <span style="color:#e53e3e">${openShifts} open shift${openShifts !== 1 ? 's' : ''}</span>` : ''}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr style="background:#f7fafc">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Employee</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Shifts</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Total</th>
      </tr>
    </thead>
    <tbody>
      ${employeeRows}
    </tbody>
  </table>
  <p style="color:#a0aec0;font-size:12px;margin-top:24px">This is an automated report from Kone Golf.</p>
</body>
</html>`;

  const text = `Daily Shift Report — ${date}\n\n${employees.map(e => `${e.name}: ${e.totalHours}h ${e.totalMinutes}m${e.hasOpenShift ? ' (STILL CLOCKED IN)' : ''}`).join('\n')}`;

  const transport = getTransport();
  if (!transport) {
    log.info({ to, date, employees: employees.map(e => ({ name: e.name, total: `${e.totalHours}h ${e.totalMinutes}m`, open: e.hasOpenShift })) }, 'Dev-log: shift report email (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to,
    subject,
    text,
    html,
  });

  log.info({ to, subject, totalEmployees }, 'Shift report email sent successfully');
}

// ============= Weekly Hours Report Email =============

export interface WeeklyHoursEmailParams {
  to: string;
  weekLabel: string; // e.g. "Mar 24 – Mar 30, 2026"
  employees: Array<{
    name: string;
    totalHours: number;
    totalMinutes: number;
    shiftCount: number;
    daysWorked: number;
    isOvertime: boolean;
  }>;
}

export async function sendWeeklyHoursEmail({ to, weekLabel, employees }: WeeklyHoursEmailParams) {
  const totalEmployees = employees.length;
  const overtimeCount = employees.filter(e => e.isOvertime).length;
  const subject = `[Kone Golf] Weekly Hours Report — ${weekLabel}`;

  const employeeRows = employees.map(emp => {
    const totalStr = `${emp.totalHours}h ${emp.totalMinutes}m`;
    const overtimeFlag = emp.isOvertime ? ' <span style="color:#e53e3e">🔴 OT</span>' : '';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:500">${emp.name}${overtimeFlag}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${emp.shiftCount}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${emp.daysWorked}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;text-align:right${emp.isOvertime ? ';color:#e53e3e' : ''}">${totalStr}</td>
    </tr>`;
  }).join('');

  const html = `<!doctype html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a202c;margin-bottom:4px">Weekly Hours Report</h2>
  <p style="color:#718096;margin-top:0">${weekLabel} · ${totalEmployees} employee${totalEmployees !== 1 ? 's' : ''}${overtimeCount > 0 ? ` · <span style="color:#e53e3e">${overtimeCount} overtime</span>` : ''}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr style="background:#f7fafc">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Employee</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Shifts</th>
        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Days</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0;color:#4a5568;font-size:13px">Total</th>
      </tr>
    </thead>
    <tbody>
      ${employeeRows}
    </tbody>
  </table>
  <p style="color:#a0aec0;font-size:12px;margin-top:24px">This is an automated report from Kone Golf. Overtime = &gt;40 hours/week.</p>
</body>
</html>`;

  const text = `Weekly Hours Report — ${weekLabel}\n\n${employees.map(e => `${e.name}: ${e.totalHours}h ${e.totalMinutes}m (${e.shiftCount} shifts, ${e.daysWorked} days)${e.isOvertime ? ' [OVERTIME]' : ''}`).join('\n')}`;

  const transport = getTransport();
  if (!transport) {
    log.info({ to, weekLabel, employees: employees.map(e => ({ name: e.name, total: `${e.totalHours}h ${e.totalMinutes}m`, overtime: e.isOvertime })) }, 'Dev-log: weekly hours email (no transport)');
    return;
  }

  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>',
    to,
    subject,
    text,
    html,
  });

  log.info({ to, subject, totalEmployees }, 'Weekly hours email sent successfully');
}