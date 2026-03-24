import * as React from 'react';

// This component renders the Chattiphy logo SVG from public/chattiphy.svg
// You can add props for className, style, etc. as needed.
export function LogoChattiphy(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 199.42 41" fill="none" xmlns="http://www.w3.org/2000/svg">
      <image href="/chattiphy.svg" width="100%" height="100%" />
    </svg>
  );
}
