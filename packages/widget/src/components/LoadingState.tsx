// ============================================
// LoadingState V2
// ============================================

import { useState, useEffect } from 'react';

const loadingMessages = [
  "Analyse de votre pièce...",
  "Préparation du poêle...",
  "Calcul de l'éclairage...",
  "Positionnement intelligent...",
  "Ajustement des ombres...",
  "Intégration réaliste...",
  "Finalisation...",
];

interface LoadingStateProps {
  assetName?: string;
  brandName?: string;
}

export function LoadingState({ assetName, brandName }: LoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    // Rotation des messages
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 3000);

    // Animation des points
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    // Progression simulée (ralentit vers la fin)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const increment = Math.max(1, (95 - prev) * 0.1);
        return Math.min(prev + increment, 95);
      });
    }, 500);

    return () => {
      clearInterval(messageInterval);
      clearInterval(dotsInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="snapstudio-loading">
      <div className="snapstudio-loading-animation">
        <div className="snapstudio-loading-spinner">
          <div className="snapstudio-loading-flame">🔥</div>
        </div>
      </div>

      <div className="snapstudio-loading-text">
        {assetName && brandName && (
          <p className="snapstudio-loading-product">
            {brandName} {assetName}
          </p>
        )}
        <p className="snapstudio-loading-message">
          {loadingMessages[messageIndex]}{dots}
        </p>
        <p className="snapstudio-loading-wait">
          L'IA travaille pour vous. Cela peut prendre jusqu'à 30 secondes.
        </p>
      </div>

      <div className="snapstudio-loading-progress">
        <div className="snapstudio-loading-progress-bar">
          <div
            className="snapstudio-loading-progress-fill"
            style={{ width: `${Math.min(progress, 95)}%` }}
          />
        </div>
        <span className="snapstudio-loading-progress-text">
          {Math.round(Math.min(progress, 95))}%
        </span>
      </div>
    </div>
  );
}
