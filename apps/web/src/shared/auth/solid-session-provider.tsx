import { SessionProvider } from '@inrupt/solid-ui-react';
import type { ReactNode } from 'react';

type SolidSessionProviderProps = {
  children: ReactNode;
};

export function SolidSessionProvider({ children }: SolidSessionProviderProps) {
  return (
    <SessionProvider
      sessionId="linx-session"
      restorePreviousSession
      onError={(error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Solid session error', error);
        }
      }}
    >
      {children}
    </SessionProvider>
  );
}











