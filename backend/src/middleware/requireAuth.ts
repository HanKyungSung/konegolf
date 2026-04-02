import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { getSession } from '../services/authService';
import logger from '../lib/logger';


// POS admin API key (for Electron app that can't use cookies)
const POS_ADMIN_KEY = process.env.POS_ADMIN_KEY || 'pos-dev-key-change-in-production';

// Cache for admin user (to avoid repeated DB queries)
let cachedAdminUser: any = null;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Check for POS admin API key in header (for Electron app)
    const apiKey = req.headers['x-pos-admin-key'];
    if (apiKey === POS_ADMIN_KEY) {
      // Fetch the existing admin user from database
      if (!cachedAdminUser) {
        // Try to find admin by email or role
        cachedAdminUser = await prisma.user.findFirst({
          where: { 
            OR: [
              { email: 'admin@kgolf.com' },
              { role: 'ADMIN' }
            ]
          }
        });
        
        if (!cachedAdminUser) {
          return res.status(500).json({ 
            error: 'Admin user not found in database. Please run: npx prisma db seed' 
          });
        }
      }
      
      // Use the existing admin user from database
      (req as any).user = { 
        id: cachedAdminUser.id,
        email: cachedAdminUser.email,
        name: cachedAdminUser.name,
        phone: cachedAdminUser.phone,
        role: cachedAdminUser.role
      };
      return next();
    }

    // Otherwise check for session cookie (web app)
    const token = (req as any).cookies?.session;
    if (!token) return res.status(401).json({ error: 'Unauthenticated' });
    const session = await getSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthenticated' });
    (req as any).user = { 
      id: session.user.id, 
      email: session.user.email, 
      name: (session.user as any).name,
      phone: (session.user as any).phone,
      role: session.user.role 
    };
    (req as any).sessionToken = token;
    return next();
  } catch (e) {
    logger.error({ err: e }, 'requireAuth error');
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = (req as any).cookies?.session;
    if (token) {
      const session = await getSession(token);
      if (session) {
        (req as any).user = { id: session.user.id, email: session.user.email };
        (req as any).sessionToken = token;
      }
    }
  } catch {}
  next();
}
