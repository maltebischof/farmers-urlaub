'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getHolidays, countWorkingDays } from '@/lib/holidays';

/* ===================== Farmers Corporate Design ===================== */
const GREEN = '#6AB801';
const GREEN_DARK = '#4d8600';
const GREEN_SOFT = '#eef7e0';
const INK = '#1c2318';
const MUTED = '#6b7566';
const LINE = '#e3e7de';
const BG = '#f6f8f3';
const WARN = '#c9531b';
const WARN_SOFT = '#fbe9df';
const OK = '#2f7d32';
const OK_SOFT = '#e4f2e4';
const RED = '#b23b3b';
const RED_SOFT = '#f6e4e4';

const LOGO_MARK = '/farmers-logo-mark.jpg';
const LOGO_FULL = '/farmers-logo.jpg';

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DOW = ['Mo','Di','Mi','Do','Fr','Sa','So'];
const TEAMS = ['Management','Randy','Daniel','Kai'];
const ROLE_LABEL = { 'Manager':'Geschäftsführung', 'Team Lead':'Teamleitung', 'Sales':'Mitarbeiter' };

/* ===================== Helpers ===================== */
const fmt = (iso) => { if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; };
const toISO = (dt) => { const z=new Date(dt.getTime()-dt.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); };
const initials = (name='') => name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const roleLabel = (r) => ROLE_LABEL[r] || r;

function translateAuthError(msg=''){
  const m = msg.toLowerCase();
  if(m.includes('invalid login')) return 'E-Mail oder Passwort ist falsch.';
  if(m.includes('already registered')) return 'Diese E-Mail ist bereits registriert. Bitte anmelden.';
  if(m.includes('password should be at least')) return 'Das Passwort muss mindestens 6 Zeichen lang sein.';
  if(m.includes('email not confirmed')) return 'E-Mail noch nicht bestätigt. (In Supabase „Confirm email" ausschalten.)';
  if(m.includes('unable to validate email')) return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  return msg || 'Es ist ein Fehler aufgetreten.';
}

/* ===================== Root ===================== */
export default function Page(){
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if(!session){ setMe(null); setChecking(false); return; }
    let active = true;
    (async () => {
      setChecking(true);
      const email = (session.user.email || '').toLowerCase();
      const { data } = await supabase.from('employees').select('*').eq('email', email).maybeSingle();
      if(active){ setMe(data || null); setChecking(false); }
    })();
    return () => { active = false; };
  }, [session]);

  if(checking) return <CenterMsg>Lädt…</CenterMsg>;
  if(!session) return <LoginScreen />;
  if(!me) return <NoProfileScreen email={session.user.email} />;
  return <App me={me} setMe={setMe} />;
}

/* ===================== Login / Register ===================== */
function LoginScreen(){
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(){
    setErr(''); setInfo('');
    if(!email || !pw){ setErr('Bitte E-Mail und Passwort eingeben.'); return; }
    setBusy(true);
    const cleanEmail = email.trim().toLowerCase();
    if(mode === 'login'){
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: pw });
      if(error) setErr(translateAuthError(error.message));
    } else {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password: pw });
      if(error){ setErr(translateAuthError(error.message)); }
      else if(data.session){ /* eingeloggt via listener */ }
      else { setInfo('Konto erstellt. Du kannst dich jetzt anmelden.'); setMode('login'); }
    }
    setBusy(false);
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:BG,fontFamily:'system-ui,-apple-system,sans-serif'}}>
      <div style={{width:'100%',maxWidth:420,background:'#fff',border:`1px solid ${LINE}`,borderRadius:20,padding:'34px 32px',boxShadow:'0 10px 40px rgba(28,35,24,.08)',textAlign:'center'}}>
        <img src={LOGO_FULL} alt="Farmers" style={{width:'78%',maxWidth:260,height:'auto',margin:'0 auto 22px'}} />
        <h1 style={{fontSize:22,fontWeight:800,color:INK,margin:'0 0 4px',letterSpacing:'-.02em'}}>Urlaubsverwaltung</h1>
        <p style={{color:MUTED,fontSize:14,margin:'0 0 24px'}}>
          {mode==='login' ? 'Melde dich mit deiner Farmers-E-Mail an.' : 'Registriere dich und vergib dein eigenes Passwort.'}
        </p>

        <div style={{textAlign:'left'}}>
          <Label>E-Mail</Label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="name@farmers.de"
            onKeyDown={e=>{if(e.key==='Enter')submit();}} style={inp} />
          <div style={{height:14}} />
          <Label>Passwort {mode==='register' && <span style={{fontWeight:400,color:MUTED}}>(mind. 6 Zeichen)</span>}</Label>
          <input value={pw} onChange={e=>setPw(e.target.value)} type="password" placeholder="••••••••"
            onKeyDown={e=>{if(e.key==='Enter')submit();}} style={inp} />
        </div>

        {err && <div style={{marginTop:14,background:RED_SOFT,color:RED,fontSize:13.5,padding:'10px 12px',borderRadius:9,textAlign:'left'}}>{err}</div>}
        {info && <div style={{marginTop:14,background:OK_SOFT,color:OK,fontSize:13.5,padding:'10px 12px',borderRadius:9,textAlign:'left'}}>{info}</div>}

        <button onClick={submit} disabled={busy} style={{...btnPrimary,width:'100%',marginTop:18,opacity:busy?.6:1}}>
          {busy ? 'Bitte warten…' : (mode==='login' ? 'Anmelden' : 'Registrieren')}
        </button>

        <div style={{marginTop:18,fontSize:13.5,color:MUTED}}>
          {mode==='login' ? (
            <>Noch kein Konto? <a onClick={()=>{setMode('register');setErr('');setInfo('');}} style={link}>Jetzt registrieren</a></>
          ) : (
            <>Schon registriert? <a onClick={()=>{setMode('login');setErr('');setInfo('');}} style={link}>Zur Anmeldung</a></>
          )}
        </div>
      </div>
    </div>
  );
}

function NoProfileScreen({ email }){
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:BG,fontFamily:'system-ui,-apple-system,sans-serif'}}>
      <div style={{width:'100%',maxWidth:440,background:'#fff',border:`1px solid ${LINE}`,borderRadius:20,padding:'34px 32px',textAlign:'center',boxShadow:'0 10px 40px rgba(28,35,24,.08)'}}>
        <img src={LOGO_MARK} alt="Farmers" style={{width:180,height:'auto',margin:'0 auto 20px'}} />
        <h1 style={{fontSize:20,fontWeight:800,color:INK,margin:'0 0 8px'}}>Kein Mitarbeiterprofil gefunden</h1>
        <p style={{color:MUTED,fontSize:14,lineHeight:1.6,margin:'0 0 22px'}}>
          Für <b>{email}</b> ist noch kein Profil hinterlegt. Bitte wende dich an die Geschäftsführung, damit dein Zugang mit dieser E-Mail angelegt wird.
        </p>
        <button onClick={()=>supabase.auth.signOut()} style={{...btnGhost,width:'100%'}}>Abmelden</button>
      </div>
    </div>
  );
}

/* ===================== Main App ===================== */
function App({ me, setMe }){
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('overview');
  const [calDate, setCalDate] = useState(new Date());
  const [toast, setToast] = useState('');

  const isManager = me.role === 'Manager';
  const isLead = me.role === 'Team Lead';
  const canApprove = isManager || isLead;
  const canAdmin = isManager || isLead;

  function flash(msg){ setToast(msg); setTimeout(()=>setToast(''), 2600); }

  async function refresh(){
    if(me.role === 'Sales'){
      setEmployees([me]);
      const { data } = await supabase.from('vacation_requests').select('*').eq('employee_id', me.id);
      setRequests(data || []);
    } else {
      const { data: emps } = await supabase.from('employees').select('*').order('name', { ascending: true });
      const { data: reqs } = await supabase.from('vacation_requests').select('*');
      setEmployees(emps || []);
      setRequests(reqs || []);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  /* ---- scope helpers ---- */
  const empById = (id) => employees.find(e=>e.id===id) || (me.id===id ? me : null);
  function teamEmployees(){
    if(isManager) return employees;
    if(isLead) return employees.filter(e=>e.team===me.team);
    return [me];
  }
  function pendingForMe(){
    let ids;
    if(isManager) ids = employees.map(e=>e.id);
    else if(isLead) ids = employees.filter(e=>e.team===me.team && e.id!==me.id).map(e=>e.id);
    else ids = [];
    return requests.filter(r=>r.status==='pending' && ids.includes(r.employee_id))
      .sort((a,b)=>a.start_date.localeCompare(b.start_date));
  }
  function usedDays(empId, status){
    const yr = new Date().getFullYear();
    return requests
      .filter(r=>r.employee_id===empId && r.status===status && new Date(r.start_date).getFullYear()===yr)
      .reduce((t,r)=>t+countWorkingDays(r.start_date,r.end_date),0);
  }

  const pendingCount = canApprove ? pendingForMe().length : 0;

  const tabs = [['overview','Übersicht'],['calendar','Kalender'],['requests','Meine Anträge']];
  if(canApprove) tabs.push(['approvals', `Genehmigungen${pendingCount?` (${pendingCount})`:''}`]);
  if(isManager) tabs.push(['team','Team']);
  if(canAdmin) tabs.push(['admin','Verwaltung']);

  return (
    <div style={{minHeight:'100vh',background:BG,fontFamily:'system-ui,-apple-system,sans-serif',color:INK}}>
      {/* Header */}
      <header style={{background:'#fff',borderBottom:`1px solid ${LINE}`,position:'sticky',top:0,zIndex:50}}>
        <div style={{height:4,background:GREEN}} />
        <div style={{maxWidth:1120,margin:'0 auto',padding:'12px 22px',display:'flex',alignItems:'center',gap:16}}>
          <img src={LOGO_MARK} alt="Farmers" style={{height:38,width:'auto'}} />
          <div style={{fontWeight:700,fontSize:16,color:INK}}>Urlaubsverwaltung</div>
          <div style={{flex:1}} />
          <div style={{textAlign:'right',lineHeight:1.25}}>
            <div style={{fontWeight:700,fontSize:14}}>{me.name}</div>
            <div style={{fontSize:11.5,color:MUTED}}>{roleLabel(me.role)}{me.team && me.team!=='Management'?` · Team ${me.team}`:''}</div>
          </div>
          <div style={{width:36,height:36,borderRadius:'50%',background:GREEN_SOFT,color:GREEN_DARK,fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>{initials(me.name)}</div>
          <button onClick={()=>supabase.auth.signOut()} style={{...btnGhost,padding:'8px 12px',fontSize:13}}>Abmelden</button>
        </div>
        <nav style={{maxWidth:1120,margin:'0 auto',padding:'0 22px',display:'flex',gap:4,overflowX:'auto'}}>
          {tabs.map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:'12px 15px',fontSize:14,fontWeight:600,whiteSpace:'nowrap',color:tab===k?GREEN_DARK:MUTED,borderBottom:`2.5px solid ${tab===k?GREEN:'transparent'}`,background:'none',cursor:'pointer'}}>{l}</button>
          ))}
        </nav>
      </header>

      <main style={{maxWidth:1120,margin:'0 auto',padding:'26px 22px 60px'}}>
        {tab==='overview' && <Overview me={me} usedDays={usedDays} requests={requests} empById={empById} />}
        {tab==='calendar' && <CalendarView me={me} calDate={calDate} setCalDate={setCalDate} teamEmployees={teamEmployees} requests={requests} empById={empById} />}
        {tab==='requests' && <MyRequests me={me} requests={requests} refresh={refresh} flash={flash} />}
        {tab==='approvals' && canApprove && <Approvals pending={pendingForMe()} empById={empById} refresh={refresh} flash={flash} />}
        {tab==='team' && isManager && <TeamView employees={employees} usedDays={usedDays} flash={flash} refresh={refresh} />}
        {tab==='admin' && canAdmin && <AdminView me={me} employees={teamEmployees()} refresh={refresh} flash={flash} isManager={isManager} />}
      </main>

      <footer style={{borderTop:`1px solid ${LINE}`,background:'#fff'}}>
        <div style={{maxWidth:1120,margin:'0 auto',padding:'16px 22px',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12.5,color:MUTED,flexWrap:'wrap',gap:8}}>
          <span>Farmers Food GmbH · Urlaubsverwaltung</span>
          <span style={{color:GREEN_DARK,fontWeight:700}}>Excellence since 1993</span>
        </div>
      </footer>

      {toast && <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:INK,color:'#fff',padding:'12px 20px',borderRadius:10,fontSize:14,fontWeight:600,boxShadow:'0 8px 30px rgba(0,0,0,.2)',zIndex:100}}>{toast}</div>}
    </div>
  );
}

/* ===================== Views ===================== */
function Overview({ me, usedDays, requests }){
  const manual = me.used_days_manual || 0;
  const carried = me.carried_days || 0;
  const used = usedDays(me.id,'approved') + manual;
  const pending = usedDays(me.id,'pending');
  const available = me.allowed_days + carried;
  const remaining = available - used;
  const pct = Math.min(100, Math.round(used / available * 100));
  const mine = requests.filter(r=>r.employee_id===me.id).sort((a,b)=>b.start_date.localeCompare(a.start_date)).slice(0,5);

  return (
    <>
      <PageTitle title={`Hallo, ${me.name.split(' ')[0]}`} sub={`Dein Urlaubsüberblick für ${new Date().getFullYear()}`} />
      <div style={grid3}>
        <div style={{...card,background:GREEN,border:`1px solid ${GREEN}`}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,.85)',fontWeight:500}}>Verbleibend</div>
          <div style={{fontSize:38,fontWeight:800,color:'#fff',lineHeight:1.1,marginTop:4}}>{remaining}</div>
          <div style={{fontSize:12.5,color:'rgba(255,255,255,.85)',marginTop:2}}>von {available} Tagen{carried>0?` (inkl. ${carried} Übertrag)`:''}</div>
        </div>
        <div style={card}>
          <div style={statLabel}>Genommen</div>
          <div style={statNum}>{used}</div>
          <div style={statFoot}>{manual>0?`inkl. ${manual} vor Systemstart`:'genehmigte Tage'}</div>
          <div style={bar}><div style={{...barFill,width:`${pct}%`}} /></div>
        </div>
        <div style={card}>
          <div style={statLabel}>Beantragt</div>
          <div style={statNum}>{pending}</div>
          <div style={statFoot}>wartet auf Genehmigung</div>
        </div>
      </div>
      <div style={{...card,marginTop:16}}>
        <H3>Letzte Anträge</H3>
        {mine.length ? <RequestTable list={mine} showName={false} /> : <Empty>Noch keine Urlaubsanträge</Empty>}
      </div>
    </>
  );
}

function MyRequests({ me, requests, refresh, flash }){
  const today = toISO(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = requests.filter(r=>r.employee_id===me.id).sort((a,b)=>b.start_date.localeCompare(a.start_date));
  const preview = (start && end && end>=start) ? countWorkingDays(start,end) : 0;

  async function submit(){
    if(!start || !end){ flash('Bitte Start- und Enddatum wählen'); return; }
    if(end<start){ flash('Enddatum liegt vor Startdatum'); return; }
    if(countWorkingDays(start,end)===0){ flash('Zeitraum enthält keine Arbeitstage'); return; }
    setBusy(true);
    const { error } = await supabase.from('vacation_requests').insert([{ employee_id: me.id, start_date: start, end_date: end, reason: reason||'', status:'pending' }]);
    setBusy(false);
    if(error){ flash('Fehler beim Speichern'); return; }
    setReason('');
    flash(`Antrag über ${preview} Tag(e) eingereicht`);
    refresh();
  }
  async function cancel(id){
    await supabase.from('vacation_requests').delete().eq('id', id);
    flash('Antrag zurückgezogen'); refresh();
  }

  return (
    <>
      <PageTitle title="Meine Anträge" sub="Neuen Urlaub beantragen und Status verfolgen" />
      <div style={grid2}>
        <div style={card}>
          <H3>Neuer Antrag</H3>
          <div style={{display:'flex',gap:12}}>
            <div style={{flex:1}}><Label>Von</Label><input type="date" min={today} value={start} onChange={e=>setStart(e.target.value)} style={inp} /></div>
            <div style={{flex:1}}><Label>Bis</Label><input type="date" min={today} value={end} onChange={e=>setEnd(e.target.value)} style={inp} /></div>
          </div>
          <div style={{height:12}} />
          <Label>Grund (optional)</Label>
          <input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="z. B. Familienurlaub" style={inp} />
          {preview>0 && <div style={{fontSize:13,color:MUTED,margin:'12px 0 0'}}>= {preview} Arbeitstag(e) (ohne Wochenenden &amp; Feiertage)</div>}
          <button onClick={submit} disabled={busy} style={{...btnPrimary,width:'100%',marginTop:16,opacity:busy?.6:1}}>Antrag einreichen</button>
        </div>
        <div style={card}>
          <H3>Alle meine Anträge</H3>
          {mine.length ? <RequestTable list={mine} showName={false} onCancel={cancel} /> : <Empty>Noch keine Anträge</Empty>}
        </div>
      </div>
    </>
  );
}

function Approvals({ pending, empById, refresh, flash }){
  async function decide(id, status){
    await supabase.from('vacation_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    flash(status==='approved' ? 'Antrag genehmigt' : 'Antrag abgelehnt');
    refresh();
  }
  return (
    <>
      <PageTitle title="Genehmigungen" sub="Offene Urlaubsanträge prüfen" />
      <div style={card}>
        {pending.length ? (
          <table style={table}><thead><tr><Th>Mitarbeiter</Th><Th>Zeitraum</Th><Th>Tage</Th><Th></Th></tr></thead>
          <tbody>
            {pending.map(r=>{
              const e = empById(r.employee_id) || {name:'?'};
              const days = countWorkingDays(r.start_date,r.end_date);
              return (
                <tr key={r.id}>
                  <Td><NameCell name={e.name} sub={e.team && e.team!=='Management'?`Team ${e.team}`:roleLabel(e.role)} /></Td>
                  <Td>{fmt(r.start_date)} – {fmt(r.end_date)}{r.reason?<div style={{fontSize:12,color:MUTED}}>{r.reason}</div>:null}</Td>
                  <Td><b>{days}</b></Td>
                  <Td><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                    <button onClick={()=>decide(r.id,'approved')} title="Genehmigen" style={{...iconBtn,color:OK}}>✓</button>
                    <button onClick={()=>decide(r.id,'rejected')} title="Ablehnen" style={{...iconBtn,color:RED}}>✕</button>
                  </div></Td>
                </tr>
              );
            })}
          </tbody></table>
        ) : <Empty>Keine offenen Anträge 🎉</Empty>}
      </div>
    </>
  );
}

function TeamView({ employees, usedDays, flash, refresh }){
  function exportCSV(){
    const rows = [['Name','Email','Rolle','Team','Anspruch','Übertrag','Bereits genommen','Genommen gesamt','Beantragt','Verbleibend']];
    employees.forEach(e=>{
      const manual=e.used_days_manual||0, carried=e.carried_days||0;
      const totalUsed=usedDays(e.id,'approved')+manual, pend=usedDays(e.id,'pending');
      const available=e.allowed_days+carried, rem=available-totalUsed;
      rows.push([e.name,e.email,roleLabel(e.role),e.team||'',e.allowed_days,carried,manual,totalUsed,pend,rem]);
    });
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Urlaub_${new Date().getFullYear()}.csv`; a.click();
    flash('CSV heruntergeladen');
  }
  async function carryOver(){
    const ok = confirm('Jahreswechsel durchführen?\n\nFür jeden Mitarbeiter wird der aktuelle Resturlaub als „Übertrag aus Vorjahr" gespeichert und „bereits genommen" auf 0 gesetzt.\n\nNur EINMAL zu Jahresbeginn ausführen.');
    if(!ok) return;
    for(const e of employees){
      const manual=e.used_days_manual||0, carried=e.carried_days||0;
      const rem=(e.allowed_days+carried)-(usedDays(e.id,'approved')+manual);
      await supabase.from('employees').update({ carried_days: rem, used_days_manual: 0 }).eq('id', e.id);
    }
    flash('Jahreswechsel abgeschlossen'); refresh();
  }
  return (
    <>
      <PageTitle title="Team-Übersicht" sub={`Urlaubsstatus aller Mitarbeiter · ${new Date().getFullYear()}`}
        action={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={carryOver} style={{...btnGhost,padding:'7px 12px',fontSize:13}}>↪ Jahreswechsel</button>
          <button onClick={exportCSV} style={{...btnGhost,padding:'7px 12px',fontSize:13}}>⬇ CSV Export</button>
        </div>} />
      <div style={card}>
        <table style={table}><thead><tr><Th>Mitarbeiter</Th><Th>Team</Th><Th>Übertrag</Th><Th>Genommen</Th><Th>Beantragt</Th><Th>Verbleibend</Th><Th>Auslastung</Th></tr></thead>
        <tbody>
          {employees.map(e=>{
            const manual=e.used_days_manual||0, carried=e.carried_days||0;
            const used=usedDays(e.id,'approved')+manual, pend=usedDays(e.id,'pending');
            const available=e.allowed_days+carried, rem=available-used;
            const pct=Math.min(100,Math.round(used/available*100));
            return (
              <tr key={e.id}>
                <Td><NameCell name={e.name} sub={roleLabel(e.role)} /></Td>
                <Td>{e.team && e.team!=='Management'?e.team:'—'}</Td>
                <Td>{carried?`+${carried}`:'—'}</Td>
                <Td>{used} / {available}</Td>
                <Td>{pend||'—'}</Td>
                <Td><b>{rem}</b></Td>
                <Td><div style={{...bar,margin:0,minWidth:110}}><div style={{...barFill,width:`${pct}%`}} /></div></Td>
              </tr>
            );
          })}
        </tbody></table>
      </div>
    </>
  );
}

function AdminView({ me, employees, refresh, flash, isManager }){
  const [modal, setModal] = useState(null); // null | {emp} for edit | 'new'

  async function remove(emp){
    if(!confirm(`${emp.name} und zugehörige Anträge wirklich löschen?`)) return;
    await supabase.from('vacation_requests').delete().eq('employee_id', emp.id);
    await supabase.from('employees').delete().eq('id', emp.id);
    flash('Mitarbeiter gelöscht'); refresh();
  }

  return (
    <>
      <PageTitle title="Mitarbeiterverwaltung" sub="Mitarbeiter anlegen, bearbeiten und Urlaubsanspruch festlegen"
        action={<button onClick={()=>setModal('new')} style={{...btnPrimary,padding:'8px 14px',fontSize:13.5}}>+ Mitarbeiter</button>} />
      <div style={card}>
        <table style={table}><thead><tr><Th>Mitarbeiter</Th><Th>E-Mail</Th><Th>Rolle</Th><Th>Team</Th><Th>Anspruch</Th><Th></Th></tr></thead>
        <tbody>
          {employees.map(e=>(
            <tr key={e.id}>
              <Td><NameCell name={e.name} /></Td>
              <Td style={{color:MUTED}}>{e.email}</Td>
              <Td><span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:6,background:GREEN_SOFT,color:GREEN_DARK}}>{roleLabel(e.role)}</span></Td>
              <Td>{e.team && e.team!=='Management'?e.team:'—'}</Td>
              <Td><b>{e.allowed_days}</b> Tage</Td>
              <Td><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal({emp:e})} title="Bearbeiten" style={iconBtn}>✎</button>
                {e.id!==me.id && <button onClick={()=>remove(e)} title="Löschen" style={{...iconBtn,color:RED}}>🗑</button>}
              </div></Td>
            </tr>
          ))}
        </tbody></table>
      </div>
      {modal && <EmpModal me={me} isManager={isManager} initial={modal==='new'?null:modal.emp} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);refresh();}} flash={flash} />}
    </>
  );
}

function EmpModal({ me, isManager, initial, onClose, onSaved, flash }){
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [role, setRole] = useState(initial?.role || 'Sales');
  const [team, setTeam] = useState(initial?.team || (me.team!=='Management'?me.team:'Randy'));
  const [days, setDays] = useState(initial?.allowed_days ?? 28);
  const [carried, setCarried] = useState(initial?.carried_days ?? 0);
  const [manual, setManual] = useState(initial?.used_days_manual ?? 0);
  const [busy, setBusy] = useState(false);

  async function save(){
    if(!name || !email){ flash('Name und E-Mail sind erforderlich'); return; }
    setBusy(true);
    const payload = { name, email: email.trim().toLowerCase(), role, team, allowed_days: Number(days)||0, carried_days: Number(carried)||0, used_days_manual: Number(manual)||0 };
    let error;
    if(isEdit){ ({ error } = await supabase.from('employees').update(payload).eq('id', initial.id)); }
    else { ({ error } = await supabase.from('employees').insert([payload])); }
    setBusy(false);
    if(error){ flash('Fehler beim Speichern (E-Mail evtl. schon vergeben)'); return; }
    flash(isEdit?'Mitarbeiter aktualisiert':'Mitarbeiter angelegt');
    onSaved();
  }

  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(28,35,24,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,zIndex:80}}>
      <div style={{background:'#fff',borderRadius:18,padding:26,width:'100%',maxWidth:460,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
        <h3 style={{fontSize:18,fontWeight:800,margin:'0 0 18px'}}>{isEdit?'Mitarbeiter bearbeiten':'Neuer Mitarbeiter'}</h3>
        <Label>Name</Label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname" style={inp} />
        <div style={{height:12}} />
        <Label>E-Mail <span style={{fontWeight:400,color:MUTED}}>(mit dieser meldet er sich an)</span></Label>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@farmers.de" style={inp} />
        <div style={{height:12}} />
        <div style={{display:'flex',gap:12}}>
          <div style={{flex:1}}><Label>Rolle</Label>
            <select value={role} onChange={e=>setRole(e.target.value)} disabled={!isManager} style={inp}>
              <option value="Sales">Mitarbeiter</option>
              <option value="Team Lead">Teamleitung</option>
              <option value="Manager">Geschäftsführung</option>
            </select>
          </div>
          <div style={{flex:1}}><Label>Anspruch (Tage)</Label><input type="number" min="0" max="60" value={days} onChange={e=>setDays(e.target.value)} style={inp} /></div>
        </div>
        <div style={{height:12}} />
        <Label>Team</Label>
        <select value={team} onChange={e=>setTeam(e.target.value)} style={inp}>
          {TEAMS.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{height:12}} />
        <div style={{display:'flex',gap:12}}>
          <div style={{flex:1}}><Label>Übertrag aus Vorjahr</Label><input type="number" min="0" value={carried} onChange={e=>setCarried(e.target.value)} style={inp} /></div>
          <div style={{flex:1}}><Label>Bereits genommen (dieses Jahr)</Label><input type="number" min="0" value={manual} onChange={e=>setManual(e.target.value)} style={inp} /></div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:20}}>
          <button onClick={onClose} style={{...btnGhost,flex:1}}>Abbrechen</button>
          <button onClick={save} disabled={busy} style={{...btnPrimary,flex:1,opacity:busy?.6:1}}>{isEdit?'Speichern':'Anlegen'}</button>
        </div>
        <p style={{fontSize:12,color:MUTED,margin:'14px 0 0',lineHeight:1.5}}>Das Passwort vergibt der Mitarbeiter selbst bei der Registrierung mit dieser E-Mail.</p>
      </div>
    </div>
  );
}

function CalendarView({ me, calDate, setCalDate, teamEmployees, requests, empById }){
  const year = calDate.getFullYear(), month = calDate.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay()+6)%7;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const holidays = getHolidays(year);
  const holMap = {}; holidays.forEach(h=>holMap[h.date]=h.name);

  const scopeIds = teamEmployees().map(e=>e.id);
  const dayInfo = {};
  requests.filter(r=>scopeIds.includes(r.employee_id) && r.status!=='rejected').forEach(r=>{
    const s=new Date(r.start_date+'T00:00'), e=new Date(r.end_date+'T00:00');
    for(let x=new Date(s); x<=e; x.setDate(x.getDate()+1)){
      const iso=toISO(x);
      if(!dayInfo[iso]) dayInfo[iso]={names:new Set(),pending:false};
      const emp=empById(r.employee_id);
      dayInfo[iso].names.add(emp?emp.name.split(' ')[0]:'?');
      if(r.status==='pending') dayInfo[iso].pending=true;
    }
  });

  const cells=[];
  for(let i=0;i<startDow;i++) cells.push(<div key={'e'+i} style={{border:'none'}} />);
  for(let d=1; d<=daysInMonth; d++){
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt=new Date(year,month,d), dow=dt.getDay();
    const weekend = dow===0||dow===6;
    const hol=holMap[iso];
    const vac=dayInfo[iso];
    let bg='#fff', border=`1px solid ${LINE}`;
    if(vac){ bg=GREEN_SOFT; border=`1px solid ${GREEN}`; }
    else if(hol){ bg=WARN_SOFT; }
    else if(weekend){ bg=BG; }
    cells.push(
      <div key={iso} style={{minHeight:66,borderRadius:9,padding:6,background:vac&&vac.pending?'repeating-linear-gradient(45deg,'+GREEN_SOFT+','+GREEN_SOFT+' 6px,#fff 6px,#fff 12px)':bg,border,fontSize:13}}>
        <div style={{fontWeight:600}}>{d}</div>
        {hol && <div style={{fontSize:9.5,color:MUTED,marginTop:2,lineHeight:1.15}}>{hol}</div>}
        {vac && <div style={{fontSize:9.5,color:GREEN_DARK,marginTop:2,lineHeight:1.15}}>{[...vac.names].join(', ')}</div>}
      </div>
    );
  }

  return (
    <>
      <PageTitle title="Urlaubskalender" sub={`${me.role==='Sales'?'Deine Urlaubstage':'Urlaubstage deines Teams'} · Feiertage (NRW) markiert`} />
      <div style={card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={()=>setCalDate(new Date(year,month-1,1))} style={iconBtn}>‹</button>
            <div style={{fontWeight:700,fontSize:16,minWidth:150,textAlign:'center'}}>{MONTHS[month]} {year}</div>
            <button onClick={()=>setCalDate(new Date(year,month+1,1))} style={iconBtn}>›</button>
          </div>
          <button onClick={()=>setCalDate(new Date())} style={{...btnGhost,padding:'7px 12px',fontSize:13}}>Heute</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:5}}>
          {DOW.map(d=><div key={d} style={{textAlign:'center',fontSize:11.5,fontWeight:700,color:MUTED,paddingBottom:6}}>{d}</div>)}
          {cells}
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:16,marginTop:16,fontSize:12.5,color:MUTED}}>
          <Legend color={GREEN_SOFT} bd={GREEN}>Genehmigt</Legend>
          <Legend color={WARN_SOFT}>Feiertag</Legend>
          <Legend color={BG}>Wochenende</Legend>
        </div>
      </div>
    </>
  );
}

/* ===================== Small UI pieces ===================== */
function CenterMsg({ children }){ return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:GREEN_DARK,fontFamily:'system-ui,sans-serif'}}>{children}</div>; }
function PageTitle({ title, sub, action }){
  return (
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:22,gap:12,flexWrap:'wrap'}}>
      <div><div style={{fontSize:22,fontWeight:800,letterSpacing:'-.02em'}}>{title}</div>{sub && <div style={{color:MUTED,fontSize:14,marginTop:3}}>{sub}</div>}</div>
      {action}
    </div>
  );
}
function H3({ children }){ return <h3 style={{fontSize:14,fontWeight:700,margin:'0 0 14px'}}>{children}</h3>; }
function Label({ children }){ return <label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>{children}</label>; }
function Th({ children }){ return <th style={{textAlign:'left',fontSize:12,fontWeight:700,color:MUTED,padding:'0 10px 10px',borderBottom:`1px solid ${LINE}`}}>{children}</th>; }
function Td({ children, style }){ return <td style={{padding:'13px 10px',borderBottom:`1px solid ${LINE}`,verticalAlign:'middle',...style}}>{children}</td>; }
function NameCell({ name, sub }){
  return (
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:32,height:32,borderRadius:'50%',background:GREEN_SOFT,color:GREEN_DARK,fontWeight:700,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{initials(name)}</div>
      <div><div style={{fontWeight:600}}>{name}</div>{sub && <div style={{fontSize:12,color:MUTED}}>{sub}</div>}</div>
    </div>
  );
}
function Empty({ children }){ return <div style={{textAlign:'center',padding:'40px 20px',color:MUTED}}>{children}</div>; }
function Legend({ color, bd, children }){ return <span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:13,height:13,borderRadius:4,background:color,border:`1px solid ${bd||LINE}`}} />{children}</span>; }

function RequestTable({ list, showName, onCancel }){
  const statusLabel = { pending:'Ausstehend', approved:'Genehmigt', rejected:'Abgelehnt' };
  const statusStyle = {
    pending:{background:WARN_SOFT,color:WARN}, approved:{background:OK_SOFT,color:OK}, rejected:{background:RED_SOFT,color:RED}
  };
  return (
    <table style={table}><thead><tr>{showName&&<Th>Mitarbeiter</Th>}<Th>Zeitraum</Th><Th>Tage</Th><Th>Status</Th>{onCancel&&<Th></Th>}</tr></thead>
    <tbody>
      {list.map(r=>{
        const days=countWorkingDays(r.start_date,r.end_date);
        return (
          <tr key={r.id}>
            {showName&&<Td>{r.employee_id}</Td>}
            <Td>{fmt(r.start_date)} – {fmt(r.end_date)}{r.reason?<div style={{fontSize:12,color:MUTED}}>{r.reason}</div>:null}</Td>
            <Td><b>{days}</b></Td>
            <Td><span style={{display:'inline-block',padding:'4px 11px',borderRadius:99,fontSize:12.5,fontWeight:650,...statusStyle[r.status]}}>{statusLabel[r.status]}</span></Td>
            {onCancel&&<Td><div style={{display:'flex',justifyContent:'flex-end'}}>{r.status==='pending' && <button onClick={()=>onCancel(r.id)} title="Zurückziehen" style={{...iconBtn,color:RED}}>🗑</button>}</div></Td>}
          </tr>
        );
      })}
    </tbody></table>
  );
}

/* ===================== Style objects ===================== */
const card = { background:'#fff', border:`1px solid ${LINE}`, borderRadius:14, padding:20, boxShadow:'0 1px 3px rgba(28,35,24,.06)' };
const grid3 = { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 };
const grid2 = { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 };
const statLabel = { fontSize:13, color:MUTED, fontWeight:500 };
const statNum = { fontSize:38, fontWeight:800, letterSpacing:'-.03em', lineHeight:1.1, marginTop:4, color:INK };
const statFoot = { fontSize:12.5, color:MUTED, marginTop:2 };
const bar = { height:7, borderRadius:99, background:GREEN_SOFT, marginTop:14, overflow:'hidden' };
const barFill = { height:'100%', background:GREEN, borderRadius:99 };
const table = { width:'100%', borderCollapse:'collapse', fontSize:14 };
const inp = { width:'100%', padding:'10px 12px', border:`1px solid ${LINE}`, borderRadius:10, background:'#fff', color:INK, outline:'none', fontSize:15, boxSizing:'border-box' };
const btnPrimary = { display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, padding:'11px 18px', borderRadius:10, fontWeight:650, fontSize:14.5, background:GREEN, color:'#fff', border:'none', cursor:'pointer' };
const btnGhost = { display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, padding:'11px 18px', borderRadius:10, fontWeight:600, fontSize:14, background:BG, color:INK, border:`1px solid ${LINE}`, cursor:'pointer' };
const iconBtn = { width:34, height:34, borderRadius:8, display:'inline-flex', alignItems:'center', justifyContent:'center', color:MUTED, background:BG, border:`1px solid ${LINE}`, cursor:'pointer', fontSize:15 };
const link = { color:GREEN_DARK, fontWeight:600, cursor:'pointer', textDecoration:'underline' };
