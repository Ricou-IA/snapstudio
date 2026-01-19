import { useState, useEffect } from 'react';

const loadingMessages = [
  "Analyse de votre pièce...",
  "Calcul de l'éclairage...",
  "Positionnement du poêle...",
  "Génération de l'image...",
  "Ajustement des ombres...",
  "Finalisation...",
];

export function LoadingState() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Rotation des messages
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2500);

    // Progression simulée
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 500);

    return () => {
      clearInterval(messageInterval);
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
        <p className="snapstudio-loading-message">
          {loadingMessages[messageIndex]}
        </p>
        <p className="snapstudio-loading-wait">
          Veuillez patienter, cela peut prendre jusqu'à 30 secondes
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
