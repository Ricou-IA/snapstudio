// ============================================
// SnapStudio Widget - Export public
// ============================================

// Composant principal
export { SnapStudio } from './components/SnapStudio';

// Composants individuels (pour usage avancé)
export { ImageUploader } from './components/ImageUploader';
export { AssetSelector } from './components/AssetSelector';
export { ResultViewer } from './components/ResultViewer';
export { LoadingState } from './components/LoadingState';
export { LimitReached } from './components/LimitReached';
export { MaskCanvas } from './components/MaskCanvas';

// Hook
export { useGeneration } from './hooks/useGeneration';

// Types
export type {
  Asset,
  Brand,
  Catalog,
  GenerationOptions,
  GenerateRequest,
  GenerateResponse,
  GenerationStatus,
  SnapStudioProps,
  WidgetState,
  WidgetStep,
  Lead,
  TimeSlot,
  Appointment,
  Generation,
  SnapStudioConfig,
  MaskCanvasProps,
  ResultViewerProps,
  LimitReachedProps,
  AssetSelectorProps,
  ImageUploaderProps,
  LoadingStateProps,
} from './types';

// Helpers
export { getBrandName, getBrandId } from './types';

// Catalogue par défaut
export { default as defaultCatalog } from './catalog.json';
