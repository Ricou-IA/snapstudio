// ============================================
// MaskCanvas V2 - Compositing JavaScript + Masque
// Pipeline: Dessin masque → Compositing PNG → Export pour IC-Light
// ============================================

import { useRef, useState, useEffect, useCallback } from 'react';
import type { MaskCanvasProps } from '../types';

const BRUSH_SIZE = 40;
const BRUSH_COLOR = 'rgba(255, 0, 0, 0.5)';

interface MaskBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export function MaskCanvas({
  backgroundImage,
  assetImageUrl,  // URL du PNG détouré du poêle
  onMaskChange,
  onCompositedImageReady,  // Nouvelle callback pour l'image compositée
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
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);

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
      
      // Sauvegarder l'état initial ET l'image originale pour compositing
      const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setOriginalImageData(initialState);
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

  // Calculer la bounding box du masque (zones rouges)
  const calculateMaskBoundingBox = useCallback((pixels: Uint8ClampedArray, width: number, height: number): MaskBoundingBox | null => {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let hasRedPixels = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        
        // Détecter les pixels rouges (notre couleur de masque)
        const isRed = r > 180 && g < 150 && b < 150;

        if (isRed) {
          hasRedPixels = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasRedPixels) return null;

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: boxWidth,
      height: boxHeight,
      centerX: minX + boxWidth / 2,
      centerY: minY + boxHeight / 2,
    };
  }, []);

  // Créer l'image compositée (photo originale + PNG poêle superposé)
  const createCompositedImage = useCallback(async (bbox: MaskBoundingBox): Promise<string | null> => {
    if (!originalImageData || !assetImageUrl) {
      console.error('Missing originalImageData or assetImageUrl');
      return null;
    }

    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Créer un canvas temporaire pour le compositing
    const compCanvas = document.createElement('canvas');
    compCanvas.width = canvas.width;
    compCanvas.height = canvas.height;
    const compCtx = compCanvas.getContext('2d');
    if (!compCtx) return null;

    // 1. Dessiner l'image originale (sans le masque rouge)
    compCtx.putImageData(originalImageData, 0, 0);

    // 2. Charger le PNG du poêle
    return new Promise((resolve) => {
      const assetImg = new Image();
      assetImg.crossOrigin = 'anonymous';
      
      assetImg.onload = () => {
        // 3. Calculer les dimensions et position du poêle
        // Le poêle doit remplir la zone masquée en conservant ses proportions
        const assetAspectRatio = assetImg.width / assetImg.height;
        const bboxAspectRatio = bbox.width / bbox.height;

        let drawWidth: number;
        let drawHeight: number;

        if (assetAspectRatio > bboxAspectRatio) {
          // Le poêle est plus large que la bbox → ajuster par largeur
          drawWidth = bbox.width;
          drawHeight = bbox.width / assetAspectRatio;
        } else {
          // Le poêle est plus haut que la bbox → ajuster par hauteur
          drawHeight = bbox.height;
          drawWidth = bbox.height * assetAspectRatio;
        }

        // Centrer le poêle dans la bbox
        // Position Y : aligner le bas du poêle avec le bas de la bbox (plus réaliste)
        const drawX = bbox.centerX - drawWidth / 2;
        const drawY = bbox.maxY - drawHeight;  // Aligner en bas

        // 4. Dessiner le PNG du poêle
        compCtx.drawImage(assetImg, drawX, drawY, drawWidth, drawHeight);

        // 5. Exporter l'image compositée
        const compositedImage = compCanvas.toDataURL('image/jpeg', 0.92);
        resolve(compositedImage);
      };

      assetImg.onerror = () => {
        console.error('Erreur de chargement du PNG du poêle');
        resolve(null);
      };

      assetImg.src = assetImageUrl;
    });
  }, [originalImageData, assetImageUrl]);

  // Exporter le masque ET créer l'image compositée
  const exportMaskAndComposite = useCallback(async () => {
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

    // Récupérer les pixels du canvas (avec le masque rouge)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Calculer la bounding box du masque
    const bbox = calculateMaskBoundingBox(pixels, canvas.width, canvas.height);

    // Créer le masque noir/blanc
    const maskImageData = maskCtx.createImageData(canvas.width, canvas.height);
    const maskPixels = maskImageData.data;

    let hasRedPixels = false;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      const isRed = r > 180 && g < 150 && b < 150;

      if (isRed) {
        maskPixels[i] = 255;
        maskPixels[i + 1] = 255;
        maskPixels[i + 2] = 255;
        maskPixels[i + 3] = 255;
        hasRedPixels = true;
      } else {
        maskPixels[i] = 0;
        maskPixels[i + 1] = 0;
        maskPixels[i + 2] = 0;
        maskPixels[i + 3] = 255;
      }
    }

    maskCtx.putImageData(maskImageData, 0, 0);
    
    setHasMask(hasRedPixels);
    
    // Exporter le masque en base64
    if (hasRedPixels) {
      const maskData = maskCanvas.toDataURL('image/png');
      onMaskChange(maskData);

      // Si on a l'URL du poêle, créer l'image compositée
      if (bbox && assetImageUrl && onCompositedImageReady) {
        const compositedImage = await createCompositedImage(bbox);
        if (compositedImage) {
          onCompositedImageReady(compositedImage, bbox);
        }
      }
    } else {
      onMaskChange('');
      if (onCompositedImageReady) {
        onCompositedImageReady('', null);
      }
    }
  }, [onMaskChange, onCompositedImageReady, assetImageUrl, calculateMaskBoundingBox, createCompositedImage]);

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
      exportMaskAndComposite();
    }
  }, [isDrawing, saveToHistory, exportMaskAndComposite]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
    
    // Re-exporter le masque et le composite
    setTimeout(exportMaskAndComposite, 0);
  }, [history, historyIndex, exportMaskAndComposite]);

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
    if (onCompositedImageReady) {
      onCompositedImageReady('', null);
    }
  }, [history, historyIndex, onMaskChange, onCompositedImageReady]);

  return (
    <div className="snapstudio-mask-container" ref={containerRef}>
      <div className="snapstudio-mask-instructions">
        <p>🖌️ <strong>Dessinez la zone</strong> où placer le poêle</p>
        <p className="snapstudio-mask-hint">
          Peignez grossièrement l'emplacement souhaité. Le poêle sera positionné automatiquement !
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
