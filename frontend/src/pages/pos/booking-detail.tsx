import React from 'react';
import { useUiTheme } from '@/hooks/use-ui-theme';
import OldBookingDetail from './booking-detail-old';
import MissionControlBookingDetail from './booking-detail-mission-control';

interface POSBookingDetailProps {
  bookingId: string;
  onBack: () => void;
}

export default function POSBookingDetail(props: POSBookingDetailProps) {
  const { uiTheme } = useUiTheme();

  return uiTheme === 'classic' ? (
    <OldBookingDetail {...props} />
  ) : (
    <MissionControlBookingDetail {...props} />
  );
}
