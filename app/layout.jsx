export const metadata = {
  title: 'Farmers Urlaub',
  description: 'Urlaubsverwaltung – Farmers Food',
  applicationName: 'Farmers Urlaub',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Urlaub',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#6AB801',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; }
          html { -webkit-text-size-adjust: 100%; }
          html, body { margin: 0; padding: 0; background: #f6f8f3; overflow-x: hidden; }
          @media (max-width: 640px) {
            .fm-hide-sm { display: none !important; }
          }
        ` }} />
        {children}
      </body>
    </html>
  );
}
