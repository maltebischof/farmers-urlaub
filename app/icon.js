import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6AB801',
        }}
      >
        <svg width="320" height="320" viewBox="0 0 24 24" fill="#ffffff">
          <path d="M11 21A8 8 0 0 1 9.6 5.1C16 3.8 17.6 3.2 20 0c1.2 2.2 2.4 4.9 2.4 9.4 0 6.4-5.3 11.6-11.4 11.6Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
