'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type SaveFn = (formData: FormData) => Promise<{ ok?: boolean; error?: string }>;

/**
 * Debounced auto-save for uncontrolled forms.
 *
 * Usage:
 *   const { saveStatus, formRef, handleChange } = useAutoSave(
 *     (fd) => updateClientAction(id, fd),
 *   );
 *   <form ref={formRef} onChange={handleChange}>
 */
export function useAutoSave(saveFn: SaveFn, debounceMs = 1500) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // Keep saveFn stable across renders without causing re-binding.
  const saveFnRef = useRef(saveFn);
  useEffect(() => { saveFnRef.current = saveFn; });

  const handleChange = useCallback(() => {
    clearTimeout(debounceRef.current);
    clearTimeout(savedRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      if (!formRef.current) return;
      try {
        const result = await saveFnRef.current(new FormData(formRef.current));
        if ('ok' in result && result.ok) {
          setSaveStatus('saved');
          savedRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    }, debounceMs);
  }, [debounceMs]);

  // Clean up on unmount.
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    clearTimeout(savedRef.current);
  }, []);

  return { saveStatus, formRef, handleChange };
}
