import { useState, useCallback } from 'react';
import type {
  Asset,
  GenerationOptions,
  GenerateResponse,
  GenerationStatus,
} from '../types';

interface UseGenerationProps {
  apiUrl: string;
  onGenerated?: (result: GenerateResponse) => void;
  onError?: (error: Error) => void;
}

interface UseGenerationReturn {
  status: GenerationStatus;
  result: GenerateResponse | null;
  error: string | null;
  generate: (
    roomImage: string,
    asset: Asset,
    options?: GenerationOptions
  ) => Promise<void>;
  reset: () => void;
}

export function useGeneration({
  apiUrl,
  onGenerated,
  onError,
}: UseGenerationProps): UseGenerationReturn {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (
      roomImage: string,
      asset: Asset,
      options?: GenerationOptions
    ) => {
      setStatus('generating');
      setError(null);
      setResult(null);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomImage,
            asset: {
              id: asset.id,
              name: asset.name,
              description: asset.description,
              imageUrl: asset.imageUrl,
            },
            options,
          }),
        });

        const data: GenerateResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Erreur lors de la génération');
        }

        // Vérifier si limite atteinte
        if (typeof data.simulationsRemaining === 'number' && data.simulationsRemaining <= 0) {
          setStatus('limit_reached');
        } else {
          setStatus('completed');
        }
        
        setResult(data);
        onGenerated?.(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Erreur inconnue';
        setError(errorMessage);
        setStatus('error');
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    },
    [apiUrl, onGenerated, onError]
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
