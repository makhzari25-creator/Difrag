const path = require('path');
module.exports = {
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}')],
  theme: {
    extend: {
      colors: {
        primary: '#1E3A5F', accent: '#2EC4B6', success: '#22C55E', warning: '#F59E0B',
        danger: '#DC2626', system: '#3B82F6', physical: '#14B8A6', bg: '#FAFAF9',
        surface: '#FFFFFF', text: '#1F2937', muted: '#6B7280'
      },
      fontFamily: { vazir: ['Vazirmatn', 'Tahoma', 'sans-serif'] },
      borderRadius: { card: '16px', btn: '14px' },
      boxShadow: { card: '0 8px 24px rgba(30,58,95,.07)' }
    }
  },
  plugins: []
};
