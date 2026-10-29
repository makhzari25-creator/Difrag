import React, { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { formatLocation, nowIso, getDeviceId, toPersianDigits } from './lib/utils';
import { WelcomeScreen, HomeScreen, ImportScreen, LocationsScreen, Nav, ToastContainer } from './screensA';
import { ReportsScreen, ProfileScreen } from './screensB';
import { CountingScreen } from './counting';
import { IPin, IPlay } from './icons';

export default function App() {
  const { profile, screen, setScreen, excelVersion, setCurrentSession, setCurrentLocation, currentSession, currentLocation, userId, addToast } = useAppStore();
  const [preLoc, setPreLoc] = useState<string | null>(null);
  const [counting, setCounting] = useState(false);

  useEffect(() => { if (profile) window.difrag.getActiveExcel().then((v: any) => useAppStore.getState().setExcelVersion(v)); }, []);

  const role = profile?.isManager ? 'مدیر' : 'انباردار';
  const startSession = async (loc: string) => {
    if (!profile || !userId || !excelVersion) { addToast('error', 'ابتدا اکسل را بارگذاری کنید'); return; }
    const sess = await window.difrag.createSession({ locationCode: loc, userId, userName: profile.fullName, userRole: role, excelVersionId: excelVersion.id });
    setCurrentSession({ id: sess.id, locationCode: loc, startedByUserId: userId, startedByName: profile.fullName, startedByRole: role, startedAt: sess.startedAt, endedAt: null, status: 'active', excelVersionId: excelVersion.id } as any);
    setCurrentLocation(loc); setCounting(true); setPreLoc(null);
  };
  const resume = async (s: any) => {
    await window.difrag.updateSession({ id: s.id, status: 'active', endedAt: null });
    setCurrentSession({ id: s.id, locationCode: s.location_code, startedByUserId: s.started_by_user_id, startedByName: s.started_by_name, startedByRole: s.started_by_role, startedAt: s.started_at, endedAt: null, status: 'active', excelVersionId: s.excel_version_id } as any);
    setCurrentLocation(s.location_code); setCounting(true);
  };
  const exitCounting = async () => {
    if (currentSession) await window.difrag.updateSession({ id: currentSession.id, status: 'paused', endedAt: null });
    setCounting(false); setCurrentSession(null); setScreen('home');
    addToast('info', 'شمارش نیمه‌کاره ذخیره شد؛ از «ادامه شمارش» برگردید');
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
        onFinish={() => { setCounting(false); setCurrentSession(null); setScreen('home'); addToast('success', 'محل ثبت شد'); }} onExit={exitCounting} />
      <ToastContainer />
    </>
  );
  if (preLoc) return (
    <div className="p-6 max-w-md mx-auto text-center pt-16">
      <div className="bg-surface rounded-card shadow-card p-8">
        <IPin className="w-12 h-12 text-primary mx-auto mb-3" />
        <div className="text-xl font-extrabold text-primary mb-1">{formatLocation(preLoc)}</div>
        <div className="text-sm text-muted mb-6" dir="ltr">{preLoc}</div>
        <button onClick={() => startSession(preLoc)} className="w-full bg-accent text-white py-4 rounded-card font-extrabold text-lg min-h-[56px] flex items-center justify-center gap-2"><IPlay className="w-5 h-5" />شروع شمارش</button>
        <button onClick={() => setPreLoc(null)} className="mt-4 text-muted text-sm">بازگشت</button>
      </div>
      <ToastContainer />
    </div>
  );

  return (
    <>
      {screen === 'home' && <HomeScreen onNav={setScreen} onResume={resume} />}
      {screen === 'locations' && <LocationsScreen onSelect={c => setPreLoc(c)} />}
      {screen === 'reports' && <ReportsScreen />}
      {screen === 'profile' && <ProfileScreen onChange={() => setScreen('welcome')} onQuit={quit} />}
      <Nav active={screen} onNav={setScreen} />
      <ToastContainer />
    </>
  );
}
