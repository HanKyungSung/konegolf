/**
 * menu.ts
 * -----------------------------------------
 * Menu item API routes for POS sync operations.
 * Allows POS to pull menu items from backend database.
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireRole';

const router = Router();

/**
 * GET /api/menu/items
 * Fetch all menu items for POS sync
 * Returns menu items sorted by category and sortOrder
 */
router.get('/items', async (req: Request, res: Response) => {
	try {
		const menuItems = await prisma.menuItem.findMany({
			orderBy: [
				{ category: 'asc' },
				{ sortOrder: 'asc' },
			],
		});

		// Convert Prisma types to POS-compatible format
		const items = menuItems.map(item => ({
			id: item.id,
			name: item.name,
			description: item.description,
			price: Number(item.price), // Convert Decimal to number
			category: item.category.toLowerCase(), // HOURS -> hours
			hours: item.hours,
			available: item.available ? 1 : 0, // Convert boolean to integer for SQLite compatibility
			sortOrder: item.sortOrder,
			createdAt: item.createdAt.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
		}));

		res.json({ success: true, items });
	} catch (error: any) {
		req.log.error({ err: error }, 'Fetch menu items failed');
		res.status(500).json({ 
			success: false, 
			error: 'Failed to fetch menu items',
			message: error.message 
		});
	}
});

/**
 * GET /api/menu/items/:id
 * Fetch single menu item by ID
 */
router.get('/items/:id', async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const menuItem = await prisma.menuItem.findUnique({
			where: { id },
		});

		if (!menuItem) {
			return res.status(404).json({ 
				success: false, 
				error: 'Menu item not found' 
			});
		}

		// Convert to POS-compatible format
		const item = {
			id: menuItem.id,
			name: menuItem.name,
			description: menuItem.description,
			price: Number(menuItem.price),
			category: menuItem.category.toLowerCase(),
			hours: menuItem.hours,
			available: menuItem.available ? 1 : 0,
			sortOrder: menuItem.sortOrder,
			createdAt: menuItem.createdAt.toISOString(),
			updatedAt: menuItem.updatedAt.toISOString(),
		};

		res.json({ success: true, item });
	} catch (error: any) {
		req.log.error({ err: error, menuItemId: req.params.id }, 'Fetch menu item failed');
		res.status(500).json({ 
			success: false, 
			error: 'Failed to fetch menu item',
			message: error.message 
		});
	}
});

/**
 * POST /api/menu/items
 * Create a new menu item (admin only)
 */
router.post('/items', requireAuth, requireAdmin, async (req: Request, res: Response) => {
	try {
		const { name, description, price, category, available = true } = req.body;

		// Validation
		if (!name || !category || price === undefined) {
			return res.status(400).json({
				success: false,
				error: 'Missing required fields: name, category, price'
			});
		}

		// Create menu item
		const menuItem = await prisma.menuItem.create({
			data: {
				name,
				description: description || '',
				price,
				category: category.toUpperCase(), // Store as uppercase (FOOD, DRINKS, etc.)
				available: available === true || available === 1,
				sortOrder: 0, // Default sort order
			},
		});

		// Convert to POS-compatible format
		const item = {
			id: menuItem.id,
			name: menuItem.name,
			description: menuItem.description,
			price: Number(menuItem.price),
			category: menuItem.category.toLowerCase(),
			hours: menuItem.hours,
			available: menuItem.available,
			sortOrder: menuItem.sortOrder,
			createdAt: menuItem.createdAt.toISOString(),
			updatedAt: menuItem.updatedAt.toISOString(),
		};

		req.log.info({ menuItemId: menuItem.id, name: menuItem.name, price: Number(menuItem.price), category: menuItem.category }, 'Menu item created');
		res.status(201).json({ success: true, item });
	} catch (error: any) {
		req.log.error({ err: error }, 'Create menu item failed');
		res.status(500).json({
			success: false,
			error: 'Failed to create menu item',
			message: error.message
		});
	}
});

/**
 * PATCH /api/menu/items/:id
 * Update an existing menu item (admin only)
 */
router.patch('/items/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const { name, description, price, category, available } = req.body;

		// Build update data object
		const updateData: any = {};
		if (name !== undefined) updateData.name = name;
		if (description !== undefined) updateData.description = description;
		if (price !== undefined) updateData.price = price;
		if (category !== undefined) updateData.category = category.toUpperCase();
		if (available !== undefined) updateData.available = available === true || available === 1;

		// Update menu item
		const menuItem = await prisma.menuItem.update({
			where: { id },
			data: updateData,
		});

		// Convert to POS-compatible format
		const item = {
			id: menuItem.id,
			name: menuItem.name,
			description: menuItem.description,
			price: Number(menuItem.price),
			category: menuItem.category.toLowerCase(),
			hours: menuItem.hours,
			available: menuItem.available,
			sortOrder: menuItem.sortOrder,
			createdAt: menuItem.createdAt.toISOString(),
			updatedAt: menuItem.updatedAt.toISOString(),
		};

		req.log.info({ menuItemId: id, name: menuItem.name, price: Number(menuItem.price) }, 'Menu item updated');
		res.json({ success: true, item });
	} catch (error: any) {
		req.log.error({ err: error, menuItemId: req.params.id }, 'Update menu item failed');
		
		if (error.code === 'P2025') {
			return res.status(404).json({
				success: false,
				error: 'Menu item not found'
			});
		}

		res.status(500).json({
			success: false,
			error: 'Failed to update menu item',
			message: error.message
		});
	}
});

/**
 * DELETE /api/menu/items/:id
 * Delete a menu item (admin only)
 */
router.delete('/items/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
	try {
		const { id } = req.params;

		await prisma.menuItem.delete({
			where: { id },
		});

		req.log.info({ menuItemId: id }, 'Menu item deleted');
		res.json({ success: true, message: 'Menu item deleted successfully' });
	} catch (error: any) {
		req.log.error({ err: error, menuItemId: req.params.id }, 'Delete menu item failed');

		if (error.code === 'P2025') {
			return res.status(404).json({
				success: false,
				error: 'Menu item not found'
			});
		}

		res.status(500).json({
			success: false,
			error: 'Failed to delete menu item',
			message: error.message
		});
	}
});

export default router;
