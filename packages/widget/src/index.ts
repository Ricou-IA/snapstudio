// ============================================
// SnapStudio Widget V2 - Export public
// ============================================

// Composant principal
export { SnapStudio } from './components/SnapStudio';

// Composants individuels (pour usage avancé)
export { ImageUploader } from './components/ImageUploader';
export { AssetSelector } from './components/AssetSelector';
export { ResultViewer } from './components/ResultViewer';
export { LoadingState } from './components/LoadingState';
export { MaskCanvas } from './components/MaskCanvas';
export { LimitReached } from './components/LimitReached';

// Hook
export { useGeneration } from './hooks/useGeneration';

// API Client
export { SnapStudioClient, initClient, getClient } from './api/client';

// Types
export type {
  Asset,
  Lead,
  GenerationResult,
  Generation,
  TimeSlot,
  Appointment,
  SnapStudioConfig,
  SnapStudioProps,
  GenerationStatus,
  WidgetStep,
  DimensioningData,
  MaskCanvasProps,
  ResultViewerProps,
  LimitReachedProps,
  GenerateRequest,
  GenerateResponse,
} from './types';
