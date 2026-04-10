import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { buttonStyles } from "@/styles/buttonStyles"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { todayDateString, VENUE_TIMEZONE } from "@/lib/timezone"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface AdminBooking {
  id: string
  customerName: string
  customerEmail: string
  roomName: string
  date: string
  time: string
  duration: number
  price: number
  status: "confirmed" | "completed" | "cancelled"
}

interface Room {
  id: string
  name: string
  capacity: number
  hourlyRate: number
  status: "available" | "maintenance" | "occupied"
}

const mockBookings: AdminBooking[] = [
  {
    id: "1",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    roomName: "Premium Suite A",
    date: "2024-01-15",
    time: "14:00",
    duration: 2,
    price: 160,
    status: "confirmed",
  },
  {
    id: "2",
    customerName: "Jane Smith",
    customerEmail: "jane@example.com",
    roomName: "Standard Room B",
    date: "2024-01-15",
    time: "16:00",
    duration: 1,
    price: 50,
    status: "confirmed",
  },
  {
    id: "3",
    customerName: "Mike Johnson",
    customerEmail: "mike@example.com",
    roomName: "Group Suite C",
    date: "2024-01-14",
    time: "18:00",
    duration: 3,
    price: 360,
    status: "completed",
  },
]

const mockRooms: Room[] = [
  { id: "1", name: "Premium Suite A", capacity: 4, hourlyRate: 80, status: "available" },
  { id: "2", name: "Standard Room B", capacity: 2, hourlyRate: 50, status: "occupied" },
  { id: "3", name: "Group Suite C", capacity: 8, hourlyRate: 120, status: "available" },
]

export default function AdminPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<AdminBooking[]>(mockBookings)
  const [rooms, setRooms] = useState<Room[]>(mockRooms)
  const [selectedDate, setSelectedDate] = useState<string>(todayDateString())
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null)

  useEffect(() => {
    // In a real app, check if user is admin
    if (!user) {
      navigate('/login')
    }
  }, [user, navigate])

  if (!user) {
    return null
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      case "cancelled":
        return "bg-red-100 text-red-800"
      case "available":
        return "bg-green-100 text-green-800"
      case "occupied":
        return "bg-yellow-100 text-yellow-800"
      case "maintenance":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const updateBookingStatus = (bookingId: string, newStatus: "confirmed" | "completed" | "cancelled") => {
    setBookings((prev) =>
      prev.map((booking) => (booking.id === bookingId ? { ...booking, status: newStatus } : booking)),
    )
  }

  const updateRoomStatus = (roomId: string, newStatus: "available" | "maintenance" | "occupied") => {
    setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, status: newStatus } : room)))
  }

  const todaysBookings = bookings.filter((booking) => booking.date === selectedDate)
  const totalRevenue = bookings
    .filter((booking) => booking.status === "completed")
    .reduce((sum, booking) => sum + booking.price, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
                K one Golf
              </h1>
              <span className="ml-2 text-sm text-slate-400">Admin Panel</span>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-300">Admin: {user.name}</span>
              <Link to="/dashboard">
                <Button
                  variant="outline"
                  className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 bg-transparent"
                >
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={async () => { await logout(); navigate('/'); }}
                className={buttonStyles.headerLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-slate-400 mt-2">Manage bookings, rooms, and operations</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Today's Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">{todaysBookings.length}</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Available Rooms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">
                {rooms.filter((room) => room.status === "available").length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">${totalRevenue}</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Active Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">
                {bookings.filter((booking) => booking.status === "confirmed").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="bookings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 border-slate-700">
            <TabsTrigger
              value="bookings"
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-slate-300"
            >
              Bookings
            </TabsTrigger>
            <TabsTrigger
              value="rooms"
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-slate-300"
            >
              Room Management
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-slate-300"
            >
              Schedule
            </TabsTrigger>
          </TabsList>

          {/* Bookings Tab */}
          <TabsContent value="bookings">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">All Bookings</CardTitle>
                <CardDescription className="text-slate-400">Manage customer bookings and reservations</CardDescription>
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
                          <h3 className="font-medium text-white">{booking.customerName}</h3>
                          <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                        </div>
                        <div className="text-sm text-slate-400">
                          {booking.customerEmail} • {booking.roomName}
                        </div>
                        <div className="text-sm text-slate-400">
                          {new Date(booking.date).toLocaleDateString('en-US', { timeZone: VENUE_TIMEZONE })} at {booking.time} • {booking.duration} hour(s)
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-medium text-white">${booking.price}</div>
                        </div>
                        <div className="flex gap-2">
                          {booking.status === "confirmed" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateBookingStatus(booking.id, "completed")}
                                className="border-green-400/50 text-green-400 hover:bg-green-500/10 bg-transparent"
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCancelBookingId(booking.id)}
                                className="border-red-400/50 text-red-400 hover:bg-red-500/10 bg-transparent"
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Room Management Tab */}
          <TabsContent value="rooms">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Room Management</CardTitle>
                <CardDescription className="text-slate-400">
                  Monitor and manage room status and availability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rooms.map((room) => (
                    <Card key={room.id} className="border-2 bg-slate-800/30 border-slate-700">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg text-white">{room.name}</CardTitle>
                          <Badge className={getStatusColor(room.status)}>{room.status}</Badge>
                        </div>
                        <CardDescription className="text-slate-400">
                          Capacity: {room.capacity} • ${room.hourlyRate}/hour
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <Label htmlFor={`room-${room.id}-status`} className="text-slate-300">
                            Update Status
                          </Label>
                          <Select
                            value={room.status}
                            onValueChange={(value: "available" | "maintenance" | "occupied") =>
                              updateRoomStatus(room.id, value)
                            }
                          >
                            <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              <SelectItem value="available" className="text-white hover:bg-slate-700">
                                Available
                              </SelectItem>
                              <SelectItem value="occupied" className="text-white hover:bg-slate-700">
                                Occupied
                              </SelectItem>
                              <SelectItem value="maintenance" className="text-white hover:bg-slate-700">
                                Maintenance
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Daily Schedule</CardTitle>
                    <CardDescription className="text-slate-400">View bookings by date</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="date-select" className="text-slate-300">
                      Date:
                    </Label>
                    <Input
                      id="date-select"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-auto bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {todaysBookings.length > 0 ? (
                    todaysBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-center justify-between p-4 border border-slate-700 rounded-lg bg-slate-800/30"
                      >
                        <div>
                          <h3 className="font-medium text-white">
                            {booking.time} - {booking.roomName}
                          </h3>
                          <p className="text-sm text-slate-400">
                            {booking.customerName} • {booking.duration} hour(s) • ${booking.price}
                          </p>
                        </div>
                        <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      No bookings scheduled for {new Date(selectedDate).toLocaleDateString('en-US', { timeZone: VENUE_TIMEZONE })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Cancel Booking Confirmation */}
      <ConfirmDialog
        open={cancelBookingId !== null}
        onOpenChange={(open) => { if (!open) setCancelBookingId(null); }}
        title="Cancel Booking"
        description={(() => {
          const b = bookings.find(bk => bk.id === cancelBookingId);
          return b
            ? `Are you sure you want to cancel the booking for ${b.customerName} on ${b.date} at ${b.time}? This action cannot be undone.`
            : 'Are you sure you want to cancel this booking?';
        })()}
        confirmLabel="Cancel Booking"
        onConfirm={() => {
          if (cancelBookingId) {
            updateBookingStatus(cancelBookingId, 'cancelled');
            setCancelBookingId(null);
          }
        }}
      />
    </div>
  )
}
