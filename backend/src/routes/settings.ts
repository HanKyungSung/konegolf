// Settings API Routes
import { prisma } from '../lib/prisma';
// Provides endpoints for managing system-wide key-value settings
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Helper to parse value based on value_type
function parseSettingValue(value: string, valueType: string): any {
  switch (valueType) {
    case 'number':
      return parseFloat(value);
    case 'boolean':
      return value === 'true';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    case 'string':
    default:
      return value;
  }
}

// Helper to stringify value based on type
function stringifySettingValue(value: any): { value: string; valueType: string } {
  if (typeof value === 'number') {
    return { value: value.toString(), valueType: 'number' };
  } else if (typeof value === 'boolean') {
    return { value: value.toString(), valueType: 'boolean' };
  } else if (typeof value === 'object') {
    return { value: JSON.stringify(value), valueType: 'json' };
  } else {
    return { value: String(value), valueType: 'string' };
  }
}

/**
 * Convenience endpoints for global_tax_rate (POS compatibility)
 * These MUST be defined before the generic /:key routes to avoid route conflicts
 */

/**
 * GET /api/settings/global_tax_rate
 * Get the global tax rate as a number (convenience endpoint for POS)
 */
router.get('/global_tax_rate', async (req: Request, res: Response) => {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'global_tax_rate' },
    });

    if (!setting) {
      // Return default tax rate if not set
      return res.json({ taxRate: 8, key: 'global_tax_rate', default: true });
    }

    const taxRate = parseFloat(setting.value);
    res.json({ taxRate, key: setting.key, updatedAt: setting.updatedAt });
  } catch (error) {
    req.log.error({ err: error }, 'Fetch global_tax_rate failed');
    res.status(500).json({ error: 'Failed to fetch tax rate' });
  }
});

/**
 * PUT /api/settings/global_tax_rate
 * Update the global tax rate (admin only, convenience endpoint for POS)
 */
router.put('/global_tax_rate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { taxRate } = req.body;
    const user = (req as any).user;

    // Only admins can update settings
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Validate tax rate
    if (typeof taxRate !== 'number' || taxRate < 0 || taxRate > 100) {
      return res.status(400).json({ error: 'Tax rate must be a number between 0 and 100' });
    }

    // Upsert the setting
    const updated = await prisma.setting.upsert({
      where: { key: 'global_tax_rate' },
      update: {
        value: taxRate.toString(),
        valueType: 'number',
        updatedBy: user?.id || null,
        updatedAt: new Date(),
      },
      create: {
        key: 'global_tax_rate',
        value: taxRate.toString(),
        valueType: 'number',
        description: 'Global tax rate percentage applied to all bookings',
        category: 'billing',
        isPublic: false,
        updatedBy: user?.id || null,
      },
    });

    req.log.info({ taxRate, updatedBy: user?.id }, 'Tax rate updated');
    res.json({ 
      taxRate: parseFloat(updated.value), 
      key: updated.key, 
      updatedAt: updated.updatedAt,
      message: 'Tax rate updated successfully' 
    });
  } catch (error) {
    req.log.error({ err: error }, 'Update global_tax_rate failed');
    res.status(500).json({ error: 'Failed to update tax rate' });
  }
});

/**
 * GET /api/settings
 * Retrieve all settings (public settings for non-admins, all settings for admins)
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isAdminOrSales = user?.role === 'ADMIN' || user?.role === 'SALES';

    const settings = await prisma.setting.findMany({
      where: isAdminOrSales ? {} : { isPublic: true },
      select: {
        id: true,
        key: true,
        value: true,
        valueType: true,
        description: true,
        category: true,
        isPublic: true,
        updatedAt: true,
        updatedBy: true,
      },
    });

    // Parse values based on their type
    const parsedSettings = settings.map(setting => ({
      ...setting,
      parsedValue: parseSettingValue(setting.value, setting.valueType),
    }));

    res.json(parsedSettings);
  } catch (error) {
    req.log.error({ err: error }, 'Fetch settings failed');
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/settings/:key
 * Retrieve a specific setting by key
 * Public settings can be accessed without authentication
 */
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    
    // Try to get user from auth, but don't require it
    const authHeader = req.headers.authorization;
    const sessionCookie = req.cookies?.session;
    let user = null;
    
    if (authHeader || sessionCookie) {
      // Attempt to authenticate if credentials provided
      // This is a simplified check - you might want to reuse auth middleware logic
      user = (req as any).user;
    }
    
    const isAdminOrSales = user?.role === 'ADMIN' || user?.role === 'SALES';

    const setting = await prisma.setting.findUnique({
      where: { key },
    });

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Public settings can be accessed by anyone
    // Private settings require authentication and admin/sales access
    if (!setting.isPublic) {
      if (!user) {
        return res.status(401).json({ error: 'Authentication required for private settings' });
      }
      if (!isAdminOrSales) {
        return res.status(403).json({ error: 'Admin access required for private settings' });
      }
    }

    res.json({
      ...setting,
      parsedValue: parseSettingValue(setting.value, setting.valueType),
    });
  } catch (error) {
    req.log.error({ err: error, key: req.params.key }, 'Fetch setting failed');
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

/**
 * PUT /api/settings/:key
 * Update a specific setting by key (admin only)
 */
router.put('/:key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value: newValue } = req.body;
    const user = (req as any).user;

    // Only admins can update settings
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find existing setting
    const existingSetting = await prisma.setting.findUnique({
      where: { key },
    });

    if (!existingSetting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Stringify the new value
    const { value: stringValue, valueType } = stringifySettingValue(newValue);

    // Update the setting
    const updatedSetting = await prisma.setting.update({
      where: { key },
      data: {
        value: stringValue,
        valueType,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });

    req.log.info({ key, updatedBy: user.id }, 'Setting updated');
    res.json({
      ...updatedSetting,
      parsedValue: parseSettingValue(updatedSetting.value, updatedSetting.valueType),
    });
  } catch (error) {
    req.log.error({ err: error, key: req.params.key }, 'Update setting failed');
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * POST /api/settings
 * Create a new setting (admin only)
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key, value, description, category, isPublic = false } = req.body;
    const user = (req as any).user;

    // Only admins can create settings
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    // Check if setting already exists
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (existing) {
      return res.status(409).json({ error: 'Setting with this key already exists' });
    }

    // Stringify the value
    const { value: stringValue, valueType } = stringifySettingValue(value);

    // Create the setting
    const newSetting = await prisma.setting.create({
      data: {
        key,
        value: stringValue,
        valueType,
        description,
        category,
        isPublic,
        updatedBy: user.id,
      },
    });

    req.log.info({ key, createdBy: user.id }, 'Setting created');
    res.status(201).json({
      ...newSetting,
      parsedValue: parseSettingValue(newSetting.value, newSetting.valueType),
    });
  } catch (error) {
    req.log.error({ err: error }, 'Create setting failed');
    res.status(500).json({ error: 'Failed to create setting' });
  }
});

/**
 * DELETE /api/settings/:key
 * Delete a setting (admin only)
 */
router.delete('/:key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const user = (req as any).user;

    // Only admins can delete settings
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.setting.delete({
      where: { key },
    });

    req.log.info({ key, deletedBy: user?.id }, 'Setting deleted');
    res.json({ success: true, message: 'Setting deleted' });
  } catch (error) {
    req.log.error({ err: error, key: req.params.key }, 'Delete setting failed');
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

export default router;
