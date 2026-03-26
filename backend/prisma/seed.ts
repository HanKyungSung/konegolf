import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/services/authService';

const prisma = new PrismaClient();

async function main() {
	// Simple seeded random for reproducible results across the entire seed
	let seed = 42;
	const seededRandom = () => {
		seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
		return seed / 0x7fffffff;
	};

	const desiredRooms = [
		{ name: 'Room 1', capacity: 4, active: true },
		{ name: 'Room 2', capacity: 4, active: true },
		{ name: 'Room 3', capacity: 4, active: true },
		{ name: 'Room 4', capacity: 4, active: true },
	];

	for (const r of desiredRooms) {
		await prisma.room.upsert({
			where: { name: r.name },
			update: ({ capacity: r.capacity, active: true, status: 'ACTIVE' } as any),
			create: ({ name: r.name, capacity: r.capacity, active: true, status: 'ACTIVE' } as any),
		});
	}

	// Deactivate any rooms not in the desired list, so frontend only sees these 4
	await prisma.room.updateMany({
		where: { name: { notIn: desiredRooms.map((r) => r.name) } },
		data: { active: false },
	});

	console.log('Seed complete: 4 rooms active (Room 1-4); others deactivated');

	// Seed default settings (idempotent by key)
	const defaultSettings = [
		{
			key: 'global_tax_rate',
			value: '8',
			valueType: 'number',
			description: 'Default tax rate percentage applied to all bookings',
			category: 'tax',
			isPublic: true,
		},
		{
			key: 'operating_hours_open',
			value: '600',
			valueType: 'number',
			description: 'Business opening time in minutes from midnight (600 = 10:00 AM)',
			category: 'hours',
			isPublic: true,
		},
		{
			key: 'operating_hours_close',
			value: '1440',
			valueType: 'number',
			description: 'Business closing time in minutes from midnight (1440 = 12:00 AM)',
			category: 'hours',
			isPublic: true,
		},
	];

	for (const setting of defaultSettings) {
		// Only create if doesn't exist - never overwrite existing values
		const existing = await prisma.setting.findUnique({
			where: { key: setting.key },
		});
		
		if (!existing) {
			await prisma.setting.create({
				data: setting,
			});
			console.log(`Created default setting: ${setting.key} = ${setting.value}`);
		} else {
			console.log(`Setting ${setting.key} already exists (value: ${existing.value}), skipping`);
		}
	}
	console.log('Seeded default settings: global_tax_rate, operating_hours_open, operating_hours_close');

	// Seed menu items (idempotent by ID)
	const defaultMenuItems = [
		// Hours (Room booking time)
		{ id: 'hour-1', name: '1 Hour', description: 'Screen golf room for 1 hour', price: 35.00, category: 'HOURS', hours: 1, available: true, sortOrder: 1 },
		{ id: 'hour-2', name: '2 Hours', description: 'Screen golf room for 2 hours', price: 70.00, category: 'HOURS', hours: 2, available: true, sortOrder: 2 },
		{ id: 'hour-3', name: '3 Hours', description: 'Screen golf room for 3 hours', price: 105.00, category: 'HOURS', hours: 3, available: true, sortOrder: 3 },
		{ id: 'hour-4', name: '4 Hours', description: 'Screen golf room for 4 hours', price: 140.00, category: 'HOURS', hours: 4, available: true, sortOrder: 4 },
		{ id: 'hour-5', name: '5 Hours', description: 'Screen golf room for 5 hours', price: 175.00, category: 'HOURS', hours: 5, available: true, sortOrder: 5 },
		// Food
		{ id: '1', name: 'Club Sandwich', description: 'Triple-decker with turkey, bacon, lettuce, and tomato', price: 12.99, category: 'FOOD', hours: null, available: true, sortOrder: 1 },
		{ id: '2', name: 'Korean Fried Chicken', description: 'Crispy chicken with sweet and spicy sauce', price: 15.99, category: 'FOOD', hours: null, available: true, sortOrder: 2 },
		{ id: '3', name: 'Bulgogi Burger', description: 'Korean-style marinated beef burger with kimchi', price: 14.99, category: 'FOOD', hours: null, available: true, sortOrder: 3 },
		{ id: '4', name: 'Caesar Salad', description: 'Fresh romaine with parmesan and croutons', price: 9.99, category: 'FOOD', hours: null, available: true, sortOrder: 4 },
		// Drinks
		{ id: '5', name: 'Soju', description: 'Korean distilled spirit (Original/Peach/Grape)', price: 8.99, category: 'DRINKS', hours: null, available: true, sortOrder: 1 },
		{ id: '6', name: 'Beer', description: 'Domestic and imported selection', price: 6.99, category: 'DRINKS', hours: null, available: true, sortOrder: 2 },
		{ id: '7', name: 'Soft Drinks', description: 'Coke, Sprite, Fanta, etc.', price: 2.99, category: 'DRINKS', hours: null, available: true, sortOrder: 3 },
		{ id: '8', name: 'Iced Coffee', description: 'Cold brew coffee with ice', price: 4.99, category: 'DRINKS', hours: null, available: true, sortOrder: 4 },
		// Appetizers
		{ id: '9', name: 'Chicken Wings', description: '6 pieces with choice of sauce', price: 10.99, category: 'APPETIZERS', hours: null, available: true, sortOrder: 1 },
		{ id: '10', name: 'French Fries', description: 'Crispy golden fries with ketchup', price: 5.99, category: 'APPETIZERS', hours: null, available: true, sortOrder: 2 },
		{ id: '11', name: 'Mozzarella Sticks', description: '6 pieces with marinara sauce', price: 8.99, category: 'APPETIZERS', hours: null, available: true, sortOrder: 3 },
		// Desserts
		{ id: '12', name: 'Ice Cream', description: 'Vanilla, chocolate, or strawberry', price: 5.99, category: 'DESSERTS', hours: null, available: true, sortOrder: 1 },
	];

	for (const menuItem of defaultMenuItems) {
		await prisma.menuItem.upsert({
			where: { id: menuItem.id },
			update: {
				name: menuItem.name,
				description: menuItem.description,
				price: menuItem.price,
				category: menuItem.category as any,
				hours: menuItem.hours,
				available: menuItem.available,
				sortOrder: menuItem.sortOrder,
			},
			create: menuItem as any,
		});
	}
	console.log(`Seeded ${defaultMenuItems.length} menu items`);

	// Create admin user (idempotent by email)
	// This admin user is used for both web login and POS API authentication
	const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@konegolf.ca';
	const adminName = process.env.SEED_ADMIN_NAME || 'Admin User';
	const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
	const adminPhone = process.env.SEED_ADMIN_PHONE || '+11111111111'; // Quick Sale lookup phone
	
	const existingAdmin = await prisma.user.findFirst({ 
		where: { 
			OR: [
				{ email: adminEmail },
				{ phone: adminPhone }
			]
		} 
	});
	
	if (!existingAdmin) {
		const adminPasswordHash = await hashPassword(adminPassword);
		await prisma.user.create({
			data: {
				email: adminEmail,
				name: adminName,
				phone: adminPhone,
				dateOfBirth: new Date('1985-03-15'),
				passwordHash: adminPasswordHash,
				passwordUpdatedAt: new Date(),
				emailVerifiedAt: new Date(),
				role: 'ADMIN',
				registrationSource: 'ONLINE',
			} as any,
		});
		console.log(`Seeded admin user: ${adminEmail} / ${adminPhone} / ${adminPassword} (role: ADMIN)`);
	} else {
		console.log(`Admin user already exists: ${adminEmail} / ${(existingAdmin as any).phone} (role: ${(existingAdmin as any).role})`);
	}

	// Create superadmin account (idempotent by email)
	const superadminEmail = 'superadmin@konegolf.ca';
	const superadminPhone = '+19025551000';
	const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'superadmin123';
	
	const existingSuperadmin = await prisma.user.findFirst({
		where: {
			OR: [
				{ email: superadminEmail },
				{ phone: superadminPhone }
			]
		}
	});

	if (!existingSuperadmin) {
		const passwordHash = await hashPassword(superadminPassword);
		await prisma.user.create({
			data: {
				email: superadminEmail,
				name: 'Super Admin',
				phone: superadminPhone,
				dateOfBirth: new Date('1985-01-01'),
				passwordHash,
				passwordUpdatedAt: new Date(),
				emailVerifiedAt: new Date(),
				role: 'ADMIN',
				registrationSource: 'ONLINE',
			} as any,
		});
		console.log(`Seeded superadmin user: ${superadminEmail} / ${superadminPhone} (role: ADMIN)`);
	} else {
		// Do NOT override role — it may have been manually changed
		console.log(`Superadmin already exists: ${superadminEmail} / ${superadminPhone} (role: ${(existingSuperadmin as any).role})`);
	}

	// Create sales account (read-only access to dashboards/reports)
	const salesEmail = 'sales@konegolf.ca';
	const salesPhone = '+19025551001';
	const salesPassword = process.env.SEED_SALES_PASSWORD || 'salesaccount123';

	const existingSales = await prisma.user.findFirst({
		where: {
			OR: [
				{ email: salesEmail },
				{ phone: salesPhone }
			]
		}
	});

	if (!existingSales) {
		const passwordHash = await hashPassword(salesPassword);
		await prisma.user.create({
			data: {
				email: salesEmail,
				name: 'Sales',
				phone: salesPhone,
				passwordHash,
				passwordUpdatedAt: new Date(),
				emailVerifiedAt: new Date(),
				role: 'SALES',
				registrationSource: 'ONLINE',
			} as any,
		});
		console.log(`Seeded sales user: ${salesEmail} / ${salesPhone} (role: SALES)`);
	} else {
		console.log(`Sales user already exists: ${salesEmail} / ${salesPhone} (role: ${(existingSales as any).role})`);
	}

	// Create staff account (POS operations — bookings, orders, room control)
	const staffEmail = 'staff@konegolf.ca';
	const staffPhone = '+19025551002';
	const staffPassword = process.env.SEED_STAFF_PASSWORD || 'staffaccount123';

	const existingStaff = await prisma.user.findFirst({
		where: {
			OR: [
				{ email: staffEmail },
				{ phone: staffPhone }
			]
		}
	});

	if (!existingStaff) {
		const passwordHash = await hashPassword(staffPassword);
		await prisma.user.create({
			data: {
				email: staffEmail,
				name: 'Staff',
				phone: staffPhone,
				passwordHash,
				passwordUpdatedAt: new Date(),
				emailVerifiedAt: new Date(),
				role: 'STAFF',
				registrationSource: 'ONLINE',
			} as any,
		});
		console.log(`Seeded staff user: ${staffEmail} / ${staffPhone} (role: STAFF)`);
	} else {
		console.log(`Staff user already exists: ${staffEmail} / ${staffPhone} (role: ${(existingStaff as any).role})`);
	}

	// Create a test user for manual login (idempotent by email)
	// Only in non-production by default. To force in prod/staging, set SEED_ENABLE_TEST_USER=true explicitly.
	const enableTestUser = (process.env.NODE_ENV !== 'production') || process.env.SEED_ENABLE_TEST_USER === 'true';
	if (enableTestUser) {
		const testEmail = process.env.SEED_TEST_EMAIL || 'test@example.com';
		const testName = process.env.SEED_TEST_NAME || 'Test User';
		const testPassword = process.env.SEED_TEST_PASSWORD || 'password123';
		const testPhone = process.env.SEED_TEST_PHONE || '+14165552000'; // Canadian phone format (Toronto area code)
		
		const existing = await prisma.user.findFirst({ 
			where: { 
				OR: [
					{ email: testEmail },
					{ phone: testPhone }
				]
			} 
		});
		
		if (!existing) {
			const passwordHash = await hashPassword(testPassword);
			await prisma.user.create({
				data: {
					email: testEmail,
					name: testName,
					phone: testPhone,
					dateOfBirth: new Date('1995-11-30'),
					passwordHash,
					passwordUpdatedAt: new Date(),
					emailVerifiedAt: new Date(),
					registrationSource: 'ONLINE',
				} as any,
			});
			console.log(`Seeded test user: ${testEmail} / ${testPhone} / ${testPassword}`);
		} else {
			if (!(existing as any).emailVerifiedAt) {
				await prisma.user.update({ 
					where: { id: existing.id }, 
					data: { 
						emailVerifiedAt: new Date(),
						phone: testPhone,
					} 
				});
				console.log(`Marked test user as verified: ${testEmail} / ${testPhone}`);
			} else {
				console.log(`Test user already exists: ${testEmail} / ${testPhone}`);
			}
		}
	} else {
		console.log('Skipping test user seeding (production and SEED_ENABLE_TEST_USER not set).');
	}

	// Seed mock bookings for development/testing
	const enableMockBookings = (process.env.NODE_ENV !== 'production') || process.env.SEED_ENABLE_MOCK_BOOKINGS === 'true';
	if (enableMockBookings) {
		console.log('Seeding mock bookings...');
		
		// Clean existing mock data to prevent overlaps from previous runs
		// Delete in FK order: payments → orders → invoices → bookings
		const deletedPayments = await prisma.payment.deleteMany({});
		const deletedOrders = await prisma.order.deleteMany({});
		const deletedInvoices = await prisma.invoice.deleteMany({});
		const deletedBookings = await prisma.booking.deleteMany({});
		console.log(`Cleaned: ${deletedPayments.count} payments, ${deletedOrders.count} orders, ${deletedInvoices.count} invoices, ${deletedBookings.count} bookings`);
		
		// Get all rooms
		const rooms = await prisma.room.findMany({ where: { active: true } });
		if (rooms.length === 0) {
			console.log('No active rooms found, skipping mock bookings');
		} else {
			// Get admin user for bookings
			const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
			if (!adminUser) {
				console.log('Admin user not found, skipping mock bookings');
			} else {
				// Mock customer data
				const mockCustomers = [
					{ name: 'John Smith', phone: '+14165553001', email: 'john.smith@example.com', dateOfBirth: new Date('1988-05-12') },
					{ name: 'Sarah Johnson', phone: '+14165553002', email: 'sarah.j@example.com', dateOfBirth: new Date('1992-08-23') },
					{ name: 'Michael Brown', phone: '+14165553003', email: 'mbrown@example.com', dateOfBirth: new Date('1985-03-07') },
					{ name: 'Emily Davis', phone: '+14165553004', email: 'emily.davis@example.com', dateOfBirth: new Date('1994-11-15') },
					{ name: 'David Wilson', phone: '+14165553005', email: 'david.w@example.com', dateOfBirth: new Date('1987-01-28') },
					{ name: 'Jennifer Lee', phone: '+14165553006', email: 'jen.lee@example.com', dateOfBirth: new Date('1991-06-19') },
					{ name: 'Robert Taylor', phone: '+14165553007', email: 'robert.t@example.com', dateOfBirth: new Date('1983-09-30') },
					{ name: 'Lisa Anderson', phone: '+14165553008', email: 'lisa.a@example.com', dateOfBirth: new Date('1996-02-14') },
					{ name: 'James Martinez', phone: '+14165553009', email: 'james.m@example.com', dateOfBirth: new Date('1989-12-05') },
					{ name: 'Mary Garcia', phone: '+14165553010', email: 'mary.garcia@example.com', dateOfBirth: new Date('1993-04-17') },
					{ name: 'William Rodriguez', phone: '+14165553011', email: 'will.r@example.com', dateOfBirth: new Date('1986-07-08') },
					{ name: 'Patricia Hernandez', phone: '+14165553012', email: 'patricia.h@example.com', dateOfBirth: new Date('1990-10-22') },
					{ name: 'Thomas Moore', phone: '+14165553013', email: 'thomas.moore@example.com', dateOfBirth: new Date('1984-01-11') },
					{ name: 'Linda Jackson', phone: '+14165553014', email: 'linda.j@example.com', dateOfBirth: new Date('1995-05-26') },
					{ name: 'Christopher White', phone: '+14165553015', email: 'chris.white@example.com', dateOfBirth: new Date('1988-08-03') },
					{ name: 'Barbara Harris', phone: '+14165553016', email: 'barbara.h@example.com', dateOfBirth: new Date('1992-11-09') },
					{ name: 'Daniel Clark', phone: '+14165553017', email: 'daniel.clark@example.com', dateOfBirth: new Date('1987-02-18') },
					{ name: 'Jessica Lewis', phone: '+14165553018', email: 'jessica.l@example.com', dateOfBirth: new Date('1994-06-27') },
					{ name: 'Matthew Robinson', phone: '+14165553019', email: 'matt.r@example.com', dateOfBirth: new Date('1986-09-14') },
					{ name: 'Nancy Walker', phone: '+14165553020', email: 'nancy.w@example.com', dateOfBirth: new Date('1991-12-31') },
					{ name: 'Anthony Young', phone: '+14165553021', email: 'anthony.y@example.com', dateOfBirth: new Date('1989-03-20') },
					{ name: 'Karen Allen', phone: '+14165553022', email: 'karen.allen@example.com', dateOfBirth: new Date('1993-07-04') },
					{ name: 'Mark King', phone: '+14165553023', email: 'mark.king@example.com', dateOfBirth: new Date('1985-10-16') },
					{ name: 'Betty Wright', phone: '+14165553024', email: 'betty.w@example.com', dateOfBirth: new Date('1997-01-25') },
					{ name: 'Paul Lopez', phone: '+14165553025', email: 'paul.lopez@example.com', dateOfBirth: new Date('1990-04-08') },
				];

				// Generate bookings for past 30 days and next 14 days
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const bookingsToCreate: any[] = [];
				
				// Track occupied slots per room per day to avoid overlaps
				// Key: "roomId-YYYY-MM-DD", Value: array of { start: hour, end: hour }
				const occupiedSlots: Map<string, { start: number; end: number }[]> = new Map();
				
				// Helper to check if a time slot is available
				const isSlotAvailable = (roomId: string, date: Date, startHour: number, duration: number): boolean => {
					const dateKey = `${roomId}-${date.toISOString().split('T')[0]}`;
					const slots = occupiedSlots.get(dateKey) || [];
					const endHour = startHour + duration;
					
					for (const slot of slots) {
						// Check overlap: new booking overlaps if it starts before existing ends AND ends after existing starts
						if (startHour < slot.end && endHour > slot.start) {
							return false;
						}
					}
					return true;
				};
				
				// Helper to mark slot as occupied
				const markSlotOccupied = (roomId: string, date: Date, startHour: number, duration: number) => {
					const dateKey = `${roomId}-${date.toISOString().split('T')[0]}`;
					const slots = occupiedSlots.get(dateKey) || [];
					slots.push({ start: startHour, end: startHour + duration });
					occupiedSlots.set(dateKey, slots);
				};
				
				for (let dayOffset = -30; dayOffset <= 14; dayOffset++) {
					const bookingDate = new Date(today);
					bookingDate.setDate(today.getDate() + dayOffset);
					bookingDate.setHours(0, 0, 0, 0);

					// Create 2-4 random bookings per day
					const numBookingsToday = Math.floor(seededRandom() * 3) + 2; // 2-4 bookings
					
					for (let i = 0; i < numBookingsToday; i++) {
						const customer = mockCustomers[Math.floor(seededRandom() * mockCustomers.length)];
						const room = rooms[Math.floor(seededRandom() * rooms.length)];
						
						// Random duration: 1-3 hours
						const duration = Math.floor(seededRandom() * 3) + 1;
						
						// Find an available time slot for this room
						// Try different hours between 9:00 and 21:00 (leaving room for duration)
						const availableHours = [];
						for (let h = 9; h <= 21 - duration; h++) {
							if (isSlotAvailable(room.id, bookingDate, h, duration)) {
								availableHours.push(h);
							}
						}
						
						// Skip if no available slot for this room today
						if (availableHours.length === 0) {
							continue;
						}
						
						// Pick random available hour
						const hour = availableHours[Math.floor(seededRandom() * availableHours.length)];
						const minute = 0; // Keep it simple with full hours
						
						// Mark slot as occupied
						markSlotOccupied(room.id, bookingDate, hour, duration);
						
						const startTime = new Date(bookingDate);
						startTime.setHours(hour, minute, 0, 0);
						
						const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);
						
						// Random players: 1-4
						const players = Math.floor(seededRandom() * 4) + 1;
						
						// Calculate price (base $35/hour)
						const basePrice = duration * 35;
						
						// Status: past bookings are completed, future are booked
						const isPast = startTime < today;
						const bookingStatus = isPast ? 'COMPLETED' : 'BOOKED';
					
					// Payment status: completed bookings are paid, future are unpaid
					const paymentStatus = isPast ? 'PAID' : 'UNPAID';
					
					// Payment details for completed/paid bookings
					const paymentMethod = isPast ? (seededRandom() > 0.5 ? 'CARD' : 'CASH') : null;
					const paidAt = isPast ? endTime : null;
						
						// Random booking source: ONLINE, WALK_IN, or PHONE
						const sources = ['ONLINE', 'WALK_IN', 'PHONE'];
						const bookingSource = sources[Math.floor(seededRandom() * sources.length)];
						
						// Created at: random time before start time
						const createdAt = new Date(startTime.getTime() - seededRandom() * 7 * 24 * 60 * 60 * 1000); // Up to 7 days before
						
					bookingsToCreate.push({
						roomId: room.id,
						userId: null, // Guest bookings have no userId
						customerName: customer.name,
						customerPhone: customer.phone,
						customerEmail: customer.email,
						startTime,
						endTime,
						players,
						price: basePrice,
						bookingStatus,
						paymentStatus,
						paidAt,
						bookingSource: bookingSource,
						createdBy: adminUser.id,
						createdAt,
					});
					}
				}

				// Insert all bookings (data was cleaned above, no duplicates possible)
				for (const booking of bookingsToCreate) {
					await prisma.booking.create({
						data: booking as any,
					});
				}
				
				console.log(`Seeded ${bookingsToCreate.length} mock bookings`);
			}
		}
	} else {
		console.log('Skipping mock bookings seeding (production and SEED_ENABLE_MOCK_BOOKINGS not set).');
	}

	// ============================================
	// Phase 1.3.5: Seed Orders and Invoices (dev/test only)
	// ============================================
	// This creates random mock orders/invoices — must not run in production
	if (enableMockBookings) {
		console.log('\n=== Seeding Orders and Invoices ===');

		// Read actual tax rate from settings
		const taxSetting = await prisma.setting.findUnique({ where: { key: 'global_tax_rate' } });
		const TAX_RATE = taxSetting ? Number(taxSetting.value) / 100 : 0.15; // Convert percentage to decimal
		console.log(`Using tax rate: ${(TAX_RATE * 100).toFixed(1)}%`);

		const HOURLY_RATE = 50;

		// Get all bookings to seed orders/invoices for
		const allBookings = await prisma.booking.findMany({
			include: { invoices: true },
		});

		console.log(`Found ${allBookings.length} bookings to process for orders/invoices`);

		let invoicesCreated = 0;
		let ordersCreated = 0;

		for (const booking of allBookings) {
			// Skip if invoices already exist for this booking
			if (booking.invoices.length > 0) {
				continue;
			}

			// Create empty invoices for each seat (1 per player)
			// Start at $0, orders will be added later
			const invoicesForBooking = [];

			for (let seatIndex = 1; seatIndex <= booking.players; seatIndex++) {
				const invoice = await prisma.invoice.create({
					data: {
						bookingId: booking.id,
						seatIndex,
						subtotal: 0,
						tax: 0,
						tip: null,
						totalAmount: 0,
						status: booking.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
						paymentMethod: booking.paymentStatus === 'PAID' ? (seededRandom() > 0.5 ? 'CARD' : 'CASH') : null,
						paidAt: booking.paymentStatus === 'PAID' ? booking.paidAt : null,
					},
				});
				invoicesForBooking.push(invoice);
				invoicesCreated++;
			}

			// 50% chance to add orders (menu items) for completed bookings
			if (booking.bookingStatus === 'COMPLETED' && seededRandom() > 0.5) {
				const menuItems = await prisma.menuItem.findMany({
					where: {
						available: true,
						category: { in: ['FOOD', 'DRINKS', 'APPETIZERS', 'DESSERTS'] },
					},
				});

				if (menuItems.length > 0) {
					// Add 1-3 random menu items per seat
					for (const invoice of invoicesForBooking) {
						const itemCount = Math.floor(seededRandom() * 3) + 1;
						const selectedItems = menuItems
							.sort(() => seededRandom() - 0.5)
							.slice(0, itemCount);

						for (const item of selectedItems) {
							const quantity = Math.floor(seededRandom() * 2) + 1; // 1-2 of each item
							const order = await prisma.order.create({
								data: {
									bookingId: booking.id,
									menuItemId: item.id,
									seatIndex: invoice.seatIndex,
									quantity,
									unitPrice: Number(item.price),
									totalPrice: Number(item.price) * quantity,
								},
							});
							ordersCreated++;
						}

						// Recalculate invoice totals with orders (no base price)
						const orders = await prisma.order.findMany({
							where: {
								bookingId: booking.id,
								seatIndex: invoice.seatIndex,
							},
						});

						const orderSubtotal = orders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
						const newTax = orderSubtotal * TAX_RATE;
						const newTotal = orderSubtotal + newTax;

						await prisma.invoice.update({
							where: { id: invoice.id },
							data: {
								subtotal: orderSubtotal,
								tax: newTax,
								totalAmount: newTotal,
							},
						});
					}
				}
			}
		}

		console.log(`Seeded ${invoicesCreated} invoices and ${ordersCreated} orders`);
	} else {
		console.log('Skipping mock orders/invoices seeding (production).');
	}
}

main()
	.catch((e) => {
		console.error('Seed error', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
