// ============================================
// Hook useGeneration V2
// ============================================

import { useState, useCallback } from 'react';
import type {
  SnapStudioConfig,
  GenerateRequest,
  GenerateResponse,
  GenerationStatus,
} from '../types';
import { SnapStudioClient } from '../api/client';

interface UseGenerationProps {
  config: SnapStudioConfig;
  onSuccess?: (result: GenerateResponse) => void;
  onError?: (error: Error) => void;
  onLimitReached?: () => void;
}

interface UseGenerationReturn {
  status: GenerationStatus;
  result: GenerateResponse | null;
  error: string | null;
  generate: (request: Omit<GenerateRequest, 'mockMode'>) => Promise<void>;
  reset: () => void;
}

export function useGeneration({
  config,
  onSuccess,
  onError,
  onLimitReached,
}: UseGenerationProps): UseGenerationReturn {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (request: Omit<GenerateRequest, 'mockMode'>) => {
      setStatus('generating');
      setError(null);
      setResult(null);

      try {
        const client = new SnapStudioClient(config);
        
        const response = await client.generate({
          ...request,
          mockMode: config.mockMode,
        });

        setResult(response);
        setStatus('completed');
        onSuccess?.(response);

        // Vérifier si c'était la dernière simulation
        if (response.simulationsRemaining <= 0) {
          onLimitReached?.();
        }
      } catch (err) {
        const error = err as Error & { code?: string };
        
        if (error.code === 'limit_reached') {
          setStatus('limit_reached');
          onLimitReached?.();
        } else {
          setError(error.message);
          setStatus('error');
          onError?.(error);
        }
      }
    },
    [config, onSuccess, onError, onLimitReached]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    result,
    error,
    generate,
    reset,
  };
}
