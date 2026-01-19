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

// Hook
export { useGeneration } from './hooks/useGeneration';

// Types
export type {
  Asset,
  Catalog,
  GenerationOptions,
  GenerateRequest,
  GenerateResponse,
  GenerationStatus,
  SnapStudioProps,
  WidgetState,
} from './types';

// Catalogue par défaut
export { default as defaultCatalog } from './catalog.json';
