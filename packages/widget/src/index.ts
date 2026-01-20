// ============================================
// SnapStudio Widget V3 - Export public
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
  // Configuration
  SnapStudioConfig,
  
  // Assets & Catalogue
  Asset,
  Brand,
  Catalog,
  
  // Leads
  Lead,
  DimensioningData,
  
  // Génération
  MaskBoundingBox,
  GenerationOptions,
  GenerateRequest,
  GenerateResponse,
  GenerationResult,
  GenerationStatus,
  Generation,
  
  // Calendrier / RDV
  TimeSlot,
  Appointment,
  
  // Composants
  WidgetStep,
  MaskCanvasProps,
  ResultViewerProps,
  LimitReachedProps,
  SnapStudioProps,
  WidgetState,
} from './types';
