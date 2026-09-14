'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getHolidays } from '@/lib/holidays';

const ACCENT_COLOR = '#6AB801';
const FARMERS_LOGO = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"%3E%3Ctext x="10" y="45" font-size="32" font-weight="bold" fill="%236AB801" font-family="Arial"%3EFARMERS%3C/text%3E%3Crect x="5" y="50" width="190" height="2" fill="%236AB801"/%3E%3C/svg%3E`;

export default function VacationApp() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [vacationRequests, setVacationRequests] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState('calendar');
  const [newRequest, setNewRequest] = useState({ start: '', end: '', reason: '' });
  
  // Admin states
  const [adminView, setAdminView] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', role: 'Sales', team: 'Randy', allowed_days: 28 });

  // Fetch employees
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase.from('employees').select('*').order('role', { ascending: false }).order('team', { ascending: true }).order('name', { ascending: true });
      setEmployees(data || []);
      if (data && data.length > 0) {
        setSelectedEmployee(data[0]);
      }
    };
    fetchEmployees();
  }, []);

  // Fetch vacation requests when employee changes
  useEffect(() => {
    if (selectedEmployee) {
      const fetchRequests = async () => {
        const { data } = await supabase
          .from('vacation_requests')
          .select('*')
          .eq('employee_id', selectedEmployee.id);
        setVacationRequests(data || []);
      };
      fetchRequests();
    }
  }, [selectedEmployee]);

  const getUsedDays = (year) => {
    const dayInMs = 24 * 60 * 60 * 1000;
    const holidays = getHolidays(year);
    const holidaySet = new Set(holidays.map(h => h.date));

    const approved = vacationRequests.filter(req => {
      const reqYear = new Date(req.start_date).getFullYear();
      return req.status === 'approved' && reqYear === year;
    });

    let used = 0;
    approved.forEach(req => {
      const start = new Date(req.start_date);
      const end = new Date(req.end_date);
      for (let d = new Date(start); d <= end; d.setTime(d.getTime() + dayInMs)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) {
          used++;
        }
      }
    });
    return used;
  };

  const getTotalAvailableDays = () => {
    const year = new Date().getFullYear();
    return selectedEmployee.allowed_days;
  };

  // Admin functions
  const handleAddEmployee = async () => {
    if (!newEmployee.name || !newEmployee.email) {
      alert('Bitte Name und Email eingeben');
      return;
    }

    const { data, error } = await supabase.from('employees').insert([newEmployee]);
    
    if (error) {
      alert('Fehler: ' + error.message);
    } else {
      alert('Mitarbeiter hinzugefügt!');
      setNewEmployee({ name: '', email: '', role: 'Sales', team: 'Randy', allowed_days: 28 });
      
      const { data: updated } = await supabase.from('employees').select('*').order('role', { ascending: false }).order('team', { ascending: true });
      setEmployees(updated || []);
    }
  };

  const handleUpdateEmployee = async (emp) => {
    const { error } = await supabase
      .from('employees')
      .update({ allowed_days: editingEmployee.allowed_days })
      .eq('id', emp.id);

    if (error) {
      alert('Fehler: ' + error.message);
    } else {
      alert('Mitarbeiter aktualisiert!');
      setEditingEmployee(null);
      
      const { data: updated } = await supabase.from('employees').select('*').order('role', { ascending: false }).order('team', { ascending: true });
      setEmployees(updated || []);
    }
  };

  const handleDeleteEmployee = async (emp) => {
    if (confirm(`Wirklich ${emp.name} löschen?`)) {
      const { error } = await supabase.from('employees').delete().eq('id', emp.id);
      
      if (error) {
        alert('Fehler: ' + error.message);
      } else {
        alert('Mitarbeiter gelöscht!');
        
        const { data: updated } = await supabase.from('employees').select('*').order('role', { ascending: false }).order('team', { ascending: true });
        setEmployees(updated || []);
      }
    }
  };

  const handleApprove = async (requestId) => {
    await supabase.from('vacation_requests').update({ status: 'approved' }).eq('id', requestId);
    const { data } = await supabase.from('vacation_requests').select('*').eq('employee_id', selectedEmployee.id);
    setVacationRequests(data || []);
  };

  const handleReject = async (requestId) => {
    await supabase.from('vacation_requests').update({ status: 'rejected' }).eq('id', requestId);
    const { data } = await supabase.from('vacation_requests').select('*').eq('employee_id', selectedEmployee.id);
    setVacationRequests(data || []);
  };

  const handleSubmitRequest = async () => {
    if (!newRequest.start || !newRequest.end) {
      alert('Bitte Datum auswählen');
      return;
    }

    await supabase.from('vacation_requests').insert([{
      employee_id: selectedEmployee.id,
      start_date: newRequest.start,
      end_date: newRequest.end,
      reason: newRequest.reason || 'Keine Angabe',
      status: 'pending',
    }]);

    setNewRequest({ start: '', end: '', reason: '' });
    const { data } = await supabase.from('vacation_requests').select('*').eq('employee_id', selectedEmployee.id);
    setVacationRequests(data || []);
  };

  if (!selectedEmployee) return <div style={{ padding: '20px', textAlign: 'center', color: ACCENT_COLOR }}>Laden...</div>;

  const isManager = selectedEmployee.role === 'Manager';
  const isLead = selectedEmployee.role === 'Team Lead';
  const isRegularEmployee = selectedEmployee.role === 'Sales';
  const canSeeAdminPanel = isManager || isLead;

  const holidays = getHolidays(currentMonth.getFullYear());
  const isHoliday = (date) => holidays.some(h => h.date === date);
  const getHolidayName = (date) => holidays.find(h => h.date === date)?.name || '';

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const calendarDays = [];
  for (let i = 1; i <= getDaysInMonth(currentMonth); i++) {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    calendarDays.push(dateStr);
  }

  const getDayStatus = (dateStr) => {
    const dayOfWeek = new Date(dateStr).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend';
    if (isHoliday(dateStr)) return 'holiday';

    const approved = vacationRequests.filter(r => r.status === 'approved');
    for (let req of approved) {
      const start = new Date(req.start_date);
      const end = new Date(req.end_date);
      const current = new Date(dateStr);
      if (current >= start && current <= end) return 'vacation';
    }
    return 'working';
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#fff',
        borderBottom: `3px solid ${ACCENT_COLOR}`,
        padding: '20px 30px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src={FARMERS_LOGO} alt="Farmers" style={{ height: '40px' }} />
            <h1 style={{ margin: 0, fontSize: '24px', color: ACCENT_COLOR, fontWeight: 'bold' }}>
              Urlaubsverwaltung
            </h1>
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            Excellence since 1993
          </div>
        </div>
      </header>

      {/* Mitarbeiter-Selector */}
      <div style={{
        backgroundColor: '#fff',
        borderBottom: `1px solid #e0e0e0`,
        padding: '15px 30px',
        overflowX: 'auto',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {employees.map(emp => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmployee(emp)}
                style={{
                  padding: '10px 15px',
                  border: `2px solid ${selectedEmployee?.id === emp.id ? ACCENT_COLOR : '#ddd'}`,
                  backgroundColor: selectedEmployee?.id === emp.id ? `${ACCENT_COLOR}15` : '#fff',
                  color: selectedEmployee?.id === emp.id ? ACCENT_COLOR : '#333',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: selectedEmployee?.id === emp.id ? '600' : '500',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                }}
              >
                {emp.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px' }}>
        {/* Statistik-Karten */}
        {(isManager || isLead || isRegularEmployee) && !adminView && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '30px',
          }}>
            <div style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              borderLeft: `4px solid ${ACCENT_COLOR}`,
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Verfügbare Tage</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: ACCENT_COLOR }}>
                {getTotalAvailableDays()}
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              borderLeft: `4px solid ${ACCENT_COLOR}`,
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Genutzte Tage</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: ACCENT_COLOR }}>
                {getUsedDays(new Date().getFullYear())}
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              borderLeft: `4px solid ${ACCENT_COLOR}`,
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Verbleibend</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: ACCENT_COLOR }}>
                {getTotalAvailableDays() - getUsedDays(new Date().getFullYear())}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {!adminView && (
            <>
              <button
                onClick={() => setView('calendar')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  backgroundColor: view === 'calendar' ? ACCENT_COLOR : '#fff',
                  color: view === 'calendar' ? '#fff' : '#333',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  boxShadow: view === 'calendar' ? `0 4px 12px ${ACCENT_COLOR}40` : '0 2px 4px rgba(0,0,0,0.08)',
                  transition: 'all 0.2s',
                }}
              >
                📅 Kalender
              </button>

              <button
                onClick={() => setView('requests')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  backgroundColor: view === 'requests' ? ACCENT_COLOR : '#fff',
                  color: view === 'requests' ? '#fff' : '#333',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  boxShadow: view === 'requests' ? `0 4px 12px ${ACCENT_COLOR}40` : '0 2px 4px rgba(0,0,0,0.08)',
                  transition: 'all 0.2s',
                }}
              >
                📝 Anträge
              </button>

              {isManager && (
                <button
                  onClick={() => setView('team')}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    backgroundColor: view === 'team' ? ACCENT_COLOR : '#fff',
                    color: view === 'team' ? '#fff' : '#333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    boxShadow: view === 'team' ? `0 4px 12px ${ACCENT_COLOR}40` : '0 2px 4px rgba(0,0,0,0.08)',
                    transition: 'all 0.2s',
                  }}
                >
                  👥 Team
                </button>
              )}
            </>
          )}

          {/* Admin Button */}
          {canSeeAdminPanel && (
            <button
              onClick={() => setAdminView(adminView ? null : 'dashboard')}
              style={{
                marginLeft: adminView ? 0 : 'auto',
                padding: '12px 24px',
                border: `2px solid ${ACCENT_COLOR}`,
                backgroundColor: adminView ? ACCENT_COLOR : '#fff',
                color: adminView ? '#fff' : ACCENT_COLOR,
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                transition: 'all 0.2s',
              }}
            >
              ⚙️ Admin Panel
            </button>
          )}
        </div>

        {/* ADMIN PANEL */}
        {adminView === 'dashboard' && canSeeAdminPanel && (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Mitarbeiterverwaltung */}
            <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 20px 0', color: ACCENT_COLOR }}>Mitarbeiterverwaltung</h3>

              {/* Neuer Mitarbeiter */}
              <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#333' }}>Neuen Mitarbeiter hinzufügen</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                  <input
                    type="text"
                    placeholder="Name"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  />
                  <select
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                    style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  >
                    <option value="Sales">Mitarbeiter</option>
                    <option value="Team Lead">Team Lead</option>
                  </select>
                  <select
                    value={newEmployee.team}
                    onChange={(e) => setNewEmployee({ ...newEmployee, team: e.target.value })}
                    style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  >
                    <option value="Randy">Team Randy</option>
                    <option value="Daniel">Team Daniel</option>
                    <option value="Kai">Team Kai</option>
                    <option value="Management">Management</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Urlaubstage"
                    value={newEmployee.allowed_days}
                    onChange={(e) => setNewEmployee({ ...newEmployee, allowed_days: parseInt(e.target.value) })}
                    style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  />
                </div>
                <button
                  onClick={handleAddEmployee}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: ACCENT_COLOR,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                  }}
                >
                  ➕ Hinzufügen
                </button>
              </div>

              {/* Mitarbeiterliste */}
              <h4 style={{ margin: '0 0 15px 0', color: '#333' }}>Mitarbeiterliste</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px',
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Role</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Team</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Tage</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px' }}>{emp.name}</td>
                        <td style={{ padding: '10px' }}>{emp.email}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            backgroundColor: emp.role === 'Manager' ? '#e3f2fd' : emp.role === 'Team Lead' ? '#f3e5f5' : '#e8f5e9',
                            color: emp.role === 'Manager' ? '#1976d2' : emp.role === 'Team Lead' ? '#7b1fa2' : '#388e3c',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                          }}>
                            {emp.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>{emp.team}</td>
                        <td style={{ padding: '10px' }}>
                          {editingEmployee?.id === emp.id ? (
                            <input
                              type="number"
                              value={editingEmployee.allowed_days}
                              onChange={(e) => setEditingEmployee({ ...editingEmployee, allowed_days: parseInt(e.target.value) })}
                              style={{ width: '50px', padding: '5px', borderRadius: '4px', border: '1px solid #ddd' }}
                            />
                          ) : (
                            <span>{emp.allowed_days}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {editingEmployee?.id === emp.id ? (
                              <>
                                <button
                                  onClick={() => handleUpdateEmployee(emp)}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: '#4caf50',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => setEditingEmployee(null)}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: '#999',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditingEmployee(emp)}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: ACCENT_COLOR,
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(emp)}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: '#f44336',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Statistiken */}
            <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 20px 0', color: ACCENT_COLOR }}>Statistiken</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>Gesamt Mitarbeiter</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: ACCENT_COLOR }}>{employees.length}</div>
                </div>
                <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>Ausstehende Anträge</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: ACCENT_COLOR }}>
                    {vacationRequests.filter(r => r.status === 'pending').length}
                  </div>
                </div>
                <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>Genehmigte Anträge</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: ACCENT_COLOR }}>
                    {vacationRequests.filter(r => r.status === 'approved').length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {view === 'calendar' && (
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>←</button>
              <h3 style={{ margin: 0, color: ACCENT_COLOR, fontSize: '18px', fontWeight: '600' }}>
                {currentMonth.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>→</button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '1px',
              backgroundColor: '#e0e0e0',
              padding: '1px',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                <div key={day} style={{
                  backgroundColor: '#f5f5f5',
                  padding: '10px',
                  fontWeight: '600',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: '#666',
                }}>
                  {day}
                </div>
              ))}

              {Array(((getFirstDayOfMonth(currentMonth) - 1 + 7) % 7)).fill(null).map((_, i) => (
                <div key={`empty-${i}`} style={{ backgroundColor: '#fff' }} />
              ))}

              {calendarDays.map(dateStr => {
                const status = getDayStatus(dateStr);
                let bgColor = '#fff';
                let textColor = '#333';
                let borderColor = '#e0e0e0';

                if (status === 'weekend') {
                  bgColor = '#f5f5f5';
                  textColor = '#999';
                } else if (status === 'holiday') {
                  bgColor = `${ACCENT_COLOR}20`;
                  textColor = ACCENT_COLOR;
                  borderColor = ACCENT_COLOR;
                } else if (status === 'vacation') {
                  bgColor = ACCENT_COLOR;
                  textColor = '#fff';
                }

                return (
                  <div
                    key={dateStr}
                    style={{
                      backgroundColor: bgColor,
                      padding: '12px 8px',
                      borderBottom: `2px solid ${borderColor}`,
                      minHeight: '60px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      textAlign: 'center',
                      cursor: status === 'holiday' ? 'help' : 'default',
                      title: status === 'holiday' ? getHolidayName(dateStr) : '',
                    }}
                  >
                    <div style={{ fontWeight: '600', color: textColor, fontSize: '13px' }}>
                      {new Date(dateStr).getDate()}
                    </div>
                    {status === 'holiday' && (
                      <div style={{ fontSize: '10px', color: textColor, marginTop: '4px', fontStyle: 'italic' }}>
                        {getHolidayName(dateStr)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* REQUESTS VIEW */}
        {view === 'requests' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 15px 0', color: ACCENT_COLOR }}>Neuen Urlaubsantrag stellen</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '5px' }}>Von:</label>
                  <input type="date" value={newRequest.start} onChange={(e) => setNewRequest({ ...newRequest, start: e.target.value })} style={{ width: '100%', padding: '10px', border: `1px solid #ddd`, borderRadius: '4px', fontSize: '13px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '5px' }}>Bis:</label>
                  <input type="date" value={newRequest.end} onChange={(e) => setNewRequest({ ...newRequest, end: e.target.value })} style={{ width: '100%', padding: '10px', border: `1px solid #ddd`, borderRadius: '4px', fontSize: '13px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '5px' }}>Grund:</label>
                  <input type="text" placeholder="z.B. Erholung" value={newRequest.reason} onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })} style={{ width: '100%', padding: '10px', border: `1px solid #ddd`, borderRadius: '4px', fontSize: '13px' }} />
                </div>
              </div>
              <button onClick={handleSubmitRequest} style={{ marginTop: '15px', padding: '12px 24px', backgroundColor: ACCENT_COLOR, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>Antrag einreichen</button>
            </div>

            <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 15px 0', color: ACCENT_COLOR }}>Meine Anträge</h3>
              {vacationRequests.length === 0 ? (
                <p style={{ color: '#999', fontSize: '13px' }}>Keine Anträge vorhanden</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {vacationRequests.map(req => (
                    <div key={req.id} style={{ padding: '15px', backgroundColor: '#f9f9f9', border: `1px solid #e0e0e0`, borderRadius: '6px', borderLeft: `4px solid ${req.status === 'approved' ? '#4caf50' : req.status === 'rejected' ? '#f44336' : ACCENT_COLOR}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: '#333', marginBottom: '5px' }}>
                            {new Date(req.start_date).toLocaleDateString('de-DE')} - {new Date(req.end_date).toLocaleDateString('de-DE')}
                          </div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            {req.reason}
                          </div>
                          <div style={{ marginTop: '8px', display: 'inline-block', padding: '4px 12px', backgroundColor: req.status === 'approved' ? '#c8e6c9' : req.status === 'rejected' ? '#ffcdd2' : '#fff9c4', color: req.status === 'approved' ? '#2e7d32' : req.status === 'rejected' ? '#c62828' : '#f9a825', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                            {req.status === 'approved' ? '✓ Genehmigt' : req.status === 'rejected' ? '✗ Abgelehnt' : '⏱ Ausstehend'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MANAGER TEAM VIEW */}
        {view === 'team' && isManager && (
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: ACCENT_COLOR }}>Team-Urlaubsanträge</h3>
            
            {['Randy', 'Daniel', 'Kai'].map(team => {
              const lead = employees.find(e => e.team === team && e.role === 'Team Lead');
              const allTeamRequests = vacationRequests.filter(r => 
                employees.find(e => e.id === r.employee_id && e.team === team)
              );

              return (
                <div key={team} style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', border: `2px solid ${ACCENT_COLOR}20`, borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: ACCENT_COLOR }}>
                    Team {team} (Lead: {lead?.name})
                  </h4>

                  {allTeamRequests.length === 0 ? (
                    <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Keine Anträge</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {allTeamRequests.map(req => {
                        const empName = employees.find(e => e.id === req.employee_id)?.name;
                        return (
                          <div key={req.id} style={{ padding: '12px', backgroundColor: '#fff', border: `1px solid #e0e0e0`, borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: '600', color: '#333', marginBottom: '3px' }}>
                                {empName} • {new Date(req.start_date).toLocaleDateString('de-DE')} - {new Date(req.end_date).toLocaleDateString('de-DE')}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                {req.reason}
                              </div>
                            </div>

                            {req.status === 'pending' && (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => handleApprove(req.id)} style={{ padding: '8px 16px', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✓</button>
                                <button onClick={() => handleReject(req.id)} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✗</button>
                              </div>
                            )}

                            {req.status !== 'pending' && (
                              <div style={{ padding: '4px 12px', backgroundColor: req.status === 'approved' ? '#c8e6c9' : '#ffcdd2', color: req.status === 'approved' ? '#2e7d32' : '#c62828', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                                {req.status === 'approved' ? '✓ Genehmigt' : '✗ Abgelehnt'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#fff',
        borderTop: `1px solid #e0e0e0`,
        padding: '20px 30px',
        marginTop: '40px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#999',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          FARMERS Food Produktion und Handel GmbH • Urlaubsverwaltung {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
