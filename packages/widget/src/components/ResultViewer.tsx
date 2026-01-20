import { useState } from 'react';
import type { Asset } from '../types';
import { getBrandName } from '../types';

interface ResultViewerProps {
  originalImage: string;
  resultImage: string;
  asset: Asset;
  ctaText?: string;
  ctaUrl?: string;
  onCtaClick?: () => void;
  onReset: () => void;
  onBookAppointment?: () => void;
}

export function ResultViewer({
  originalImage,
  resultImage,
  asset,
  ctaText = 'Demander un devis',
  ctaUrl,
  onCtaClick,
  onReset,
}: ResultViewerProps) {
  const [viewMode, setViewMode] = useState<'result' | 'compare'>('result');
  const [comparePosition, setComparePosition] = useState(50);

  const handleDownload = async () => {
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
            />
            <div className="snapstudio-compare-handle" />
          </div>
        </div>
      )}

      {/* Info produit */}
      <div className="snapstudio-result-product">
        <img
          src={asset.imageThumbnail || asset.imageUrl}
          alt={asset.name}
          className="snapstudio-result-product-image"
        />
        <div className="snapstudio-result-product-info">
          <span className="snapstudio-result-product-brand">{getBrandName(asset.brand)}</span>
          <span className="snapstudio-result-product-name">{asset.name}</span>
          {(asset.powerKw || asset.metadata?.puissance_kw) && (
            <span className="snapstudio-result-product-specs">
              {asset.powerKw || asset.metadata?.puissance_kw} kW
              {(asset.efficiencyPct || asset.metadata?.rendement_pct) && 
                ` • ${asset.efficiencyPct || asset.metadata?.rendement_pct}% rendement`
              }
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="snapstudio-result-actions">
        <button
          className="snapstudio-btn-secondary"
          onClick={onReset}
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
