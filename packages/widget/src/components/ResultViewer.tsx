import { useState } from 'react';
import type { ResultViewerProps } from '../types';

// Helper pour obtenir le nom de la marque (string ou objet)
function getBrandName(brand: string | { name: string } | unknown): string {
  if (typeof brand === 'string') {
    return brand;
  }
  if (brand && typeof brand === 'object' && 'name' in brand) {
    return (brand as { name: string }).name;
  }
  return '';
}

export function ResultViewer({
  originalImage,
  resultImage,
  asset,
  simulationsRemaining,
  onNewSimulation,
  onDownload,
  onReset,
  ctaText = 'Demander un devis',
  ctaUrl,
  onCtaClick,
}: ResultViewerProps) {
  const [viewMode, setViewMode] = useState<'result' | 'compare'>('result');
  const [comparePosition, setComparePosition] = useState(50);

  const brandName = getBrandName(asset.brand);

  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
    }
    try {
      const response = await fetch(resultImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapstudio-${asset.name.replace(/\s+/g, '-').toLowerCase()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors du téléchargement:', error);
    }
  };

  const handleCtaClick = () => {
    if (onCtaClick) {
      onCtaClick();
    }
    if (ctaUrl) {
      window.open(ctaUrl, '_blank');
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else if (onNewSimulation) {
      onNewSimulation();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setComparePosition(Number(e.target.value));
  };

  // Obtenir l'image à afficher pour l'asset
  const getAssetDisplayImage = (): string => {
    // Priorité : imageDetoureeUrl > imageDetouree > placeholder
    if (asset.imageDetoureeUrl) {
      return asset.imageDetoureeUrl;
    }
    if (asset.imageDetouree) {
      return asset.imageDetouree;
    }
    // Placeholder si aucune image
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect fill="%23f0f0f0" width="60" height="60"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="10">No img</text></svg>';
  };

  return (
    <div className="snapstudio-result">
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
          <img src={resultImage} alt="Résultat généré" />
        </div>
      )}

      {/* Vue Comparaison */}
      {viewMode === 'compare' && (
        <div className="snapstudio-result-compare">
          <div className="snapstudio-compare-container">
            {/* Image Après (fond) */}
            <div className="snapstudio-compare-after">
              <img src={resultImage} alt="Après" />
              <span className="snapstudio-compare-label snapstudio-label-after">Après</span>
            </div>
            
            {/* Image Avant (overlay clippé) */}
            <div 
              className="snapstudio-compare-before"
              style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}
            >
              <img src={originalImage} alt="Avant" />
              <span className="snapstudio-compare-label snapstudio-label-before">Avant</span>
            </div>
            
            {/* Ligne de séparation */}
            <div 
              className="snapstudio-compare-handle"
              style={{ left: `${comparePosition}%` }}
            >
              <div className="snapstudio-compare-handle-line" />
              <div className="snapstudio-compare-handle-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M8 12L4 8M4 8L8 4M4 8H20M16 12L20 16M20 16L16 20M20 16H4" 
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        transform="rotate(90 12 12)"/>
                </svg>
              </div>
            </div>
            
            {/* Slider invisible pour le contrôle */}
            <input
              type="range"
              min="0"
              max="100"
              value={comparePosition}
              onChange={handleSliderChange}
              className="snapstudio-compare-slider"
              aria-label="Comparer avant et après"
            />
          </div>
        </div>
      )}

      {/* Info produit */}
      <div className="snapstudio-result-product">
        <img
          src={getAssetDisplayImage()}
          alt={asset.name}
          className="snapstudio-result-product-image"
        />
        <div className="snapstudio-result-product-info">
          <span className="snapstudio-result-product-brand">{brandName}</span>
          <span className="snapstudio-result-product-name">{asset.name}</span>
          {(asset.powerKw || asset.metadata?.puissance_kw) && (
            <span className="snapstudio-result-product-specs">
              {asset.powerKw || asset.metadata?.puissance_kw} kW
              {(asset.efficiencyPct || asset.metadata?.rendement_pct) && 
                ` • ${asset.efficiencyPct || asset.metadata?.rendement_pct}% rendement`}
            </span>
          )}
        </div>
      </div>

      {/* Simulations restantes */}
      {simulationsRemaining !== undefined && (
        <div className="snapstudio-result-remaining">
          {simulationsRemaining > 0 ? (
            <span>🎯 {simulationsRemaining} simulation{simulationsRemaining > 1 ? 's' : ''} restante{simulationsRemaining > 1 ? 's' : ''}</span>
          ) : (
            <span>⚠️ Plus de simulations disponibles</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="snapstudio-result-actions">
        <button
          className="snapstudio-btn-secondary"
          onClick={handleReset}
        >
          ↺ Nouvelle génération
        </button>
        <button
          className="snapstudio-btn-secondary"
          onClick={handleDownload}
        >
          ⬇ Télécharger
        </button>
        <button
          className="snapstudio-btn-primary"
          onClick={handleCtaClick}
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
}
