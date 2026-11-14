import React, { createContext, useContext, useState, useMemo } from 'react';

interface SelectionContextType {
  targetState: string | null;
  targetEventId: string | null;
  selectTargetState: (name: string | null) => void;
  selectTargetEvent: (id: string | null) => void;
  clearTargetSelection: () => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [targetState, setTargetState] = useState<string | null>(null);
  const [targetEventId, setTargetEventId] = useState<string | null>(null);

  const selectTargetState = (name: string | null) => {
    setTargetState(name);
    setTargetEventId(null);
  };

  const selectTargetEvent = (id: string | null) => {
    setTargetEventId(id);
  };

  const clearTargetSelection = () => {
    setTargetState(null);
    setTargetEventId(null);
  };

  const value = useMemo(
    () => ({
      targetState,
      targetEventId,
      selectTargetState,
      selectTargetEvent,
      clearTargetSelection,
    }),
    [targetState, targetEventId]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
}
