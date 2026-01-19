// ============================================
// SnapStudio Widget V2 - Composant Principal
// ============================================

import { useState, useCallback, useEffect } from 'react';
import type {
  SnapStudioProps,
  Asset,
  WidgetStep,
  Generation,
} from '../types';
import { useGeneration } from '../hooks/useGeneration';
import { ImageUploader } from './ImageUploader';
import { MaskCanvas } from './MaskCanvas';
import { AssetSelector } from './AssetSelector';
import { LoadingState } from './LoadingState';
import { ResultViewer } from './ResultViewer';
import { LimitReached } from './LimitReached';
import '../styles/snapstudio.css';

export function SnapStudio({
  config,
  leadToken,
  initialAssetId,
  assets,
  simulationsRemaining: initialRemaining,
  onSimulationComplete,
  onLimitReached,
  onError,
  onBookAppointment,
  branding = {},
  className = '',
}: SnapStudioProps) {
  // État du widget
  const [step, setStep] = useState<WidgetStep>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(
    assets.find((a) => a.id === initialAssetId) || assets[0] || null
  );
  const [remaining, setRemaining] = useState(initialRemaining);
  const [generations, setGenerations] = useState<Generation[]>([]);

  // Hook de génération
  const { status, result, error, generate, reset } = useGeneration({
    config,
    onSuccess: (res) => {
      setRemaining(res.simulationsRemaining);
      
      // Ajouter à l'historique des générations
      const newGeneration: Generation = {
        id: res.generationId,
        resultImagePath: res.resultImageUrl,
        resultImageUrl: res.resultImageUrl,
        asset: {
          id: res.asset.id,
          name: res.asset.name,
          brand: res.asset.brand,
        },
        createdAt: new Date().toISOString(),
      };
      setGenerations((prev) => [...prev, newGeneration]);
      
      onSimulationComplete?.(res);
    },
    onError,
    onLimitReached: () => {
      setStep('limit');
      onLimitReached?.();
    },
  });

  // Vérifier si limite atteinte au chargement
  useEffect(() => {
    if (initialRemaining <= 0) {
      setStep('limit');
    }
  }, [initialRemaining]);

  // Effet pour passer au résultat quand la génération est terminée
  useEffect(() => {
    if (status === 'completed' && result) {
      setStep('result');
    } else if (status === 'limit_reached') {
      setStep('limit');
    } else if (status === 'error') {
      setStep('mask'); // Retour au masque pour réessayer
    }
  }, [status, result]);

  // Upload terminé → passer au masque
  const handleImageUpload = useCallback((imageData: string) => {
    setUploadedImage(imageData);
    setMaskImage(null);
    setStep('mask');
  }, []);

  // Masque modifié
  const handleMaskChange = useCallback((maskData: string) => {
    setMaskImage(maskData);
  }, []);

  // Changer d'asset
  const handleAssetChange = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
  }, []);

  // Lancer la génération
  const handleGenerate = useCallback(async () => {
    if (!uploadedImage || !maskImage || !selectedAsset) return;

    setStep('generating');

    await generate({
      leadToken,
      assetId: selectedAsset.id,
      inputImage: uploadedImage,
      maskImage: maskImage,
    });
  }, [uploadedImage, maskImage, selectedAsset, leadToken, generate]);

  // Nouvelle simulation
  const handleNewSimulation = useCallback(() => {
    if (remaining <= 0) {
      setStep('limit');
      onLimitReached?.();
      return;
    }

    // Réinitialiser pour nouvelle simulation
    setUploadedImage(null);
    setMaskImage(null);
    reset();
    setStep('upload');
  }, [remaining, reset, onLimitReached]);

  // Retour à l'upload
  const handleBackToUpload = useCallback(() => {
    setUploadedImage(null);
    setMaskImage(null);
    setStep('upload');
  }, []);

  // Téléchargement
  const handleDownload = useCallback(() => {
    console.log('Image téléchargée');
  }, []);

  // Prise de RDV
  const handleBookAppointment = useCallback(() => {
    onBookAppointment?.();
  }, [onBookAppointment]);

  // Styles personnalisés
  const customStyles = {
    '--ss-primary-color': branding.primaryColor || '#E63946',
    '--ss-secondary-color': branding.secondaryColor || '#1D3557',
  } as React.CSSProperties;

  return (
    <div className={`snapstudio-widget ${className}`} style={customStyles}>
      {/* Header */}
      <div className="snapstudio-header">
        <div className="snapstudio-header-left">
          {branding.logo ? (
            <img src={branding.logo} alt="Logo" className="snapstudio-logo" />
          ) : (
            <h2 className="snapstudio-title">🔥 Visualisez votre poêle</h2>
          )}
        </div>
        
        {step !== 'limit' && step !== 'generating' && (
          <div className="snapstudio-header-right">
            <span className="snapstudio-counter">
              {remaining > 0 ? (
                <>Simulation {initialRemaining - remaining + 1}/{initialRemaining}</>
              ) : (
                <>Simulations épuisées</>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Sélecteur d'asset (visible sauf en génération et limite) */}
      {step !== 'generating' && step !== 'limit' && step !== 'upload' && assets.length > 1 && (
        <div className="snapstudio-asset-bar">
          <AssetSelector
            assets={assets}
            selectedAsset={selectedAsset}
            onSelect={handleAssetChange}
            compact={true}
          />
        </div>
      )}

      {/* Contenu principal */}
      <div className="snapstudio-content">
        {/* Étape 1: Upload */}
        {step === 'upload' && (
          <ImageUploader
            onImageUpload={handleImageUpload}
            maxSizeMB={10}
            maxDimension={2048}
          />
        )}

        {/* Étape 2: Masque */}
        {step === 'mask' && uploadedImage && (
          <div className="snapstudio-step-mask">
            <MaskCanvas
              backgroundImage={uploadedImage}
              onMaskChange={handleMaskChange}
              onGenerate={handleGenerate}
              canGenerate={!!maskImage && !!selectedAsset}
              isGenerating={false}
            />
            
            <button
              className="snapstudio-btn-back"
              onClick={handleBackToUpload}
            >
              ← Changer de photo
            </button>
          </div>
        )}

        {/* Étape 3: Génération */}
        {step === 'generating' && (
          <LoadingState
            assetName={selectedAsset?.name}
            brandName={selectedAsset?.brand.name}
          />
        )}

        {/* Étape 4: Résultat */}
        {step === 'result' && result && selectedAsset && (
          <ResultViewer
            originalImage={uploadedImage!}
            resultImage={result.resultImageUrl}
            asset={selectedAsset}
            simulationsRemaining={remaining}
            onNewSimulation={handleNewSimulation}
            onDownload={handleDownload}
          />
        )}

        {/* Étape 5: Limite atteinte */}
        {step === 'limit' && (
          <LimitReached
            generations={generations}
            onBookAppointment={handleBookAppointment}
          />
        )}

        {/* Erreur */}
        {error && step === 'mask' && (
          <div className="snapstudio-error">
            <p>❌ {error}</p>
            <button className="snapstudio-btn-secondary" onClick={() => reset()}>
              Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="snapstudio-footer">
        <span>Powered by SnapStudio • IA by fal.ai</span>
      </div>
    </div>
  );
}
