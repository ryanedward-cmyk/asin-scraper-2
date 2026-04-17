xport const metadata = { title: 'ASIN Alert' };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', background: '#f7f6f2', color: '#28251d' }}>
        {children}
      </body>
    </html>
  );
}
