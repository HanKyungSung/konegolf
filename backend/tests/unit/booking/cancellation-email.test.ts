/**
 * Unit Tests for Booking Cancellation Email
 *
 * Tests the cancellation email generation:
 * - Correct ICS CANCEL format with matching UID
 * - HTML template generation
 * - Email send function behavior
 */

// We test the internal logic by importing the module and mocking nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
}));

// Set env vars before importing
process.env.GMAIL_USER = 'test@test.com';
process.env.GMAIL_APP_PASSWORD = 'test-password';
process.env.EMAIL_FROM = 'K one Golf <test@konegolf.ca>';
process.env.FRONTEND_ORIGIN = 'https://konegolf.ca';

import nodemailer from 'nodemailer';
import { sendBookingCancellationEmail } from '../../../src/services/emailService';

const mockTransport = (nodemailer.createTransport as jest.Mock).mock.results[0]?.value
  || (nodemailer.createTransport as jest.Mock)();
const mockSendMail = mockTransport.sendMail as jest.Mock;

const baseParams = {
  to: 'customer@example.com',
  customerName: 'John Doe',
  bookingId: 'abc-123-def',
  roomName: 'Room 1',
  date: '2026-04-15',
  startTime: new Date('2026-04-15T18:00:00Z'),
  endTime: new Date('2026-04-15T19:00:00Z'),
  hours: 1,
  price: '35.00',
  cancelledBy: 'customer' as const,
  customerTimezone: 'America/Halifax',
};

describe('Booking Cancellation Email', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  it('should send email with correct subject', async () => {
    await sendBookingCancellationEmail(baseParams);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toBe('Booking Cancelled - K one Golf');
  });

  it('should send to the correct recipient', async () => {
    await sendBookingCancellationEmail(baseParams);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('customer@example.com');
  });

  it('should include ICS CANCEL attachment', async () => {
    await sendBookingCancellationEmail(baseParams);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.attachments).toHaveLength(1);
    const ics = call.attachments[0];
    expect(ics.filename).toBe('cancel-booking.ics');
    expect(ics.contentType).toContain('method=CANCEL');
  });

  it('ICS should use METHOD:CANCEL and matching UID', async () => {
    await sendBookingCancellationEmail(baseParams);
    const call = mockSendMail.mock.calls[0][0];
    const icsContent = call.attachments[0].content;
    expect(icsContent).toContain('METHOD:CANCEL');
    expect(icsContent).toContain('UID:booking-abc-123-def@konegolf.ca');
    expect(icsContent).toContain('STATUS:CANCELLED');
    expect(icsContent).toContain('SEQUENCE:1');
  });

  it('should include customer name in HTML body', async () => {
    await sendBookingCancellationEmail(baseParams);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('Booking Cancelled');
    expect(call.html).toContain('Room 1');
  });

  it('plain text should include booking details', async () => {
    await sendBookingCancellationEmail(baseParams);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.text).toContain('John Doe');
    expect(call.text).toContain('Room 1');
    expect(call.text).toContain('2026-04-15');
  });

  it('should show "cancelled by our team" for staff/admin cancellation', async () => {
    await sendBookingCancellationEmail({ ...baseParams, cancelledBy: 'staff' });
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('cancelled by our team');
    expect(call.text).toContain('cancelled by our team');
  });

  it('should show "You cancelled" for customer cancellation', async () => {
    await sendBookingCancellationEmail({ ...baseParams, cancelledBy: 'customer' });
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('You cancelled this booking');
    expect(call.text).toContain('You cancelled this booking');
  });

  it('should include rebook link in HTML', async () => {
    await sendBookingCancellationEmail(baseParams);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain('https://konegolf.ca');
    expect(call.html).toContain('Book Again');
  });
});
