import React, { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { nowIso, getDeviceId } from './lib/utils';
import { useScanner } from './hooks/useScanner';
import { WelcomeScreen, HomeScreen, ImportScreen, LocationsScreen, Nav, ToastContainer } from './screensA';
import { ReportsScreen, ProfileScreen } from './screensB';
import { CountingScreen } from './counting';

export default function App() {
  const { profile, screen, setScreen, excelVersion, setCurrentSession, setCurrentLocation, currentSession, currentLocation, userId, addToast } = useAppStore();
  const [counting, setCounting] = useState(false);

  useEffect(() => { if (profile) window.difrag.getActiveExcel().then((v: any) => useAppStore.getState().setExcelVersion(v)); }, []);

  const role = profile?.isManager ? 'مدیر' : 'انباردار';
  const startSession = async (loc: string) => {
    if (!profile || !userId || !excelVersion) { addToast('error', 'ابتدا اکسل را بارگذاری کنید'); return; }
    const sess = await window.difrag.createSession({ locationCode: loc, userId, userName: profile.fullName, userRole: role, excelVersionId: excelVersion.id });
    setCurrentSession({ id: sess.id, locationCode: loc, startedByUserId: userId, startedByName: profile.fullName, startedByRole: role, startedAt: sess.startedAt, endedAt: null, status: 'active', excelVersionId: excelVersion.id } as any);
    setCurrentLocation(loc); setCounting(true);
  };
  // A printed 8-digit shelf label scanned on the home / locations screen starts counting right away.
  const idleScanning = !!profile && !counting && (screen === 'home' || screen === 'locations');
  useScanner({
    enabled: idleScanning,
    onScan: (code) => {
      const ver = useAppStore.getState().excelVersion;
      if (code.length !== 8) return;
      if (!ver) { addToast('error', 'ابتدا اکسل را بارگذاری کنید'); return; }
      window.difrag.getLocations(ver.id).then((locs: any[]) => {
        if (locs.some(l => l.location_code === code)) startSession(code);
        else addToast('error', `محل ${code} در اکسل نیست`);
      });
    }
  });
  // Dropping a file on the window must never navigate away from the app.
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop); window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);
  const resume = async (s: any) => {
    await window.difrag.updateSession({ id: s.id, status: 'active', endedAt: null });
    setCurrentSession({ id: s.id, locationCode: s.location_code, startedByUserId: s.started_by_user_id, startedByName: s.started_by_name, startedByRole: s.started_by_role, startedAt: s.started_at, endedAt: null, status: 'active', excelVersionId: s.excel_version_id } as any);
    setCurrentLocation(s.location_code); setCounting(true);
  };
  // status: what to do with the main session on exit. Room runs may end it ('completed'/'cancelled')
  // when a paused shelf session already carries the resume point.
  const exitCounting = async (status: 'paused' | 'completed' | 'cancelled' = 'paused') => {
    if (currentSession) await window.difrag.updateSession({ id: currentSession.id, status, endedAt: status === 'paused' ? null : nowIso() });
    setCounting(false); setCurrentSession(null); setScreen('home');
    if (status !== 'cancelled') addToast('info', 'شمارش نیمه‌کاره ذخیره شد؛ از «ادامه شمارش» برگردید');
  };
  const quit = async () => {
    if (profile) await window.difrag.logAuthEvent({ userId, fullName: profile.fullName, isManager: profile.isManager, type: 'logout', timestamp: nowIso(), deviceId: getDeviceId(), detail: null });
    window.close();
  };

  if (!profile || screen === 'welcome') return <><WelcomeScreen /><ToastContainer /></>;
  if (screen === 'import') return <><ImportScreen onDone={() => setScreen('home')} /><ToastContainer /></>;
  if (counting && currentSession && currentLocation) return (
    <>
      <CountingScreen locationCode={currentLocation} sessionId={currentSession.id}
        onFinish={() => { setCounting(false); setCurrentSession(null); setScreen('locations'); addToast('success', 'محل ثبت شد؛ قفسه بعدی را انتخاب کنید'); }} onExit={exitCounting} />
      <ToastContainer />
    </>
  );
  return (
    <>
      {screen === 'home' && <HomeScreen onNav={setScreen} onResume={resume} />}
      {screen === 'locations' && <LocationsScreen onSelect={startSession} onSelectRoom={startSession} />}
      {screen === 'reports' && <ReportsScreen />}
      {screen === 'profile' && <ProfileScreen onChange={() => setScreen('welcome')} onQuit={quit} />}
      <Nav active={screen} onNav={setScreen} />
      <ToastContainer />
    </>
  );
}
