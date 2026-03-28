/**
 * Test script: renders the uncompleted bookings report email to an HTML file for preview.
 * Usage: npx ts-node scripts/test-report-email-preview.ts
 */

// Inline the HTML generation (same as emailService) so we don't need transport
const bookings = [
  {
    customerName: 'John Doe',
    customerPhone: '+19025551234',
    roomName: 'Room 1',
    startTime: '10:00 AM',
    endTime: '12:00 PM',
    paymentStatus: 'UNPAID',
    bookingSource: 'ONLINE',
    bookingId: 'test-001',
  },
  {
    customerName: 'Quick Sale',
    customerPhone: '+11111111111',
    roomName: 'Room 2',
    startTime: '3:23 PM (created)',
    endTime: '',
    paymentStatus: 'UNPAID',
    bookingSource: 'QUICK_SALE',
    bookingId: 'test-002',
  },
  {
    customerName: 'Jane Smith',
    customerPhone: '+19025559876',
    roomName: 'Room 3',
    startTime: '2:00 PM',
    endTime: '4:00 PM',
    paymentStatus: 'PAID',
    bookingSource: 'PHONE',
    bookingId: 'test-003',
  },
  {
    customerName: 'Quick Sale',
    customerPhone: '+11111111111',
    roomName: 'Room 1',
    startTime: '5:45 PM (created)',
    endTime: '',
    paymentStatus: 'UNPAID',
    bookingSource: 'QUICK_SALE',
    bookingId: 'test-004',
  },
];

const date = 'Mon, Mar 17, 2026';
const count = bookings.length;

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
        <a href="https://konegolf.ca/pos" style="color:#f59e0b">Open POS →</a>
      </p>
    </div>
  </div>
</body>
</html>`;

import * as fs from 'fs';
const outPath = __dirname + '/../test-email-preview.html';
fs.writeFileSync(outPath, html);
console.log(`✅ Preview written to: ${outPath}`);
console.log('Open it in your browser to see the email.');
