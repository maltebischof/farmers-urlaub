export const metadata = {
  title: 'Urlaubsverwaltung Farmers',
  description: 'Urlaubsverwaltungssystem für Farmers Food',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  );
}
