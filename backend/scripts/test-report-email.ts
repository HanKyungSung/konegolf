/**
 * Test script: sends a sample uncompleted bookings report email.
 * Usage: npx ts-node scripts/test-report-email.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { sendUncompletedBookingsEmail } from '../src/services/emailService';

async function main() {
  const testData = {
    to: process.env.GMAIL_USER || 'general@konegolf.ca',
    date: 'Mon, Mar 17, 2026',
    bookings: [
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
    ],
  };

  console.log('Sending test email to:', testData.to);
  console.log('Bookings:', testData.bookings.length);

  await sendUncompletedBookingsEmail(testData);

  console.log('✅ Test email sent! Check your inbox.');
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
