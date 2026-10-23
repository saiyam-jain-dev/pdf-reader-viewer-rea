import { useCallback, useState } from 'react';
import { createBlankPdf, openPdf } from '../lib/pdfEngine.js';

export function usePdfDocument() {
  const [documentState, setDocumentState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setDocumentState(await openPdf(file));
    } catch (cause) {
      console.error(cause);
      setError(cause.message || 'Could not open this PDF.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openBlank = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setDocumentState(await createBlankPdf());
    } catch (cause) {
      console.error(cause);
      setError('Could not create a blank PDF.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { documentState, busy, error, openFile, openBlank };
}
