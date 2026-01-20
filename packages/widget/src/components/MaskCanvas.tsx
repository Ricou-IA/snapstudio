import { useRef, useState, useEffect, useCallback } from 'react';

// ============================================================================
// MaskCanvas - Composant pour dessiner le masque de positionnement
// 
// L'utilisateur "gomme" une zone sur sa photo pour indiquer où placer le poêle
// Le masque est exporté en PNG (blanc sur fond noir) pour l'Edge Function
// ============================================================================

interface MaskCanvasProps {
  /** Image de la pièce en base64 ou URL */
  roomImage: string;
  /** Callback quand le masque est validé */
  onMaskComplete: (maskBase64: string, previewBase64: string) => void;
  /** Callback pour annuler */
  onCancel: () => void;
  /** Taille du pinceau en pixels */
  brushSize?: number;
  /** Couleur de prévisualisation du masque */
  maskColor?: string;
  /** Opacité de la prévisualisation */
  maskOpacity?: number;
}

interface Point {
  x: number;
  y: number;
}

export function MaskCanvas({
  roomImage,
  onMaskComplete,
  onCancel,
  brushSize: initialBrushSize = 40,
  maskColor = '#FF6B6B',
  maskOpacity = 0.5,
}: MaskCanvasProps) {
  // Refs pour les canvas
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);

  // State
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(initialBrushSize);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Charger l'image et initialiser les canvas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Calculer la taille pour tenir dans le container tout en gardant le ratio
      const maxWidth = containerRef.current?.clientWidth || 800;
      const maxHeight = window.innerHeight * 0.6;
      
      let width = img.width;
      let height = img.height;
      
      // Redimensionner si nécessaire
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
      }
      if (height > maxHeight) {
        const ratio = maxHeight / height;
        height = height * ratio;
        width = width * ratio;
      }

      setCanvasSize({ width: Math.round(width), height: Math.round(height) });

      // Dessiner l'image sur le canvas d'image
      const imageCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const cursorCanvas = cursorCanvasRef.current;

      if (imageCanvas && maskCanvas && cursorCanvas) {
        // Configurer les canvas
        imageCanvas.width = width;
        imageCanvas.height = height;
        maskCanvas.width = width;
        maskCanvas.height = height;
        cursorCanvas.width = width;
        cursorCanvas.height = height;

        // Dessiner l'image de fond
        const imageCtx = imageCanvas.getContext('2d')!;
        imageCtx.drawImage(img, 0, 0, width, height);

        // Initialiser le canvas de masque (transparent)
        const maskCtx = maskCanvas.getContext('2d')!;
        maskCtx.clearRect(0, 0, width, height);

        // Sauvegarder l'état initial dans l'historique
        const initialState = maskCtx.getImageData(0, 0, width, height);
        setHistory([initialState]);
        setHistoryIndex(0);

        setImageLoaded(true);
      }
    };

    img.onerror = () => {
      console.error('Erreur de chargement de l\'image');
    };

    img.src = roomImage;
  }, [roomImage]);

  // Dessiner le curseur
  const drawCursor = useCallback((x: number, y: number) => {
    const cursorCanvas = cursorCanvasRef.current;
    if (!cursorCanvas) return;

    const ctx = cursorCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

    // Cercle du pinceau
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = maskColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Point central
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = maskColor;
    ctx.fill();
  }, [brushSize, maskColor]);

  // Effacer le curseur
  const clearCursor = useCallback(() => {
    const cursorCanvas = cursorCanvasRef.current;
    if (!cursorCanvas) return;
    const ctx = cursorCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  }, []);

  // Obtenir les coordonnées relatives au canvas
  const getCanvasCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = maskCanvasRef.current;
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

  // Dessiner un point de masque
  const drawMaskPoint = useCallback((x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d')!;
    
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = maskColor;
    ctx.globalAlpha = maskOpacity;
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [brushSize, maskColor, maskOpacity]);

  // Dessiner une ligne entre deux points
  const drawMaskLine = useCallback((from: Point, to: Point) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d')!;
    
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = maskColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = maskOpacity;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [brushSize, maskColor, maskOpacity]);

  // Sauvegarder l'état dans l'historique
  const saveToHistory = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    // Supprimer les états après l'index actuel (si on a fait undo puis dessiné)
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageData);

    // Limiter la taille de l'historique
    if (newHistory.length > 20) {
      newHistory.shift();
    }

    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Dernier point pour le tracé de ligne
  const lastPointRef = useRef<Point | null>(null);

  // Handlers de dessin
  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const point = getCanvasCoordinates(e);
    setIsDrawing(true);
    setHasDrawn(true);
    lastPointRef.current = point;
    drawMaskPoint(point.x, point.y);
  }, [getCanvasCoordinates, drawMaskPoint]);

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const point = getCanvasCoordinates(e);
    drawCursor(point.x, point.y);

    if (!isDrawing) return;
    e.preventDefault();

    if (lastPointRef.current) {
      drawMaskLine(lastPointRef.current, point);
    }
    lastPointRef.current = point;
  }, [getCanvasCoordinates, drawCursor, isDrawing, drawMaskLine]);

  const handleEnd = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      lastPointRef.current = null;
      saveToHistory();
    }
  }, [isDrawing, saveToHistory]);

  const handleLeave = useCallback(() => {
    clearCursor();
    if (isDrawing) {
      handleEnd();
    }
  }, [clearCursor, isDrawing, handleEnd]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);

      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas && history[newIndex]) {
        const ctx = maskCanvas.getContext('2d')!;
        ctx.putImageData(history[newIndex], 0, 0);
      }
    }
  }, [historyIndex, history]);

  // Effacer tout
  const handleClear = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const ctx = maskCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    setHasDrawn(false);
    saveToHistory();
  }, [saveToHistory]);

  // Exporter le masque
  const exportMask = useCallback((): string => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return '';

    // Créer un canvas temporaire pour le masque final (blanc sur noir)
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = maskCanvas.width;
    exportCanvas.height = maskCanvas.height;
    const ctx = exportCanvas.getContext('2d')!;

    // Fond noir
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Récupérer les pixels du masque dessiné
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    // Convertir les pixels colorés en blanc
    const exportData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
    
    for (let i = 0; i < maskData.data.length; i += 4) {
      const alpha = maskData.data[i + 3];
      if (alpha > 0) {
        // Pixel masqué -> blanc
        exportData.data[i] = 255;     // R
        exportData.data[i + 1] = 255; // G
        exportData.data[i + 2] = 255; // B
        exportData.data[i + 3] = 255; // A
      }
    }

    ctx.putImageData(exportData, 0, 0);
    return exportCanvas.toDataURL('image/png');
  }, []);

  // Créer une prévisualisation (image + masque superposé)
  const createPreview = useCallback((): string => {
    const imageCanvas = imageCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!imageCanvas || !maskCanvas) return '';

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = imageCanvas.width;
    previewCanvas.height = imageCanvas.height;
    const ctx = previewCanvas.getContext('2d')!;

    // Dessiner l'image
    ctx.drawImage(imageCanvas, 0, 0);

    // Superposer le masque avec opacité
    ctx.globalAlpha = 0.4;
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalAlpha = 1;

    return previewCanvas.toDataURL('image/jpeg', 0.9);
  }, []);

  // Valider le masque
  const handleValidate = useCallback(() => {
    if (!hasDrawn) {
      alert('Veuillez dessiner une zone pour le poêle');
      return;
    }

    const maskBase64 = exportMask();
    const previewBase64 = createPreview();
    onMaskComplete(maskBase64, previewBase64);
  }, [hasDrawn, exportMask, createPreview, onMaskComplete]);

  return (
    <div className="snapstudio-mask-canvas" ref={containerRef}>
      {/* Instructions */}
      <div className="snapstudio-mask-instructions">
        <h3>📍 Dessinez la zone où placer le poêle</h3>
        <p>
          Utilisez votre doigt ou souris pour "gommer" l'endroit où vous souhaitez voir le poêle.
          L'IA calculera automatiquement la bonne taille selon la perspective.
        </p>
      </div>

      {/* Zone de dessin */}
      <div 
        className="snapstudio-mask-canvas-container"
        style={{ 
          width: canvasSize.width, 
          height: canvasSize.height,
          position: 'relative',
          margin: '0 auto',
          cursor: 'none',
        }}
      >
        {/* Canvas de l'image (fond) */}
        <canvas
          ref={imageCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        />

        {/* Canvas du masque (dessin) */}
        <canvas
          ref={maskCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleLeave}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />

        {/* Canvas du curseur */}
        <canvas
          ref={cursorCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />

        {/* Overlay de chargement */}
        {!imageLoaded && (
          <div className="snapstudio-mask-loading">
            Chargement de l'image...
          </div>
        )}
      </div>

      {/* Contrôles */}
      <div className="snapstudio-mask-controls">
        {/* Taille du pinceau */}
        <div className="snapstudio-mask-brush-control">
          <label>
            Taille du pinceau: {brushSize}px
          </label>
          <input
            type="range"
            min="10"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="snapstudio-mask-brush-slider"
          />
        </div>

        {/* Boutons d'action */}
        <div className="snapstudio-mask-actions">
          <button
            className="snapstudio-btn-secondary"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
          >
            ↩ Annuler
          </button>
          <button
            className="snapstudio-btn-secondary"
            onClick={handleClear}
            disabled={!hasDrawn}
          >
            🗑 Effacer
          </button>
          <button
            className="snapstudio-btn-secondary"
            onClick={onCancel}
          >
            ✕ Retour
          </button>
          <button
            className="snapstudio-btn-primary"
            onClick={handleValidate}
            disabled={!hasDrawn}
          >
            ✓ Valider la zone
          </button>
        </div>
      </div>

      {/* Styles intégrés */}
      <style>{`
        .snapstudio-mask-canvas {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
        }

        .snapstudio-mask-instructions {
          text-align: center;
          padding: 12px;
          background: var(--ss-bg-secondary, #f8fafc);
          border-radius: 8px;
        }

        .snapstudio-mask-instructions h3 {
          margin: 0 0 8px 0;
          font-size: 1.1rem;
          color: var(--ss-text-color, #1e293b);
        }

        .snapstudio-mask-instructions p {
          margin: 0;
          font-size: 0.875rem;
          color: var(--ss-text-muted, #64748b);
        }

        .snapstudio-mask-canvas-container {
          border: 2px solid var(--ss-border-color, #e2e8f0);
          border-radius: 8px;
          overflow: hidden;
          background: #f0f0f0;
          touch-action: none;
        }

        .snapstudio-mask-loading {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.9);
          font-size: 1rem;
          color: var(--ss-text-muted, #64748b);
        }

        .snapstudio-mask-controls {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .snapstudio-mask-brush-control {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .snapstudio-mask-brush-control label {
          font-size: 0.875rem;
          color: var(--ss-text-color, #1e293b);
        }

        .snapstudio-mask-brush-slider {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: var(--ss-border-color, #e2e8f0);
          outline: none;
          -webkit-appearance: none;
        }

        .snapstudio-mask-brush-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--ss-primary-color, #2563eb);
          cursor: pointer;
        }

        .snapstudio-mask-brush-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--ss-primary-color, #2563eb);
          cursor: pointer;
          border: none;
        }

        .snapstudio-mask-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .snapstudio-mask-actions button {
          min-width: 120px;
        }

        .snapstudio-mask-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 600px) {
          .snapstudio-mask-actions {
            flex-direction: column;
          }

          .snapstudio-mask-actions button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default MaskCanvas;
