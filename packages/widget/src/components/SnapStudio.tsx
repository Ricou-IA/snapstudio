import { useState, useCallback } from 'react';
import type { Asset, GenerationOptions, SnapStudioProps, WidgetState } from '../types';
import { useGeneration } from '../hooks/useGeneration';
import { ImageUploader } from './ImageUploader';
import { AssetSelector } from './AssetSelector';
import { ResultViewer } from './ResultViewer';
import { LoadingState } from './LoadingState';
import defaultCatalogData from '../catalog.json';
import '../styles/snapstudio.css';

const initialState: WidgetState = {
  status: 'idle',
  roomImage: null,
  roomImagePreview: null,
  selectedAsset: null,
  options: {
    position: 'auto',
    style: 'realistic',
  },
  result: null,
  error: null,
};

export function SnapStudio({
  apiUrl,
  vertical = 'hvac',
  catalog,
  onGenerated,
  onError,
  onCtaClick,
  branding = {},
  className = '',
}: SnapStudioProps) {
  const [state, setState] = useState<WidgetState>(initialState);

  const { status, result, error, generate, reset } = useGeneration({
    apiUrl,
    onGenerated,
    onError,
  });

  // Utiliser le catalogue fourni ou le catalogue par défaut
  const activeCatalog = catalog || defaultCatalogData;

  // Gestion de l'upload d'image
  const handleImageUpload = useCallback((base64: string, preview: string) => {
    setState((prev) => ({
      ...prev,
      roomImage: base64,
      roomImagePreview: preview,
    }));
  }, []);

  // Gestion de la sélection d'asset
  const handleAssetSelect = useCallback((asset: Asset) => {
    setState((prev) => ({
      ...prev,
      selectedAsset: asset,
    }));
  }, []);

  // Gestion des options
  const handleOptionsChange = useCallback((options: Partial<GenerationOptions>) => {
    setState((prev) => ({
      ...prev,
      options: { ...prev.options, ...options },
    }));
  }, []);

  // Lancer la génération
  const handleGenerate = useCallback(async () => {
    if (!state.roomImage || !state.selectedAsset) return;
    await generate(state.roomImage, state.selectedAsset, state.options);
  }, [state.roomImage, state.selectedAsset, state.options, generate]);

  // Réinitialiser
  const handleReset = useCallback(() => {
    setState(initialState);
    reset();
  }, [reset]);

  // Gestion du CTA
  const handleCtaClick = useCallback(() => {
    if (state.selectedAsset && result?.image?.url) {
      onCtaClick?.(state.selectedAsset, result.image.url);
    }
  }, [state.selectedAsset, result, onCtaClick]);

  // Styles personnalisés
  const customStyles = {
    '--ss-primary-color': branding.primaryColor || '#2563eb',
    '--ss-secondary-color': branding.secondaryColor || '#1e40af',
  } as React.CSSProperties;

  // Déterminer l'étape actuelle
  const currentStep = !state.roomImage
    ? 'upload'
    : !state.selectedAsset
    ? 'select'
    : status === 'generating'
    ? 'generating'
    : status === 'completed'
    ? 'result'
    : 'ready';

  return (
    <div className={`snapstudio-widget ${className}`} style={customStyles}>
      {/* Header */}
      <div className="snapstudio-header">
        {branding.logo ? (
          <img src={branding.logo} alt="Logo" className="snapstudio-logo" />
        ) : (
          <h2 className="snapstudio-title">
            {vertical === 'hvac' ? '🔥 Visualisez votre poêle' : 'SnapStudio'}
          </h2>
        )}
      </div>

      {/* Contenu principal */}
      <div className="snapstudio-content">
        {/* Étape 1: Upload image */}
        {currentStep === 'upload' && (
          <ImageUploader onImageUpload={handleImageUpload} />
        )}

        {/* Étape 2: Sélection asset */}
        {currentStep === 'select' && (
          <div className="snapstudio-step-select">
            <div className="snapstudio-preview-small">
              <img src={state.roomImagePreview!} alt="Votre pièce" />
              <button
                className="snapstudio-btn-change"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    roomImage: null,
                    roomImagePreview: null,
                  }))
                }
              >
                Changer
              </button>
            </div>
            <AssetSelector
              assets={activeCatalog.assets}
              selectedAsset={state.selectedAsset}
              onSelect={handleAssetSelect}
            />
          </div>
        )}

        {/* Étape 3: Prêt à générer */}
        {currentStep === 'ready' && (
          <div className="snapstudio-step-ready">
            <div className="snapstudio-ready-preview">
              <div className="snapstudio-ready-room">
                <img src={state.roomImagePreview!} alt="Votre pièce" />
                <span>Votre pièce</span>
              </div>
              <div className="snapstudio-ready-plus">+</div>
              <div className="snapstudio-ready-asset">
                <img src={state.selectedAsset!.imageUrl} alt={state.selectedAsset!.name} />
                <span>{state.selectedAsset!.name}</span>
              </div>
            </div>

            {/* Options */}
            <div className="snapstudio-options">
              <label>
                Position :
                <select
                  value={state.options.position}
                  onChange={(e) =>
                    handleOptionsChange({
                      position: e.target.value as GenerationOptions['position'],
                    })
                  }
                >
                  <option value="auto">Automatique</option>
                  <option value="left">Gauche</option>
                  <option value="center">Centre</option>
                  <option value="right">Droite</option>
                </select>
              </label>
              <label>
                Style :
                <select
                  value={state.options.style}
                  onChange={(e) =>
                    handleOptionsChange({
                      style: e.target.value as GenerationOptions['style'],
                    })
                  }
                >
                  <option value="realistic">Réaliste</option>
                  <option value="magazine">Magazine</option>
                  <option value="warm">Chaleureux</option>
                </select>
              </label>
            </div>

            {/* Boutons */}
            <div className="snapstudio-actions">
              <button
                className="snapstudio-btn-secondary"
                onClick={() =>
                  setState((prev) => ({ ...prev, selectedAsset: null }))
                }
              >
                ← Changer de poêle
              </button>
              <button
                className="snapstudio-btn-primary"
                onClick={handleGenerate}
              >
                ✨ Générer l'image
              </button>
            </div>
          </div>
        )}

        {/* Étape 4: Génération en cours */}
        {currentStep === 'generating' && <LoadingState />}

        {/* Étape 5: Résultat */}
        {currentStep === 'result' && result?.image && (
          <ResultViewer
            originalImage={state.roomImagePreview!}
            resultImage={result.image.url}
            asset={state.selectedAsset!}
            ctaText={branding.ctaText}
            ctaUrl={branding.ctaUrl}
            onCtaClick={handleCtaClick}
            onReset={handleReset}
          />
        )}

        {/* Erreur */}
        {status === 'error' && (
          <div className="snapstudio-error">
            <p>❌ {error}</p>
            <button className="snapstudio-btn-secondary" onClick={handleReset}>
              Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      {!branding.hidePoweredBy && (
        <div className="snapstudio-footer">
          <span>Powered by SnapStudio</span>
        </div>
      )}
    </div>
  );
}
