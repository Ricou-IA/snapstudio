import { useState, useCallback } from 'react';
import type { Asset, GenerationOptions, GenerateResponse, SnapStudioProps, WidgetState, WidgetStep } from '../types';
import { ImageUploader } from './ImageUploader';
import { AssetSelector } from './AssetSelector';
import { MaskCanvas } from './MaskCanvas';
import { ResultViewer } from './ResultViewer';
import { LoadingState } from './LoadingState';
import defaultCatalogData from '../catalog.json';
import '../styles/snapstudio.css';

// ============================================
// État initial
// ============================================

const initialState: WidgetState = {
  status: 'idle',
  roomImage: null,
  roomImagePreview: null,
  markedImage: null,
  selectedAsset: null,
  options: {
    position: 'auto',
    style: 'realistic',
  },
  result: null,
  error: null,
};

// ============================================
// Composant Principal
// ============================================

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

  // Utiliser le catalogue fourni ou le catalogue par défaut
  const activeCatalog = catalog || defaultCatalogData;

  // ==========================================
  // Déterminer l'étape actuelle
  // ==========================================

  const getCurrentStep = (): WidgetStep => {
    if (state.status === 'error') return 'error';
    if (state.status === 'generating') return 'generating';
    if (state.status === 'completed' && state.result?.image) return 'result';
    if (!state.roomImage) return 'upload';
    if (!state.selectedAsset) return 'select';
    if (!state.markedImage) return 'mask';
    return 'ready';
  };

  const currentStep = getCurrentStep();

  // ==========================================
  // Handlers
  // ==========================================

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

  // Gestion de la validation du masque (image marquée)
  const handleMaskValidate = useCallback((markedImage: string) => {
    setState((prev) => ({
      ...prev,
      markedImage,
    }));
  }, []);

  // Retour depuis le MaskCanvas vers la sélection
  const handleMaskBack = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedAsset: null,
    }));
  }, []);

  // Gestion des options (legacy, conservé pour compatibilité)
  const handleOptionsChange = useCallback((options: Partial<GenerationOptions>) => {
    setState((prev) => ({
      ...prev,
      options: { ...prev.options, ...options },
    }));
  }, []);

  // Lancer la génération
  const handleGenerate = useCallback(async () => {
    if (!state.markedImage || !state.selectedAsset) return;

    setState((prev) => ({ ...prev, status: 'generating', error: null }));

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset_id: state.selectedAsset.id,
          marked_image: state.markedImage,
        }),
      });

      const data: GenerateResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la génération');
      }

      setState((prev) => ({
        ...prev,
        status: 'completed',
        result: data,
      }));

      onGenerated?.(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [apiUrl, state.markedImage, state.selectedAsset, onGenerated, onError]);

  // Réinitialiser complètement
  const handleReset = useCallback(() => {
    setState(initialState);
  }, []);

  // Retour à l'étape du masque pour modifier
  const handleBackToMask = useCallback(() => {
    setState((prev) => ({
      ...prev,
      markedImage: null,
      status: 'idle',
      result: null,
      error: null,
    }));
  }, []);

  // Gestion du CTA
  const handleCtaClick = useCallback(() => {
    if (state.selectedAsset && state.result?.image?.url) {
      onCtaClick?.(state.selectedAsset, state.result.image.url);
    }
  }, [state.selectedAsset, state.result, onCtaClick]);

  // ==========================================
  // Styles personnalisés
  // ==========================================

  const customStyles = {
    '--ss-primary-color': branding.primaryColor || '#2563eb',
    '--ss-secondary-color': branding.secondaryColor || '#1e40af',
  } as React.CSSProperties;

  // ==========================================
  // Rendu
  // ==========================================

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
        
        {/* ========================================
            Étape 1: Upload image
            ======================================== */}
        {currentStep === 'upload' && (
          <ImageUploader onImageUpload={handleImageUpload} />
        )}

        {/* ========================================
            Étape 2: Sélection asset
            ======================================== */}
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

        {/* ========================================
            Étape 3: Dessin du masque (zone verte)
            ======================================== */}
        {currentStep === 'mask' && (
          <MaskCanvas
            image={state.roomImagePreview!}
            onValidate={handleMaskValidate}
            onBack={handleMaskBack}
          />
        )}

        {/* ========================================
            Étape 4: Prêt à générer (récapitulatif)
            ======================================== */}
        {currentStep === 'ready' && (
          <div className="snapstudio-step-ready">
            <div className="snapstudio-ready-preview">
              <div className="snapstudio-ready-room">
                <img src={state.markedImage!} alt="Votre pièce avec zone marquée" />
                <span>Zone indiquée</span>
              </div>
              <div className="snapstudio-ready-plus">+</div>
              <div className="snapstudio-ready-asset">
                <img src={state.selectedAsset!.imageUrl} alt={state.selectedAsset!.name} />
                <span>{state.selectedAsset!.name}</span>
              </div>
            </div>

            {/* Résumé du poêle sélectionné */}
            <div className="snapstudio-ready-summary">
              <p>
                <strong>{state.selectedAsset!.brand}</strong> - {state.selectedAsset!.name}
              </p>
              {state.selectedAsset!.metadata?.puissance_kw && (
                <p className="snapstudio-ready-specs">
                  {state.selectedAsset!.metadata.puissance_kw} kW
                  {state.selectedAsset!.metadata?.rendement_pct && 
                    ` • ${state.selectedAsset!.metadata.rendement_pct}% rendement`
                  }
                </p>
              )}
            </div>

            {/* Boutons */}
            <div className="snapstudio-actions">
              <button
                className="snapstudio-btn-secondary"
                onClick={handleBackToMask}
              >
                ← Modifier la zone
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

        {/* ========================================
            Étape 5: Génération en cours
            ======================================== */}
        {currentStep === 'generating' && <LoadingState />}

        {/* ========================================
            Étape 6: Résultat
            ======================================== */}
        {currentStep === 'result' && state.result?.image && (
          <ResultViewer
            originalImage={state.roomImagePreview!}
            resultImage={state.result.image.url}
            asset={state.selectedAsset!}
            ctaText={branding.ctaText}
            ctaUrl={branding.ctaUrl}
            onCtaClick={handleCtaClick}
            onReset={handleReset}
          />
        )}

        {/* ========================================
            Erreur
            ======================================== */}
        {currentStep === 'error' && (
          <div className="snapstudio-error">
            <p>❌ {state.error}</p>
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
