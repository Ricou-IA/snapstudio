// ============================================
// MaskCanvas - Dessin du masque pour inpainting
// ============================================

import { useRef, useState, useEffect, useCallback } from 'react';
import type { MaskCanvasProps } from '../types';

const BRUSH_SIZE = 40;
const BRUSH_COLOR = 'rgba(255, 0, 0, 0.5)';

export function MaskCanvas({
  backgroundImage,
  onMaskChange,
  onGenerate,
  canGenerate,
  isGenerating = false,
}: MaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Charger l'image de fond et initialiser le canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Calculer les dimensions pour le canvas (max 800px de large)
      const maxWidth = Math.min(container.clientWidth - 32, 800);
      const scale = maxWidth / img.width;
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      // Définir la taille du canvas
      canvas.width = img.width;
      canvas.height = img.height;
      setCanvasSize({ width, height });

      // Dessiner l'image de fond
      ctx.drawImage(img, 0, 0);
      
      // Sauvegarder l'état initial
      const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([initialState]);
      setHistoryIndex(0);
      setImageLoaded(true);
    };

    img.onerror = () => {
      console.error('Erreur de chargement de l\'image');
    };

    img.src = backgroundImage;
  }, [backgroundImage]);

  // Sauvegarder dans l'historique
  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Couper l'historique si on a fait undo puis dessiné
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageData);
    
    // Limiter l'historique à 20 états
    if (newHistory.length > 20) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Exporter le masque (zones rouges → blanc, reste → noir)
  const exportMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Créer un canvas temporaire pour le masque
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    // Récupérer les pixels du canvas original
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Créer le masque : rouge → blanc, sinon → noir
    const maskImageData = maskCtx.createImageData(canvas.width, canvas.height);
    const maskPixels = maskImageData.data;

    let hasRedPixels = false;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // Détecter les pixels rouges (notre couleur de masque)
      // Rouge semi-transparent sur l'image = R élevé, G/B plus bas
      const isRed = r > 180 && g < 150 && b < 150;

      if (isRed) {
        // Zone masquée → blanc
        maskPixels[i] = 255;
        maskPixels[i + 1] = 255;
        maskPixels[i + 2] = 255;
        maskPixels[i + 3] = 255;
        hasRedPixels = true;
      } else {
        // Zone non masquée → noir
        maskPixels[i] = 0;
        maskPixels[i + 1] = 0;
        maskPixels[i + 2] = 0;
        maskPixels[i + 3] = 255;
      }
    }

    maskCtx.putImageData(maskImageData, 0, 0);
    
    setHasMask(hasRedPixels);
    
    // Exporter en base64
    if (hasRedPixels) {
      const maskData = maskCanvas.toDataURL('image/png');
      onMaskChange(maskData);
    } else {
      onMaskChange('');
    }
  }, [onMaskChange]);

  // Obtenir les coordonnées du pointeur
  const getPointerPosition = useCallback((
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // Dessiner un point
  const drawPoint = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.beginPath();
    ctx.arc(x, y, BRUSH_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = BRUSH_COLOR;
    ctx.fill();
  }, []);

  // Gestionnaire de dessin
  const handleDraw = useCallback((
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    
    const { x, y } = getPointerPosition(e);
    drawPoint(x, y);
  }, [isDrawing, getPointerPosition, drawPoint]);

  // Début du dessin
  const handleStart = useCallback((
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getPointerPosition(e);
    drawPoint(x, y);
  }, [getPointerPosition, drawPoint]);

  // Fin du dessin
  const handleEnd = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
      exportMask();
    }
  }, [isDrawing, saveToHistory, exportMask]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
    
    // Re-exporter le masque
    setTimeout(exportMask, 0);
  }, [history, historyIndex, exportMask]);

  // Effacer tout le masque
  const handleClear = useCallback(() => {
    if (historyIndex <= 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Revenir à l'état initial (image sans masque)
    ctx.putImageData(history[0], 0, 0);
    setHistoryIndex(0);
    setHasMask(false);
    onMaskChange('');
  }, [history, historyIndex, onMaskChange]);

  return (
    <div className="snapstudio-mask-container" ref={containerRef}>
      <div className="snapstudio-mask-instructions">
        <p>🖌️ <strong>Dessinez la zone</strong> où placer le poêle</p>
        <p className="snapstudio-mask-hint">
          Peignez grossièrement l'emplacement souhaité. L'IA s'occupera du reste !
        </p>
      </div>

      <div 
        className="snapstudio-mask-canvas-wrapper"
        style={{ 
          maxWidth: canvasSize.width || '100%',
          aspectRatio: canvasSize.width && canvasSize.height 
            ? `${canvasSize.width} / ${canvasSize.height}` 
            : 'auto'
        }}
      >
        {!imageLoaded && (
          <div className="snapstudio-mask-loading">
            Chargement de l'image...
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleDraw}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleDraw}
          onTouchEnd={handleEnd}
          style={{ 
            cursor: isGenerating ? 'wait' : 'crosshair',
            width: '100%',
            height: 'auto',
            display: imageLoaded ? 'block' : 'none',
            touchAction: 'none',
          }}
        />
      </div>

      <div className="snapstudio-mask-toolbar">
        <button 
          onClick={handleUndo} 
          disabled={historyIndex <= 0 || isGenerating}
          className="snapstudio-btn-icon"
          title="Annuler"
        >
          ↩️ Annuler
        </button>
        <button 
          onClick={handleClear}
          disabled={historyIndex <= 0 || isGenerating}
          className="snapstudio-btn-icon"
          title="Effacer tout"
        >
          🗑️ Effacer
        </button>
      </div>

      <div className="snapstudio-mask-actions">
        <button
          onClick={onGenerate}
          disabled={!canGenerate || !hasMask || isGenerating}
          className="snapstudio-btn-primary snapstudio-btn-generate"
        >
          {isGenerating ? (
            <>
              <span className="snapstudio-spinner"></span>
              Génération en cours...
            </>
          ) : (
            <>
              ✨ Générer la simulation
            </>
          )}
        </button>
      </div>

      {!hasMask && imageLoaded && (
        <p className="snapstudio-mask-warning">
          ⚠️ Dessinez une zone pour activer la génération
        </p>
      )}
    </div>
  );
}
