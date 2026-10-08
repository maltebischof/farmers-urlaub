export default function manifest() {
  return {
    name: 'Farmers Urlaubsverwaltung',
    short_name: 'Urlaub',
    description: 'Urlaubsverwaltung – Farmers Food',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f8f3',
    theme_color: '#6AB801',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
