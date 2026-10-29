import React, { useEffect, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { formatLocation, nowIso, getDeviceId } from './lib/utils';
import { WelcomeScreen, HomeScreen, ImportScreen, LocationsScreen, Nav, ToastContainer } from './screensA';
import { ReportsScreen, ProfileScreen } from './screensB';
import { CountingScreen } from './counting';

export default function App() {
  const { profile, screen, setScreen, excelVersion, setCurrentSession, setCurrentLocation, setCurrentProduct, currentProduct, currentSession, currentLocation, userId, addToast } = useAppStore();
  const [preLoc, setPreLoc] = useState<string | null>(null);
  const [counting, setCounting] = useState(false);

  useEffect(() => { if (profile) window.difrag.getActiveExcel().then((v: any) => useAppStore.getState().setExcelVersion(v)); }, []);

  const startSession = async (loc: string) => {
    if (!profile || !userId || !excelVersion) { addToast('error', 'ابتدا اکسل را بارگذاری کنید'); return; }
    const sess = await window.difrag.createSession({ locationCode: loc, userId, userName: profile.fullName, userRole: profile.isManager ? 'مدیر' : 'انباردار', excelVersionId: excelVersion.id });
    setCurrentSession({ id: sess.id, locationCode: loc, startedByUserId: userId, startedByName: profile.fullName, startedByRole: profile.isManager ? 'مدیر' : 'انباردار', startedAt: sess.startedAt, endedAt: null, status: 'active', excelVersionId: excelVersion.id } as any);
    setCurrentLocation(loc); setCounting(true); setPreLoc(null);
  };

  const quit = async () => {
    if (profile) await window.difrag.logAuthEvent({ userId, fullName: profile.fullName, isManager: profile.isManager, type: 'logout', timestamp: nowIso(), deviceId: getDeviceId(), detail: null });
    window.close();
  };

  if (!profile || screen === 'welcome') return <><WelcomeScreen /><ToastContainer /></>;
  if (screen === 'import') return <><ImportScreen onDone={() => setScreen('home')} /><ToastContainer /></>;
  if (counting && currentSession && currentLocation) return <><CountingScreen locationCode={currentLocation} sessionId={currentSession.id} onFinish={() => { setCounting(false); setCurrentSession(null); setScreen('home'); addToast('success', 'محل ثبت شد'); }} /><ToastContainer /></>;
  if (preLoc) return (
    <div className="p-6 max-w-md mx-auto text-center pb-20">
      <div className="bg-surface rounded-card shadow-card p-6">
        <div className="text-lg font-bold text-primary mb-4">{formatLocation(preLoc)}</div>
        <button onClick={() => startSession(preLoc)} className="w-full bg-primary text-white py-4 rounded-btn font-bold min-h-[48px]">شروع شمارش</button>
        <button onClick={() => setPreLoc(null)} className="mt-3 text-muted text-sm">بازگشت</button>
      </div>
      <ToastContainer />
    </div>
  );

  return (
    <>
      {screen === 'home' && <HomeScreen onNav={setScreen} />}
      {screen === 'locations' && <LocationsScreen onSelect={c => setPreLoc(c)} />}
      {screen === 'reports' && <ReportsScreen />}
      {screen === 'profile' && <ProfileScreen onChange={() => setScreen('welcome')} onQuit={quit} />}
      <Nav active={screen} onNav={setScreen} />
      <ToastContainer />
    </>
  );
}
