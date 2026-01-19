// ============================================
// ResultViewer V2
// ============================================

import { useState, useCallback } from 'react';
import type { ResultViewerProps } from '../types';

export function ResultViewer({
  originalImage,
  resultImage,
  asset,
  simulationsRemaining,
  onNewSimulation,
  onDownload,
}: ResultViewerProps) {
  const [viewMode, setViewMode] = useState<'result' | 'compare'>('result');
  const [comparePosition, setComparePosition] = useState(50);

  // Télécharger l'image
  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(resultImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapstudio-${asset.brand.slug || 'poele'}-${asset.name.toLowerCase().replace(/\s+/g, '-')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onDownload();
    } catch (error) {
      console.error('Erreur lors du téléchargement:', error);
    }
  }, [resultImage, asset, onDownload]);

  return (
    <div className="snapstudio-result">
      {/* Header avec compteur */}
      <div className="snapstudio-result-header">
        <span className="snapstudio-result-success">✨ Simulation réussie !</span>
        {simulationsRemaining > 0 ? (
          <span className="snapstudio-result-remaining">
            {simulationsRemaining} simulation{simulationsRemaining > 1 ? 's' : ''} restante{simulationsRemaining > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="snapstudio-result-remaining warning">
            Dernière simulation utilisée
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="snapstudio-result-tabs">
        <button
          className={`snapstudio-result-tab ${viewMode === 'result' ? 'active' : ''}`}
          onClick={() => setViewMode('result')}
        >
          Résultat
        </button>
        <button
          className={`snapstudio-result-tab ${viewMode === 'compare' ? 'active' : ''}`}
          onClick={() => setViewMode('compare')}
        >
          Avant / Après
        </button>
      </div>

      {/* Vue Résultat */}
      {viewMode === 'result' && (
        <div className="snapstudio-result-image">
          <img src={resultImage} alt="Résultat de la simulation" />
        </div>
      )}

      {/* Vue Comparaison */}
      {viewMode === 'compare' && (
        <div className="snapstudio-result-compare">
          <div
            className="snapstudio-compare-container"
            style={{ '--compare-position': `${comparePosition}%` } as React.CSSProperties}
          >
            <div className="snapstudio-compare-before">
              <img src={originalImage} alt="Avant" />
              <span className="snapstudio-compare-label">Avant</span>
            </div>
            <div className="snapstudio-compare-after">
              <img src={resultImage} alt="Après" />
              <span className="snapstudio-compare-label">Après</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={comparePosition}
              onChange={(e) => setComparePosition(Number(e.target.value))}
              className="snapstudio-compare-slider"
              aria-label="Comparer avant/après"
            />
            <div className="snapstudio-compare-handle" />
          </div>
        </div>
      )}

      {/* Info produit */}
      <div className="snapstudio-result-product">
        <img
          src={asset.imageDetoureeUrl}
          alt={asset.name}
          className="snapstudio-result-product-image"
        />
        <div className="snapstudio-result-product-info">
          <span className="snapstudio-result-product-brand">{asset.brand.name}</span>
          <span className="snapstudio-result-product-name">{asset.name}</span>
          <div className="snapstudio-result-product-specs">
            {asset.powerKw && <span>{asset.powerKw} kW</span>}
            {asset.efficiencyPct && <span>• {asset.efficiencyPct}% rendement</span>}
            {asset.fuelType && (
              <span>• {asset.fuelType === 'bois' ? '🪵 Bois' : '🔶 Granulés'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="snapstudio-result-actions">
        <button
          className="snapstudio-btn-secondary"
          onClick={handleDownload}
        >
          ⬇️ Télécharger
        </button>
        
        {simulationsRemaining > 0 ? (
          <button
            className="snapstudio-btn-primary"
            onClick={onNewSimulation}
          >
            🔄 Nouvelle simulation
          </button>
        ) : (
          <button
            className="snapstudio-btn-primary snapstudio-btn-rdv"
            onClick={onNewSimulation}
          >
            📅 Prendre rendez-vous
          </button>
        )}
      </div>

      {/* Message encouragement */}
      {simulationsRemaining > 0 && (
        <p className="snapstudio-result-tip">
          💡 Essayez un autre poêle ou un autre angle de prise de vue !
        </p>
      )}
    </div>
  );
}
