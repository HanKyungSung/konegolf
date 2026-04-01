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
  listActivityLog,
  type Employee,
  type TimeEntry,
  type ActivityLogEntry,
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

interface TimeManagementProps {
  onBack: () => void;
}

export default function POSTimeManagement({ onBack }: TimeManagementProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'active' | 'log' | 'activity' | 'employees'>('active');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [logEntries, setLogEntries] = useState<TimeEntry[]>([]);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters for log
  const [logDate, setLogDate] = useState(getTodayStr());
  const [logEmployeeId, setLogEmployeeId] = useState('');

  // Filters for activity log
  const [actDate, setActDate] = useState(getTodayStr());
  const [actEmployeeId, setActEmployeeId] = useState('');
  const [actEntityType, setActEntityType] = useState('');

  // Employee form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

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

  const loadActivity = useCallback(async () => {
    try {
      const result = await listActivityLog({
        startDate: actDate,
        endDate: actDate,
        employeeId: actEmployeeId || undefined,
        entityType: actEntityType || undefined,
        limit: 100,
      });
      setActivityEntries(result.entries);
      setActivityTotal(result.total);
    } catch (err: any) {
      console.error('Failed to load activity log:', err);
    }
  }, [actDate, actEmployeeId, actEntityType]);

  useEffect(() => {
    Promise.all([loadActive(), loadLog(), loadEmployees(), loadActivity()])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLog();
  }, [logDate, logEmployeeId]);

  useEffect(() => {
    loadActivity();
  }, [actDate, actEmployeeId, actEntityType]);

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
        <div className="flex gap-2">
          {(['active', 'log', 'activity', 'employees'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {t === 'active' ? `Active (${activeEntries.length})` : t === 'log' ? 'Daily Log' : t === 'activity' ? 'Activity' : 'Employees'}
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

        {/* ── Activity Log Tab ── */}
        {tab === 'activity' && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <CardTitle className="text-lg">Activity Log</CardTitle>
                <div className="flex gap-2 ml-auto flex-wrap">
                  <Input
                    type="date"
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white w-40"
                  />
                  <select
                    value={actEmployeeId}
                    onChange={(e) => setActEmployeeId(e.target.value)}
                    className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm"
                  >
                    <option value="">All staff</option>
                    {employees.filter(e => e.active).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                  <select
                    value={actEntityType}
                    onChange={(e) => setActEntityType(e.target.value)}
                    className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm"
                  >
                    <option value="">All types</option>
                    <option value="BOOKING">Booking</option>
                    <option value="ORDER">Order</option>
                    <option value="INVOICE">Invoice</option>
                    <option value="MENU_ITEM">Menu Item</option>
                    <option value="COUPON">Coupon</option>
                    <option value="SETTING">Setting</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activityEntries.length === 0 ? (
                <p className="text-slate-500 text-sm">No activity for this date.</p>
              ) : (
                <div className="space-y-2">
                  {activityEntries.map(entry => (
                    <div key={entry.id} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{entry.employeeName || 'Admin'}</span>
                            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                              {entry.action.replace(/_/g, ' ')}
                            </Badge>
                            <Badge className="text-xs bg-slate-700 text-slate-300">
                              {entry.entityType}
                            </Badge>
                          </div>
                          {entry.details && Object.keys(entry.details).length > 0 && (
                            <p className="text-slate-500 text-xs mt-1 truncate">
                              {Object.entries(entry.details)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          {formatTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {activityTotal > activityEntries.length && (
                    <p className="text-slate-500 text-xs text-center pt-2">
                      Showing {activityEntries.length} of {activityTotal} entries
                    </p>
                  )}
                </div>
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
                  <div key={emp.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3 border border-slate-700">
                    <div>
                      <span className="font-medium">{emp.name}</span>
                      {!emp.active && (
                        <Badge variant="outline" className="ml-2 text-slate-500 border-slate-600">Inactive</Badge>
                      )}
                    </div>
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
