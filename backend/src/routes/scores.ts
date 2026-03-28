import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import logger from '../lib/logger';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireStaffOrAdmin, requireSalesOrAbove } from '../middleware/requireRole';

const router = Router();

const SCORE_INGEST_KEY = process.env.SCORE_INGEST_KEY || '';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'screenshots');

// Multer config — store in memory, we'll write to disk ourselves
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Validation ──────────────────────────────────────────────

const playerSchema = z.object({
  seat_index: z.number().int().min(1).max(4),
  name: z.string().min(1),
  total_score: z.number().int().min(0).max(300),
  over_par: z.number().int().optional(),
  name_confidence: z.number().min(0).max(1).optional(),
  score_confidence: z.number().min(0).max(1).optional(),
});

const ingestSchema = z.object({
  bay_number: z.number().int().min(1).max(10),
  timestamp: z.string(),
  source_version: z.string().optional(),
  course: z.string().optional(),
  players: z.array(playerSchema).min(1),
  screenshot_url: z.string().url().optional(),
});

// ─── Helper: require ingest key ──────────────────────────────

function requireIngestKey(req: Request, res: Response): boolean {
  if (!SCORE_INGEST_KEY) {
    logger.warn('SCORE_INGEST_KEY not configured — rejecting ingest');
    res.status(500).json({ error: 'Score ingest not configured on server' });
    return false;
  }
  const key = req.headers['x-score-ingest-key'];
  if (key !== SCORE_INGEST_KEY) {
    res.status(401).json({ error: 'Invalid ingest key' });
    return false;
  }
  return true;
}

// ─── Helper: save screenshot to disk ─────────────────────────

function saveScreenshot(buffer: Buffer, bayNumber: number, capturedAt: Date): string {
  const dateStr = capturedAt.toISOString().slice(0, 10); // 2026-03-08
  const timeStr = capturedAt.toISOString().slice(11, 19).replace(/:/g, ''); // 071402
  const dir = path.join(UPLOADS_DIR, String(bayNumber), dateStr);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${timeStr}.jpg`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `screenshots/${bayNumber}/${dateStr}/${filename}`;
}

// ─── Helper: auto-match booking ──────────────────────────────

async function findMatchingBooking(roomId: string, capturedAt: Date) {
  const bookings = await prisma.booking.findMany({
    where: {
      roomId,
      startTime: { lte: capturedAt },
      endTime: { gte: capturedAt },
      bookingStatus: { in: ['BOOKED', 'COMPLETED'] },
    },
  });
  return bookings.length === 1 ? bookings[0] : null;
}

// ─── POST /ingest — bay PC sends OCR results + screenshot ───

router.post('/ingest', upload.single('screenshot'), async (req: Request, res: Response) => {
  if (!requireIngestKey(req, res)) return;

  try {
    // Parse the JSON data — supports both multipart and JSON body
    let data: any;
    if (req.body?.data) {
      data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    } else if (req.body?.bay_number) {
      data = req.body;
    } else {
      return res.status(400).json({ error: 'Missing data payload' });
    }

    const parsed = ingestSchema.safeParse(data);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const payload = parsed.data;
    const capturedAt = new Date(payload.timestamp);

    // Screenshot: use Google Drive URL if provided, otherwise save uploaded file
    let screenshotPath: string | null = null;
    if (payload.screenshot_url) {
      screenshotPath = payload.screenshot_url;
    } else if (req.file) {
      screenshotPath = saveScreenshot(req.file.buffer, payload.bay_number, capturedAt);
    }

    // Look up room by bay number
    const room = await prisma.room.findUnique({ where: { bayNumber: payload.bay_number } });

    // Auto-match booking
    let bookingId: string | null = null;
    if (room) {
      const booking = await findMatchingBooking(room.id, capturedAt);
      if (booking) bookingId = booking.id;
    }

    // Determine status based on confidence
    const confidenceThreshold = 0.7;
    const allConfident = payload.players.every(
      (p) =>
        (p.name_confidence ?? 1) >= confidenceThreshold &&
        (p.score_confidence ?? 1) >= confidenceThreshold
    );
    const status = allConfident ? 'ACTIVE' : 'NEEDS_REVIEW';

    // Create score capture + players in a transaction
    const capture = await prisma.scoreCapture.create({
      data: {
        bayNumber: payload.bay_number,
        roomId: room?.id ?? null,
        bookingId,
        status,
        courseName: payload.course || null,
        screenshotPath,
        sourceVersion: payload.source_version || null,
        rawPayload: data,
        capturedAt,
        players: {
          create: payload.players.map((p) => ({
            seatIndex: p.seat_index,
            ocrName: p.name,
            ocrTotalScore: p.total_score,
            ocrOverPar: p.over_par ?? null,
            nameConfidence: p.name_confidence ?? null,
            scoreConfidence: p.score_confidence ?? null,
          })),
        },
      },
      include: { players: true },
    });

    logger.info({ captureId: capture.id, status, players: capture.players.length }, 'Score ingested');
    return res.status(201).json({
      id: capture.id,
      status: capture.status,
      players: capture.players.length,
      bookingMatched: !!bookingId,
    });
  } catch (err) {
    logger.error({ err }, 'Score ingest failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET / — list scores (paginated) ────────────────────────

router.get('/', requireAuth, requireSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const status = req.query.status as string;
    const bay = req.query.bay ? parseInt(req.query.bay as string) : undefined;

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (bay) where.bayNumber = bay;
    // Exclude soft-deleted by default
    if (!status) where.status = { not: 'DELETED' };

    const [captures, total] = await Promise.all([
      prisma.scoreCapture.findMany({
        where,
        include: {
          players: true,
          room: { select: { id: true, name: true } },
          booking: { select: { id: true, customerName: true, customerPhone: true } },
        },
        orderBy: { capturedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scoreCapture.count({ where }),
    ]);

    return res.json({
      data: captures,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to list scores');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id — score detail ────────────────────────────────

router.get('/:id', requireAuth, requireSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const capture = await prisma.scoreCapture.findUnique({
      where: { id: req.params.id },
      include: {
        players: true,
        room: { select: { id: true, name: true } },
        booking: { select: { id: true, customerName: true, customerPhone: true, startTime: true, endTime: true } },
      },
    });
    if (!capture) return res.status(404).json({ error: 'Score not found' });
    return res.json(capture);
  } catch (err) {
    logger.error({ err }, 'Failed to get score');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/screenshot — serve screenshot image ───────────

router.get('/:id/screenshot', requireAuth, requireSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const capture = await prisma.scoreCapture.findUnique({
      where: { id: req.params.id },
      select: { screenshotPath: true },
    });
    if (!capture?.screenshotPath) return res.status(404).json({ error: 'Screenshot not found' });

    const fullPath = path.join(process.cwd(), 'uploads', capture.screenshotPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Screenshot file missing' });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(fullPath);
  } catch (err) {
    logger.error({ err }, 'Failed to serve screenshot');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id — edit OCR values or mark reviewed ──────────

const patchSchema = z.object({
  status: z.enum(['ACTIVE', 'NEEDS_REVIEW']).optional(),
  courseName: z.string().optional(),
  players: z.array(z.object({
    id: z.string(),
    ocrName: z.string().optional(),
    ocrTotalScore: z.number().int().optional(),
    ocrOverPar: z.number().int().nullable().optional(),
  })).optional(),
}).strict();

router.patch('/:id', requireAuth, requireStaffOrAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }
    const { status, courseName, players } = parsed.data;

    const existing = await prisma.scoreCapture.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Score not found' });

    // Update capture fields
    const captureUpdate: any = {};
    if (status !== undefined) captureUpdate.status = status;
    if (courseName !== undefined) captureUpdate.courseName = courseName;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(captureUpdate).length > 0) {
        await tx.scoreCapture.update({ where: { id: req.params.id }, data: captureUpdate });
      }
      if (players) {
        for (const p of players) {
          const playerUpdate: any = {};
          if (p.ocrName !== undefined) playerUpdate.ocrName = p.ocrName;
          if (p.ocrTotalScore !== undefined) playerUpdate.ocrTotalScore = p.ocrTotalScore;
          if (p.ocrOverPar !== undefined) playerUpdate.ocrOverPar = p.ocrOverPar;
          if (Object.keys(playerUpdate).length > 0) {
            await tx.scoreCapturePlayer.update({ where: { id: p.id }, data: playerUpdate });
          }
        }
      }
    });

    const updated = await prisma.scoreCapture.findUnique({
      where: { id: req.params.id },
      include: { players: true },
    });
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, 'Failed to update score');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id — soft-delete ──────────────────────────────

router.delete('/:id', requireAuth, requireStaffOrAdmin, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.scoreCapture.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Score not found' });

    await prisma.scoreCapture.update({
      where: { id: req.params.id },
      data: { status: 'DELETED' },
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete score');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as scoresRouter };
