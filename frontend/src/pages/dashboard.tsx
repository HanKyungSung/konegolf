import { Link } from "react-router-dom"
import React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"
import { AdminHeader } from '@/components/AdminHeader'
import { toast } from "@/hooks/use-toast"
import { Ticket } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import POSDashboard from "./pos/dashboard"

const getStatusBadge = (status: 'BOOKED'|'COMPLETED'|'CANCELLED') => {
  switch (status) {
    case 'CANCELLED':
      return { label: 'Cancelled', classes: 'bg-red-500 text-white' }
    case 'COMPLETED':
      return { label: 'Completed', classes: 'bg-slate-600 text-white' }
    default:
      return { label: 'Booked', classes: 'bg-green-500 text-white' }
  }
}

type ApiBooking = {
  id: string;
  roomId: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  players: number;
  price: string | number;
  status: 'BOOKED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus?: 'UNPAID' | 'BILLED' | 'PAID';
  billedAt?: string;
  paidAt?: string;
  paymentMethod?: 'CARD' | 'CASH';
  tipAmount?: number;
};

type ApiRoom = { id: string; name: string; capacity: number };

type ApiCoupon = {
  id: string;
  code: string;
  description: string;
  discountAmount: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  expiresAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  couponType: { name: string; label: string };
};

const CustomerDashboard = () => {
  const { user } = useAuth()
  const [bookings, setBookings] = React.useState<ApiBooking[]>([])
  const [roomsById, setRoomsById] = React.useState<Record<string, ApiRoom>>({})
  const [loading, setLoading] = React.useState(true)
  const [busyIds, setBusyIds] = React.useState<Record<string, boolean>>({})
  const [myCoupons, setMyCoupons] = React.useState<ApiCoupon[]>([])
  const [cancelBookingId, setCancelBookingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const load = async () => {
      try {
        const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
        const [mineRes, roomsRes, couponRes] = await Promise.all([
          fetch(`${apiBase}/api/bookings/mine`, { credentials: 'include' }),
          fetch(`${apiBase}/api/bookings/rooms`, { credentials: 'include' }),
          fetch(`${apiBase}/api/coupons/my`, { credentials: 'include' }),
        ])
        if (mineRes.ok) {
          const data = await mineRes.json()
          const bookingsArray = Array.isArray(data.bookings) ? data.bookings : []
          // Sort by startTime descending (newest first)
          bookingsArray.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          setBookings(bookingsArray)
        } else {
          setBookings([])
        }
        if (roomsRes.ok) {
          const data = await roomsRes.json()
          const rooms: ApiRoom[] = Array.isArray(data.rooms) ? data.rooms : []
          setRoomsById(Object.fromEntries(rooms.map(r => [r.id, r])))
        } else {
          setRoomsById({})
        }
        if (couponRes.ok) {
          const data = await couponRes.json()
          setMyCoupons(Array.isArray(data.coupons) ? data.coupons : [])
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const cancelBookingById = async (id: string) => {
    try {
      setBusyIds((m) => ({ ...m, [id]: true }))
      const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
      const res = await fetch(`${apiBase}/api/bookings/${id}/cancel`, { method: 'PATCH', credentials: 'include' })
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error || 'Failed to cancel booking'
        toast({ title: 'Cancel failed', description: msg })
        return
      }
      const data = await res.json()
      const updated = data.booking as ApiBooking
      setBookings((prev) => prev.map(b => b.id === id ? { ...b, status: updated.status } : b))
      toast({ title: 'Booking canceled', description: 'Your booking has been canceled.' })
    } finally {
      setBusyIds((m) => ({ ...m, [id]: false }))
    }
  }

  // Count only completed bookings (all-time)
  const totalBookings = bookings.filter(b => b.status === 'completed').length
  // Sum only completed bookings in the current month
  const now = new Date()
  const currentMonthSpent = bookings
    .filter(b => b.status === 'completed')
    .filter(b => {
      const dt = new Date(b.startTime)
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
    })
    .reduce((sum, b) => sum + Number(b.price || 0), 0)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black">
      {/* Header */}
      <AdminHeader
        title="K one Golf"
        subtitle="Premium Screen Golf"
        variant="admin"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white">Dashboard</h2>
          <p className="text-slate-400 mt-2">Manage your premium screen golf bookings</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Quick Book</CardTitle>
              <CardDescription className="text-slate-400">Book your next premium screen golf session</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/booking">
                <Button className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold">
                  Book Now
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Total Bookings</CardTitle>
              <CardDescription className="text-slate-400">Your booking history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">{totalBookings}</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Total Spent</CardTitle>
              <CardDescription className="text-slate-400">This month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">
                ${currentMonthSpent.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Coupons */}
        {myCoupons.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center gap-2">
                <Ticket className="h-5 w-5 text-amber-400" />
                My Coupons
              </CardTitle>
              <CardDescription className="text-slate-400">Your reward coupons</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      coupon.status === 'ACTIVE'
                        ? 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10'
                        : 'border-slate-700 bg-slate-800/30 opacity-60'
                    }`}
                    onClick={() => {
                      if (coupon.status === 'ACTIVE') {
                        window.open(`/coupon/${coupon.code}`, '_blank');
                      }
                    }}
                    style={{ cursor: coupon.status === 'ACTIVE' ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-amber-400 font-bold">{coupon.code}</span>
                      <Badge
                        className={
                          coupon.status === 'ACTIVE'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : coupon.status === 'REDEEMED'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }
                        variant="outline"
                      >
                        {coupon.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-300 mb-1">{coupon.description}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-emerald-400">
                        ${Number(coupon.discountAmount).toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {coupon.couponType.label}
                      </span>
                    </div>
                    {coupon.expiresAt && coupon.status === 'ACTIVE' && (
                      <div className="text-xs text-slate-400 mt-2">
                        Expires: {new Date(coupon.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Halifax' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Bookings */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Recent Bookings</CardTitle>
            <CardDescription className="text-slate-400">Your latest premium screen golf reservations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-4 border border-slate-700 rounded-lg hover:bg-slate-700/30 bg-slate-800/30"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-white">{roomsById[booking.roomId]?.name || 'Room'}</h3>
                      {(() => { const b = getStatusBadge(booking.status); return <Badge className={b.classes}>{b.label}</Badge> })()}
                    </div>
                    <div className="text-sm text-slate-400">
                      {new Date(booking.startTime).toLocaleDateString('en-US', { timeZone: 'America/Halifax' })} at {new Date(booking.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Halifax' })} AST • {Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / (60*60*1000))} hour(s)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-white">${Number(booking.price).toFixed(2)}</div>
          {booking.status === 'BOOKED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-red-400/50 text-red-400 hover:bg-red-500/10 bg-transparent"
            disabled={busyIds[booking.id]}
            onClick={() => setCancelBookingId(booking.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Cancel Booking Confirmation */}
      <ConfirmDialog
        open={cancelBookingId !== null}
        onOpenChange={(open) => { if (!open) setCancelBookingId(null); }}
        title="Cancel Booking"
        description={(() => {
          const b = bookings.find(bk => bk.id === cancelBookingId);
          const room = b ? roomsById[b.roomId] : null;
          return b
            ? `Are you sure you want to cancel your booking${room ? ` at ${room.name}` : ''} on ${new Date(b.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Halifax' })}? This action cannot be undone.`
            : 'Are you sure you want to cancel this booking?';
        })()}
        confirmLabel="Cancel Booking"
        loading={cancelBookingId ? busyIds[cancelBookingId] : false}
        onConfirm={() => {
          if (cancelBookingId) {
            cancelBookingById(cancelBookingId);
            setCancelBookingId(null);
          }
        }}
      />
    </div>
  )
}

const DashboardPage = () => {
  const { user } = useAuth()
  
  // Show POS dashboard for ADMIN, STAFF, and SALES; customer dashboard for regular users
  if (user?.role === 'ADMIN' || user?.role === 'STAFF' || user?.role === 'SALES') {
    return <POSDashboard />
  }
  
  return <CustomerDashboard />
}

export default DashboardPage
