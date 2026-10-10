import { createContext, useContext } from 'react';

/** Minimal help hook for the kit; the drawer itself arrives with T4.1. */
export interface HelpApi {
  open(helpId: string): void;
  /** Close the drawer and return focus to whatever opened it. */
  close(): void;
}

export const HelpContext = createContext<HelpApi>({ open: () => {}, close: () => {} });
export const useHelp = () => useContext(HelpContext);
