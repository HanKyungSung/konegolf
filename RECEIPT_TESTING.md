# Receipt Feature Testing Guide

## Setup

### 1. Environment Variables
Make sure these are set in `backend/.env`:
```bash
GMAIL_USER=general@konegolf.ca
GMAIL_APP_PASSWORD=your-app-specific-password
```

**How to get Google Workspace App Password:**
1. Go to Google Workspace account settings
2. Security → 2-Step Verification → App passwords
3. Generate a new app password for "Mail"
4. Copy the 16-character password

### 2. Start Backend Server
```bash
cd backend
npm run dev
```

### 3. Start Frontend Server
```bash
cd frontend
npm run dev
```

## Testing Methods

### Method 1: Using the Test Page (Easiest)

1. **Open the test page:**
   ```
   http://localhost:5173/receipt-test
   ```

2. **Enter a valid booking ID** (use one from your database)
   - Default: `eb6ee16d-2f0a-4605-a936-116b0b192e39`

3. **Test scenarios:**
   - Click "Load Full Receipt" to see complete receipt
   - Click "Load Seat X Receipt" to see seat-specific receipt
   - Click "Print Full Receipt" to test browser printing
   - Click "Print Seat X" to test seat-specific printing
   - Enter email and click send icon to test email delivery

### Method 2: Using cURL Commands

#### Get Full Receipt
```bash
curl -X GET "http://localhost:8080/api/receipts/YOUR_BOOKING_ID" \
  -H "x-pos-admin-key: pos-dev-key-change-in-production"
```

#### Get Seat Receipt
```bash
curl -X GET "http://localhost:8080/api/receipts/YOUR_BOOKING_ID/seat/1" \
  -H "x-pos-admin-key: pos-dev-key-change-in-production"
```

#### Send Email
```bash
curl -X POST "http://localhost:8080/api/receipts/YOUR_BOOKING_ID/email" \
  -H "Content-Type: application/json" \
  -H "x-pos-admin-key: pos-dev-key-change-in-production" \
  -d '{"email": "test@example.com"}'
```

#### Send Seat-Specific Email
```bash
curl -X POST "http://localhost:8080/api/receipts/YOUR_BOOKING_ID/email" \
  -H "Content-Type: application/json" \
  -H "x-pos-admin-key: pos-dev-key-change-in-production" \
  -d '{"email": "test@example.com", "seatIndex": 1}'
```

### Method 3: Using Browser DevTools Console

1. Open browser console (F12)
2. Run these commands:

```javascript
// Get full receipt
fetch('http://localhost:8080/api/receipts/YOUR_BOOKING_ID', {
  headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
})
.then(r => r.json())
.then(console.log);

// Get seat receipt
fetch('http://localhost:8080/api/receipts/YOUR_BOOKING_ID/seat/1', {
  headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
})
.then(r => r.json())
.then(console.log);

// Send email
fetch('http://localhost:8080/api/receipts/YOUR_BOOKING_ID/email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-pos-admin-key': 'pos-dev-key-change-in-production'
  },
  body: JSON.stringify({ email: 'test@example.com' })
})
.then(r => r.json())
.then(console.log);
```

## What to Test

### ✅ Receipt Generation
- [ ] Full receipt shows all seats and orders
- [ ] Seat-specific receipt shows only that seat
- [ ] Room charge appears correctly
- [ ] Calculations are accurate (subtotal, tax, tip, total)
- [ ] Customer information displays correctly
- [ ] Payment status reflects correctly

### ✅ Printing
- [ ] Print preview shows receipt properly
- [ ] Full receipt print includes all seats
- [ ] Seat-specific print shows only that seat
- [ ] No UI elements (buttons, navigation) appear in print
- [ ] Receipt fits on page (80mm width for thermal printers)
- [ ] Text is readable and properly formatted

### ✅ Email Delivery
- [ ] Email arrives in inbox (check spam folder too)
- [ ] HTML email renders correctly
- [ ] All receipt data appears in email
- [ ] Business branding and contact info show
- [ ] Payment status indicator works
- [ ] Plain text fallback is readable

## Troubleshooting

### Email Not Sending?
- Check `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env`
- Look at backend console logs for errors
- Check Google Workspace app password settings
- Verify the email address is valid

### Receipt Data Missing?
- Ensure booking ID exists in database
- Check that booking has orders/invoices
- Verify menu items are linked properly
- Look at backend console for errors

### Print Not Working?
- Check browser console for JavaScript errors
- Ensure print.css is loaded
- Try Print Preview first (Cmd/Ctrl + P)
- Test with different browsers

### API Errors?
- Verify backend server is running
- Check backend console logs
- Ensure booking ID format is correct (UUID)
- Verify x-pos-admin-key header is included

## Sample Data

If you need test data, create a booking with orders:

```bash
# 1. Create a booking (or use existing)
# 2. Add some orders to it
# 3. Use that booking ID for testing
```

## Next Steps

After testing Phase 1 (regular printer + email):
1. ✅ Verify print works on actual printer (not just preview)
2. ✅ Test email on different email clients (Gmail, Outlook, etc.)
3. 🔮 Plan Phase 2: Thermal printer integration
4. 🔮 Plan Phase 3: Digital receipt portal with QR codes

## Quick Test Checklist

1. [ ] Backend starts without errors
2. [ ] Frontend starts without errors
3. [ ] Can access test page at `/receipt-test`
4. [ ] Can load full receipt
5. [ ] Can load seat-specific receipt
6. [ ] Print preview opens correctly
7. [ ] Full receipt prints all seats
8. [ ] Seat receipt prints only that seat
9. [ ] Email sends successfully
10. [ ] Email arrives and displays correctly
