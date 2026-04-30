import React from 'react';
import { useUiTheme } from '@/hooks/use-ui-theme';
import OldPOSDashboard from './dashboard-old';
import MissionControlDashboard from './dashboard-mission-control';

export default function POSDashboard() {
  const { uiTheme } = useUiTheme();

  return uiTheme === 'classic' ? <OldPOSDashboard /> : <MissionControlDashboard />;
}
