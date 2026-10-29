const path = require('path');
module.exports = {
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}')],
  theme: {
    extend: {
      colors: {
        primary: '#0E2A4D', accent: '#0F8B84', success: '#1F9D4A', warning: '#F59E0B',
        danger: '#DC2626', system: '#3B82F6', physical: '#14B8A6', bg: '#F8F8F6',
        surface: '#FFFFFF', text: '#1F2937', muted: '#6B7280'
      },
      fontFamily: { vazir: ['Vazirmatn', 'Tahoma', 'sans-serif'] },
      borderRadius: { card: '16px', btn: '14px' },
      boxShadow: { card: '0 4px 18px rgba(14,42,77,.08)' }
    }
  },
  plugins: []
};
