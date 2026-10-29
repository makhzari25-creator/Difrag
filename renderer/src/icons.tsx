import React from 'react';
type P = { className?: string };
const base = (d: React.ReactNode, vb = '0 0 24 24') => ({ className = 'w-6 h-6' }: P) => (
  <svg viewBox={vb} className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const IHome = base(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>);
export const IScan = base(<><path d="M4 7v10M7 6v12M10 7v10M14 6v12M17 7v10M20 6v12" /></>);
export const IChart = base(<><path d="M4 20V10M10 20V4M16 20v-8M21 20H3" /></>);
export const IUser = base(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>);
export const IPlay = base(<path d="M8 5l11 7-11 7z" fill="currentColor" />);
export const IFolder = base(<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="currentColor" fillOpacity=".9" />);
export const IUpload = base(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>);
export const IShield = base(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5L16 9.5" /></>);
export const ISearch = base(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const IX = base(<path d="M6 6l12 12M18 6L6 18" />);
export const IPin = base(<><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" fill="currentColor" fillOpacity=".9" /><circle cx="12" cy="9.5" r="2.4" fill="#fff" stroke="none" /></>);
export const IBox = base(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>);
export const ICheck = base(<path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.4" />);
export const IBack = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IKeyboard = base(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7 14h10" /></>);
export const IReset = base(<><path d="M4 12a8 8 0 108-8" /><path d="M4 4v5h5" /></>);
export const ITrash = base(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>);
export const IExcel = ({ className = 'w-10 h-10' }: P) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden="true"><rect x="12" y="4" width="24" height="32" rx="4" fill="#21A366" /><rect x="3" y="10" width="20" height="20" rx="3" fill="#107C41" /><path d="M8.5 15.5l7 9M15.5 15.5l-7 9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
export const ICalendar = base(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></>);
export const IClock = base(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>);
export const IShirt = base(<path d="M8 4l-5 3 2.5 4L8 10v10h8V10l2.5 1L21 7l-5-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z" />);
export const IWarehouse = ({ className = 'w-14 h-14' }: P) => (
  <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 28L32 8l26 20v28H6z" /><rect x="22" y="30" width="9" height="9" /><rect x="33" y="30" width="9" height="9" /><rect x="27.5" y="20" width="9" height="9" />
    <path d="M18 56V42h28v14" />
  </svg>
);
export const IMinus = base(<path d="M6 12h12" strokeWidth="2.4" />);
export const IPlus = base(<path d="M12 6v12M6 12h12" strokeWidth="2.4" />);
export const IRefresh = base(<><path d="M20 12a8 8 0 11-2.3-5.7" /><path d="M20 4v5h-5" /></>);
