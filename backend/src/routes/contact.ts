import express from 'express';
import { z } from 'zod';
import { sendContactEmail } from '../services/emailService';

const router = express.Router();

const contactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

/**
 * POST /api/contact
 * Send a contact form message to general@konegolf.ca
 */
router.post('/', async (req, res) => {
  try {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.errors.map(e => e.message) 
      });
    }

    const { firstName, lastName, email, message } = parsed.data;

    await sendContactEmail({
      firstName,
      lastName,
      email,
      message,
    });

    res.json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    req.log.error({ err: error }, 'Contact email send failed');
    res.status(500).json({ error: 'Failed to send contact form' });
  }
});

export default router;
