import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface PolicyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'booking' | 'cancellation'
}

export function PolicyModal({ open, onOpenChange, type }: PolicyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            {type === 'booking' ? 'Booking Policy' : 'Cancellation Policy'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 text-slate-300">
          {type === 'booking' ? (
            <>
              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Reservation Requirements</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>All bookings must be made through our online booking system or by phone</li>
                  <li>A valid phone number and email address are required for all reservations</li>
                  <li>Players must arrive 10 minutes before their scheduled tee time</li>
                  <li>Late arrivals (more than 15 minutes) may result in reduced playing time or forfeiture</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Advance Booking</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Reservations can be made up to 30 days in advance</li>
                  <li>Same-day bookings are subject to availability</li>
                  <li>We recommend booking at least 24 hours in advance for peak times (evenings and weekends)</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Group Bookings</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Maximum 4 players per simulator bay</li>
                  <li>For groups larger than 8 players, please contact us directly</li>
                  <li>Corporate events and tournaments require advance notice and special arrangements</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Payment Policy</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Payment is due at the end of your session</li>
                  <li>We accept all major credit cards and debit cards</li>
                  <li>Food and beverage orders are charged separately and added to your final bill</li>
                  <li>Walk-in customers may be required to provide a credit card on file</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Facility Rules</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Proper golf attire is recommended (golf shoes optional)</li>
                  <li>No metal spikes allowed on simulators</li>
                  <li>Children under 12 must be supervised by an adult at all times</li>
                  <li>Alcohol consumption is permitted but must be responsible</li>
                  <li>Outside food and beverages are not permitted</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">No-Show Policy</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Failure to show up for a reservation without prior notice may result in booking restrictions</li>
                  <li>Repeated no-shows may result in a deposit requirement for future bookings</li>
                  <li>If you cannot make your reservation, please cancel as soon as possible</li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Cancellation Window</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Free cancellation:</strong> Cancel at least 24 hours before your scheduled start time at no charge</li>
                  <li><strong>Late cancellation (less than 24 hours):</strong> May result in a $25 cancellation fee or booking restrictions</li>
                  <li><strong>Same-day cancellation (within 2 hours):</strong> Subject to a $50 cancellation fee</li>
                  <li><strong>No-show:</strong> Full session charge may apply</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">How to Cancel</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Log into your account and go to "My Bookings"</li>
                  <li>Select the booking you wish to cancel</li>
                  <li>Click the "Cancel Booking" button</li>
                  <li>Alternatively, call us at <span className="text-amber-400">(902) 270-2259</span></li>
                  <li>You will receive a confirmation email once your cancellation is processed</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Modifications</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>You may modify your booking (change time/date) at no charge if done 24+ hours in advance</li>
                  <li>Modifications within 24 hours are subject to availability</li>
                  <li>Adding players to your booking may incur additional charges</li>
                  <li>Contact us to discuss any special circumstances or needs</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Weather & Facility Closures</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>As an indoor facility, we are not affected by weather conditions</li>
                  <li>In case of emergency closures (power outage, equipment failure, etc.), we will contact you immediately</li>
                  <li>Full refunds or rescheduling options will be provided for facility-related cancellations</li>
                  <li>We will make every effort to contact you at least 2 hours before your scheduled time</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Refund Policy</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Refunds for eligible cancellations will be processed within 5-7 business days</li>
                  <li>Refunds will be issued to the original payment method</li>
                  <li>Prepaid packages and gift certificates are non-refundable but may be transferable</li>
                  <li>For disputes or special circumstances, please contact management</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-amber-400 mb-3">Special Circumstances</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Medical emergencies or family emergencies will be handled on a case-by-case basis</li>
                  <li>Please contact us as soon as possible with documentation if applicable</li>
                  <li>We reserve the right to waive cancellation fees at our discretion</li>
                </ul>
              </section>
            </>
          )}

          <div className="border-t border-slate-700 pt-6 mt-6">
            <p className="text-sm text-slate-400">
              <strong className="text-white">Questions?</strong> If you have any questions about our policies or need to discuss special circumstances, 
              please contact us at <a href="mailto:general@konegolf.ca" className="text-amber-400 hover:underline">general@konegolf.ca</a> or 
              call us at <span className="text-amber-400">(902) 270-2259</span>.
            </p>
            <p className="text-xs text-slate-500 mt-4">
              Last updated: January 4, 2026. K one Golf reserves the right to modify these policies at any time. 
              Changes will be posted on our website.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
