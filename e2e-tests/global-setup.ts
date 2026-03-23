import { execSync } from 'child_process';
import path from 'path';

/**
 * Global setup for Playwright E2E tests.
 * Runs the database seed to ensure test data exists before any tests start.
 * 
 * Requires:
 * - Backend running on localhost:8080
 * - Frontend running on localhost:5173
 * - PostgreSQL running with kgolf_app database
 */
async function globalSetup() {
  console.log('\n🌱 Running database seed for E2E tests...');
  
  const backendDir = path.resolve(__dirname, '../backend');

  try {
    // Run seed to ensure rooms, menu items, and admin user exist
    // Uses the npm script which runs tsx directly
    execSync('npm run db:seed:dev', {
      cwd: backendDir,
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 30000,
    });
    console.log('✅ Database seeded successfully');
  } catch (error: any) {
    console.error('⚠️  Seed failed (may already be seeded):', error.stderr?.toString()?.slice(0, 200));
    // Don't fail — seed is idempotent, existing data is fine
  }

  // Verify backend is reachable
  try {
    const res = await fetch('http://localhost:8080/health');
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
    console.log('✅ Backend is reachable');
  } catch {
    throw new Error(
      '❌ Backend is not running on localhost:8080. Start it with: cd backend && npm run dev'
    );
  }

  // Verify frontend is reachable
  try {
    const res = await fetch('http://localhost:5173');
    if (!res.ok) throw new Error(`Frontend returned ${res.status}`);
    console.log('✅ Frontend is reachable');
  } catch {
    throw new Error(
      '❌ Frontend is not running on localhost:5173. Start it with: cd frontend && npm run dev'
    );
  }

  console.log('🚀 E2E test setup complete\n');
}

export default globalSetup;
