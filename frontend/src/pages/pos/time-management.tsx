import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AdminHeader } from '@/components/AdminHeader';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listTimeEntries,
  listActiveTimeEntries,
  updateTimeEntry,
  getEmployeeHours,
  type Employee,
  type TimeEntry,
  type EmployeeHoursSummary,
} from '@/services/pos-api';

const TIMEZONE = 'America/Halifax';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: TIMEZONE,
  });
}

function formatDuration(clockIn: string, clockOut: string | null): string {
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  const mins = Math.round((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function getTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

// Week helpers
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1; // Shift so Mon=0
  d.setDate(d.getDate() - diff);
  return d;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TIMEZONE });
  return `${fmt(start)} – ${fmt(end)}`;
}

function getWeekDates(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
  });
}

function getMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface TimeManagementProps {
  onBack: () => void;
}

export default function POSTimeManagement({ onBack }: TimeManagementProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'active' | 'log' | 'weekly' | 'monthly' | 'employees'>('active');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [logEntries, setLogEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters for log
  const [logDate, setLogDate] = useState(getTodayStr());
  const [logEmployeeId, setLogEmployeeId] = useState('');

  // Weekly state
  const [weekStart, setWeekStart] = useState(() => getWeekStart(getTodayStr()));
  const [weeklySummaries, setWeeklySummaries] = useState<EmployeeHoursSummary[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Monthly state
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [monthlySummaries, setMonthlySummaries] = useState<EmployeeHoursSummary[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // Employee form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [resetPinId, setResetPinId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');

  // Edit time entry
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editClockOut, setEditClockOut] = useState('');

  const loadActive = useCallback(async () => {
    try {
      const entries = await listActiveTimeEntries();
      setActiveEntries(entries);
    } catch (err: any) {
      console.error('Failed to load active entries:', err);
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const entries = await listTimeEntries({
        startDate: logDate,
        endDate: logDate,
        employeeId: logEmployeeId || undefined,
      });
      setLogEntries(entries);
    } catch (err: any) {
      console.error('Failed to load log:', err);
    }
  }, [logDate, logEmployeeId]);

  const loadEmployees = useCallback(async () => {
    try {
      const emps = await listEmployees();
      setEmployees(emps);
    } catch (err: any) {
      console.error('Failed to load employees:', err);
    }
  }, []);

  const loadWeekly = useCallback(async () => {
    setWeeklyLoading(true);
    try {
      const dates = getWeekDates(weekStart);
      const result = await getEmployeeHours({ startDate: dates[0], endDate: dates[6] });
      setWeeklySummaries(result.summaries);
    } catch (err: any) {
      console.error('Failed to load weekly:', err);
    } finally {
      setWeeklyLoading(false);
    }
  }, [weekStart]);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    try {
      const { startDate, endDate } = getMonthRange(monthYear.year, monthYear.month);
      const result = await getEmployeeHours({ startDate, endDate });
      setMonthlySummaries(result.summaries);
    } catch (err: any) {
      console.error('Failed to load monthly:', err);
    } finally {
      setMonthlyLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    Promise.all([loadActive(), loadLog(), loadEmployees()])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLog();
  }, [logDate, logEmployeeId]);

  useEffect(() => {
    loadWeekly();
  }, [weekStart]);

  useEffect(() => {
    loadMonthly();
  }, [monthYear]);

  // Poll active entries every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadActive, 30000);
    return () => clearInterval(interval);
  }, [loadActive]);

  const handleAddEmployee = async () => {
    setFormError('');
    if (!newName.trim()) { setFormError('Name is required'); return; }
    if (!/^\d{4,6}$/.test(newPin)) { setFormError('PIN must be 4–6 digits'); return; }

    setFormLoading(true);
    try {
      await createEmployee(newName.trim(), newPin);
      setNewName('');
      setNewPin('');
      setShowAddForm(false);
      await loadEmployees();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      await updateEmployee(emp.id, { active: !emp.active });
      await loadEmployees();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPin = async (empId: string) => {
    if (!/^\d{4,6}$/.test(resetPinValue)) { setFormError('PIN must be 4–6 digits'); return; }
    try {
      await updateEmployee(empId, { pin: resetPinValue });
      setResetPinId(null);
      setResetPinValue('');
      setFormError('');
      await loadEmployees();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleSetClockOut = async (entryId: string) => {
    if (!editClockOut) return;
    try {
      await updateTimeEntry(entryId, { clockOut: new Date(editClockOut).toISOString() });
      setEditingEntry(null);
      setEditClockOut('');
      await Promise.all([loadActive(), loadLog()]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleForceClockOut = async (entryId: string) => {
    try {
      await updateTimeEntry(entryId, { clockOut: new Date().toISOString() });
      await Promise.all([loadActive(), loadLog()]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Compute daily totals for the log
  const dailyTotals = logEntries.reduce<Record<string, number>>((acc, entry) => {
    const name = entry.employee.name;
    const start = new Date(entry.clockIn).getTime();
    const end = entry.clockOut ? new Date(entry.clockOut).getTime() : Date.now();
    const mins = Math.round((end - start) / 60000);
    acc[name] = (acc[name] || 0) + mins;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-300">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <AdminHeader
        title="Time Management"
        subtitle="Employee clock in/out records"
        onBack={onBack}
      />

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 flex-wrap">
          {(['active', 'log', 'weekly', 'monthly', 'employees'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {t === 'active' ? `Active (${activeEntries.length})` : t === 'log' ? 'Daily Log' : t === 'weekly' ? 'Weekly' : t === 'monthly' ? 'Monthly' : 'Employees'}
            </button>
          ))}
        </div>

        {/* ── Active Tab ── */}
        {tab === 'active' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Currently Clocked In</CardTitle>
            </CardHeader>
            <CardContent>
              {activeEntries.length === 0 ? (
                <p className="text-slate-500 text-sm">No one is currently clocked in.</p>
              ) : (
                <div className="space-y-3">
                  {activeEntries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                      <div>
                        <p className="font-semibold">{entry.employee.name}</p>
                        <p className="text-slate-400 text-sm">
                          Since {formatTime(entry.clockIn)} · {formatDuration(entry.clockIn, null)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-900/50 text-green-400 border-green-800">Active</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-orange-400 border-orange-800 hover:bg-orange-900/30"
                          onClick={() => handleForceClockOut(entry.id)}
                        >
                          Force Out
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Daily Log Tab ── */}
        {tab === 'log' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <CardTitle className="text-lg">Daily Log</CardTitle>
                <div className="flex gap-2 ml-auto">
                  <Input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white w-40"
                  />
                  <select
                    value={logEmployeeId}
                    onChange={(e) => setLogEmployeeId(e.target.value)}
                    className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm"
                  >
                    <option value="">All employees</option>
                    {employees.filter(e => e.active).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary */}
              {Object.keys(dailyTotals).length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {Object.entries(dailyTotals).map(([name, mins]) => (
                    <div key={name} className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700">
                      <p className="text-xs text-slate-500">{name}</p>
                      <p className="font-semibold text-sm">{Math.floor(mins / 60)}h {mins % 60}m</p>
                    </div>
                  ))}
                </div>
              )}

              {logEntries.length === 0 ? (
                <p className="text-slate-500 text-sm">No entries for this date.</p>
              ) : (
                <div className="space-y-2">
                  {logEntries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex-1">
                        <span className="font-medium">{entry.employee.name}</span>
                        <span className="text-slate-400 text-sm ml-3">
                          {formatTime(entry.clockIn)} → {entry.clockOut ? formatTime(entry.clockOut) : (
                            <span className="text-yellow-400">Still in</span>
                          )}
                        </span>
                        <span className="text-slate-500 text-sm ml-3">
                          ({formatDuration(entry.clockIn, entry.clockOut)})
                        </span>
                      </div>

                      {/* Edit clock-out for open entries */}
                      {!entry.clockOut && (
                        <div className="flex items-center gap-2">
                          {editingEntry === entry.id ? (
                            <>
                              <Input
                                type="datetime-local"
                                value={editClockOut}
                                onChange={(e) => setEditClockOut(e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white w-44 text-xs"
                              />
                              <Button size="sm" onClick={() => handleSetClockOut(entry.id)}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingEntry(null); setEditClockOut(''); }}>✕</Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-slate-400 border-slate-600"
                              onClick={() => { setEditingEntry(entry.id); setEditClockOut(''); }}
                            >
                              Set Clock Out
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Weekly Tab ── */}
        {tab === 'weekly' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
                    className="text-slate-400 hover:text-white text-lg px-2"
                  >◀</button>
                  <CardTitle className="text-lg">{formatWeekRange(weekStart)}</CardTitle>
                  <button
                    onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
                    className="text-slate-400 hover:text-white text-lg px-2"
                  >▶</button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-slate-300 border-slate-600"
                  onClick={() => {
                    const dates = getWeekDates(weekStart);
                    let csv = 'Employee,Day,Date,Hours\n';
                    for (const s of weeklySummaries) {
                      for (const day of dates) {
                        const dayMins = s.shifts.filter(sh => sh.date === day).reduce((sum, sh) => sum + sh.minutes, 0);
                        if (dayMins > 0) {
                          const dayName = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', timeZone: TIMEZONE });
                          csv += `"${s.employeeName}","${dayName}","${day}","${formatMinutes(dayMins)}"\n`;
                        }
                      }
                      csv += `"${s.employeeName}","TOTAL","","${formatMinutes(s.totalMinutes)}"\n`;
                    }
                    downloadCsv(`hours-${dates[0]}-to-${dates[6]}.csv`, csv);
                  }}
                >
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {weeklyLoading ? (
                <p className="text-slate-500 text-sm">Loading...</p>
              ) : weeklySummaries.length === 0 ? (
                <p className="text-slate-500 text-sm">No hours recorded this week.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-2 px-2 text-slate-400 font-medium">Employee</th>
                        {DAY_NAMES.map(d => (
                          <th key={d} className="text-center py-2 px-2 text-slate-400 font-medium">{d}</th>
                        ))}
                        <th className="text-center py-2 px-2 text-slate-400 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklySummaries.map(s => {
                        const dates = getWeekDates(weekStart);
                        const dayMinutes = dates.map(d =>
                          s.shifts.filter(sh => sh.date === d).reduce((sum, sh) => sum + sh.minutes, 0)
                        );
                        const isOvertime = s.totalMinutes > 40 * 60;
                        return (
                          <tr key={s.employeeId} className="border-b border-slate-700/50">
                            <td className="py-2 px-2 font-medium">{s.employeeName}</td>
                            {dayMinutes.map((mins, i) => {
                              const hasOpen = s.shifts.some(sh => sh.date === dates[i] && sh.isOpen);
                              const isLong = mins > 8 * 60;
                              return (
                                <td key={i} className={`text-center py-2 px-2 ${
                                  mins === 0 ? 'text-slate-600' :
                                  isLong ? 'text-orange-400' : 'text-slate-300'
                                }`}>
                                  {mins === 0 ? '—' : formatMinutes(mins)}
                                  {hasOpen && <span title="Still clocked in"> ⚠️</span>}
                                </td>
                              );
                            })}
                            <td className={`text-center py-2 px-2 font-semibold ${isOvertime ? 'text-red-400' : 'text-white'}`}>
                              {formatMinutes(s.totalMinutes)}
                              {isOvertime && <span title="Overtime (>40h)"> 🔴</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-3 flex gap-4 text-xs text-slate-500">
                    <span>⚠️ = still clocked in</span>
                    <span className="text-orange-400">Orange = shift &gt;8h</span>
                    <span>🔴 = weekly overtime (&gt;40h)</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Monthly Tab ── */}
        {tab === 'monthly' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMonthYear(prev => prev.month === 1 ? { year: prev.year - 1, month: 12 } : { ...prev, month: prev.month - 1 })}
                    className="text-slate-400 hover:text-white text-lg px-2"
                  >◀</button>
                  <CardTitle className="text-lg">{getMonthLabel(monthYear.year, monthYear.month)}</CardTitle>
                  <button
                    onClick={() => setMonthYear(prev => prev.month === 12 ? { year: prev.year + 1, month: 1 } : { ...prev, month: prev.month + 1 })}
                    className="text-slate-400 hover:text-white text-lg px-2"
                  >▶</button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-slate-300 border-slate-600"
                  onClick={() => {
                    const { startDate, endDate } = getMonthRange(monthYear.year, monthYear.month);
                    let csv = 'Employee,Date,Clock In,Clock Out,Duration\n';
                    for (const s of monthlySummaries) {
                      for (const sh of s.shifts) {
                        csv += `"${s.employeeName}","${sh.date}","${new Date(sh.clockIn).toLocaleTimeString('en-US', { timeZone: TIMEZONE })}","${sh.clockOut ? new Date(sh.clockOut).toLocaleTimeString('en-US', { timeZone: TIMEZONE }) : 'Open'}","${formatMinutes(sh.minutes)}"\n`;
                      }
                    }
                    downloadCsv(`hours-${startDate}-to-${endDate}.csv`, csv);
                  }}
                >
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <p className="text-slate-500 text-sm">Loading...</p>
              ) : monthlySummaries.length === 0 ? (
                <p className="text-slate-500 text-sm">No hours recorded this month.</p>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="mb-4 flex flex-wrap gap-3">
                    <div className="bg-slate-900/50 rounded-lg px-4 py-2 border border-slate-700">
                      <p className="text-xs text-slate-500">Total Hours</p>
                      <p className="font-semibold">{formatMinutes(monthlySummaries.reduce((sum, s) => sum + s.totalMinutes, 0))}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg px-4 py-2 border border-slate-700">
                      <p className="text-xs text-slate-500">Total Shifts</p>
                      <p className="font-semibold">{monthlySummaries.reduce((sum, s) => sum + s.shiftCount, 0)}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg px-4 py-2 border border-slate-700">
                      <p className="text-xs text-slate-500">Active Employees</p>
                      <p className="font-semibold">{monthlySummaries.length}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Employee</th>
                          <th className="text-center py-2 px-2 text-slate-400 font-medium">Total Hours</th>
                          <th className="text-center py-2 px-2 text-slate-400 font-medium">Shifts</th>
                          <th className="text-center py-2 px-2 text-slate-400 font-medium">Avg Shift</th>
                          <th className="text-center py-2 px-2 text-slate-400 font-medium">Longest</th>
                          <th className="text-center py-2 px-2 text-slate-400 font-medium">Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlySummaries.map(s => (
                          <tr key={s.employeeId} className="border-b border-slate-700/50">
                            <td className="py-2 px-2 font-medium">{s.employeeName}</td>
                            <td className="text-center py-2 px-2">{formatMinutes(s.totalMinutes)}</td>
                            <td className="text-center py-2 px-2">{s.shiftCount}</td>
                            <td className="text-center py-2 px-2 text-slate-400">{formatMinutes(s.avgShiftMinutes)}</td>
                            <td className={`text-center py-2 px-2 ${s.longestShiftMinutes > 8 * 60 ? 'text-orange-400' : 'text-slate-400'}`}>
                              {formatMinutes(s.longestShiftMinutes)}
                            </td>
                            <td className="text-center py-2 px-2 text-slate-400">{s.daysWorked}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Employees Tab ── */}
        {tab === 'employees' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Employees</CardTitle>
                <Button
                  size="sm"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  {showAddForm ? 'Cancel' : '+ Add Employee'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Add Form */}
              {showAddForm && (
                <div className="mb-4 bg-slate-900/50 rounded-lg p-4 border border-slate-700 space-y-3">
                  <div className="flex gap-3">
                    <Input
                      placeholder="Employee name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                    <Input
                      placeholder="PIN (4–6 digits)"
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="bg-slate-900 border-slate-600 text-white w-40"
                    />
                    <Button onClick={handleAddEmployee} disabled={formLoading}>
                      {formLoading ? '...' : 'Add'}
                    </Button>
                  </div>
                  {formError && <p className="text-red-400 text-xs">{formError}</p>}
                </div>
              )}

              {/* Employee List */}
              <div className="space-y-2">
                {employees.map(emp => (
                  <div key={emp.id} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{emp.name}</span>
                        {emp.pin && (
                          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">PIN: {emp.pin}</span>
                        )}
                        {!emp.pin && (
                          <span className="text-xs text-amber-400">No PIN visible</span>
                        )}
                        {!emp.active && (
                          <Badge variant="outline" className="text-slate-500 border-slate-600">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-slate-300 border-slate-600 hover:bg-slate-700"
                          onClick={() => { setResetPinId(resetPinId === emp.id ? null : emp.id); setResetPinValue(''); setFormError(''); }}
                        >
                          Reset PIN
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={emp.active
                            ? 'text-red-400 border-red-800 hover:bg-red-900/30'
                            : 'text-green-400 border-green-800 hover:bg-green-900/30'
                          }
                          onClick={() => handleToggleActive(emp)}
                        >
                          {emp.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </div>
                    {resetPinId === emp.id && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="New PIN (4–6 digits)"
                            type="text"
                            value={resetPinValue}
                            onChange={(e) => { setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 6)); setFormError(''); }}
                            className="bg-slate-900 border-slate-600 text-white w-48"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => handleResetPin(emp.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => { setResetPinId(null); setFormError(''); }}>Cancel</Button>
                        </div>
                        {formError && <p className="text-red-400 text-xs">{formError}</p>}
                      </div>
                    )}
                  </div>
                ))}
                {employees.length === 0 && (
                  <p className="text-slate-500 text-sm">No employees yet. Add one above.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
