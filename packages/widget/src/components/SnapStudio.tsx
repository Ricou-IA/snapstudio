import { useState, useCallback } from 'react';
import type { Asset, GenerateResponse, SnapStudioProps, WidgetState, WidgetStep } from '../types';
import { getBrandName } from '../types';
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
  apiUrl = '',
  vertical = 'hvac',
  catalog,
  onGenerated,
  onError,
  onCtaClick,
  branding = {},
  className = '',
}: SnapStudioProps) {
  const [state, setState] = useState<WidgetState>(initialState);

  // Debug: Log apiUrl at mount
  console.log('[SnapStudio] Component mounted with apiUrl:', apiUrl || '(empty)');

  // Utiliser le catalogue fourni ou le catalogue par défaut
  // Cast explicite pour gérer la compatibilité des types
  const activeCatalog = catalog || (defaultCatalogData as unknown as { id: string; name: string; vertical: string; assets: Asset[] });

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
  // ImageUploader V2 envoie un seul paramètre (base64)
  const handleImageUpload = useCallback((base64: string) => {
    console.log('[SnapStudio] Image uploaded, length:', base64.length);
    setState((prev) => ({
      ...prev,
      roomImage: base64,
      roomImagePreview: base64, // Même valeur car déjà redimensionnée
    }));
  }, []);

  // Gestion de la sélection d'asset
  const handleAssetSelect = useCallback((asset: Asset) => {
    console.log('[SnapStudio] Asset selected:', asset.name, asset.id);
    setState((prev) => ({
      ...prev,
      selectedAsset: asset,
    }));
  }, []);

  // Gestion de la validation du masque (image marquée)
  // MaskCanvas retourne un seul paramètre (markedImage en base64 JPEG)
  const handleMaskComplete = useCallback((markedImage: string) => {
    console.log('[SnapStudio] Mask completed, length:', markedImage.length);
    setState((prev) => ({
      ...prev,
      markedImage: markedImage,
    }));
  }, []);

  // Retour depuis le MaskCanvas vers la sélection
  const handleMaskCancel = useCallback(() => {
    console.log('[SnapStudio] Mask cancelled, going back to asset selection');
    setState((prev) => ({
      ...prev,
      selectedAsset: null,
    }));
  }, []);

  // Lancer la génération
  const handleGenerate = useCallback(async () => {
    console.log('[SnapStudio] ========================================');
    console.log('[SnapStudio] handleGenerate called');
    console.log('[SnapStudio] apiUrl:', apiUrl || '(empty)');
    console.log('[SnapStudio] markedImage:', state.markedImage ? `OK (${state.markedImage.length} chars)` : 'MISSING');
    console.log('[SnapStudio] selectedAsset:', state.selectedAsset ? state.selectedAsset.name : 'MISSING');
    console.log('[SnapStudio] ========================================');

    if (!state.markedImage) {
      console.error('[SnapStudio] ❌ markedImage is missing');
      return;
    }
    if (!state.selectedAsset) {
      console.error('[SnapStudio] ❌ selectedAsset is missing');
      return;
    }
    if (!apiUrl) {
      console.error('[SnapStudio] ❌ apiUrl is empty or not configured');
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'URL de l\'API non configurée. Vérifiez la prop apiUrl du widget.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: 'generating', error: null }));

    try {
      console.log('[SnapStudio] Calling API:', apiUrl);
      console.log('[SnapStudio] Request body:', {
        asset_id: state.selectedAsset.id,
        marked_image: `(base64, ${state.markedImage.length} chars)`,
      });

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

      console.log('[SnapStudio] Response status:', response.status);
      const data: GenerateResponse = await response.json();
      console.log('[SnapStudio] Response data:', data);

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
      console.error('[SnapStudio] ❌ Error:', err);
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
    console.log('[SnapStudio] Reset to initial state');
    setState(initialState);
  }, []);

  // Retour à l'étape du masque pour modifier
  const handleBackToMask = useCallback(() => {
    console.log('[SnapStudio] Going back to mask step');
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
      console.log('[SnapStudio] CTA clicked for asset:', state.selectedAsset.name);
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
              assets={activeCatalog.assets as Asset[]}
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
            onValidate={handleMaskComplete}
            onBack={handleMaskCancel}
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
                <strong>{getBrandName(state.selectedAsset!.brand)}</strong> - {state.selectedAsset!.name}
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

            {/* Debug info (à retirer en production) */}
            {!apiUrl && (
              <div style={{ 
                marginTop: '16px', 
                padding: '12px', 
                background: '#fef2f2', 
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '14px'
              }}>
                ⚠️ <strong>Debug:</strong> apiUrl n'est pas configurée. Le bouton ne fonctionnera pas.
              </div>
            )}
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
