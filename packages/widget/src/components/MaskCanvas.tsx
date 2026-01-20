import { useRef, useState, useEffect, useCallback } from 'react';
import '../styles/maskcanvas.css';

interface MaskCanvasProps {
  /** Image uploadée (base64 ou URL) */
  image: string;
  /** Callback avec l'image marquée (base64 JPEG) */
  onValidate: (markedImage: string) => void;
  /** Retour à l'étape précédente */
  onBack: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  brushSize: number;
}

export function MaskCanvas({ image, onValidate, onBack }: MaskCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(50);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Couleur du marqueur vert semi-transparent
  const MARKER_COLOR = 'rgba(0, 255, 0, 0.5)';

  // Charger l'image et calculer les dimensions du canvas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;

      // Calculer la taille du canvas en fonction du container
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const maxHeight = window.innerHeight * 0.6;

        // Calculer le ratio pour que l'image rentre dans le container
        const imgRatio = img.width / img.height;
        let displayWidth = containerWidth;
        let displayHeight = containerWidth / imgRatio;

        if (displayHeight > maxHeight) {
          displayHeight = maxHeight;
          displayWidth = maxHeight * imgRatio;
        }

        setCanvasSize({
          width: displayWidth,
          height: displayHeight,
        });
        setImageLoaded(true);
      }
    };
    img.onerror = () => {
      console.error('Erreur lors du chargement de l\'image');
    };
    img.src = image;
  }, [image]);

  // Redessiner le canvas quand les strokes changent
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img) return;

    // Effacer le canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dessiner l'image de fond
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Dessiner tous les strokes
    const allStrokes = [...strokes];
    if (currentStroke.length > 0) {
      allStrokes.push({ points: currentStroke, brushSize });
    }

    allStrokes.forEach((stroke) => {
      if (stroke.points.length === 0) return;

      ctx.strokeStyle = MARKER_COLOR;
      ctx.fillStyle = MARKER_COLOR;
      ctx.lineWidth = stroke.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Dessiner le trait
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();

      // Dessiner des cercles aux points pour un trait plus épais
      stroke.points.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, stroke.brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }, [strokes, currentStroke, brushSize]);

  // Redessiner quand nécessaire
  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [imageLoaded, redrawCanvas, canvasSize]);

  // Obtenir les coordonnées du pointeur relative au canvas
  const getCanvasCoordinates = useCallback(
    (e: React.MouseEvent | React.TouchEvent): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ('touches' in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Calculer les coordonnées en tenant compte du scale
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  // Début du dessin
  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const point = getCanvasCoordinates(e);
      if (point) {
        setIsDrawing(true);
        setCurrentStroke([point]);
      }
    },
    [getCanvasCoordinates]
  );

  // Pendant le dessin
  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;

      const point = getCanvasCoordinates(e);
      if (point) {
        setCurrentStroke((prev) => [...prev, point]);
      }
    },
    [isDrawing, getCanvasCoordinates]
  );

  // Fin du dessin
  const stopDrawing = useCallback(() => {
    if (isDrawing && currentStroke.length > 0) {
      setStrokes((prev) => [...prev, { points: currentStroke, brushSize }]);
      setCurrentStroke([]);
    }
    setIsDrawing(false);
  }, [isDrawing, currentStroke, brushSize]);

  // Annuler le dernier trait
  const handleUndo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  // Effacer tout
  const handleClear = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
  }, []);

  // Valider et exporter l'image avec le marqueur
  const handleValidate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Exporter en JPEG base64
    const markedImage = canvas.toDataURL('image/jpeg', 0.9);
    onValidate(markedImage);
  }, [onValidate]);

  // Vérifier si on peut valider (au moins un trait dessiné)
  const canValidate = strokes.length > 0;

  return (
    <div className="maskcanvas-container" ref={containerRef}>
      <div className="maskcanvas-instructions">
        <h3>📍 Indiquez l'emplacement du poêle</h3>
        <p>Dessinez une zone verte à l'endroit où vous souhaitez voir le poêle</p>
      </div>

      <div className="maskcanvas-canvas-wrapper">
        {!imageLoaded ? (
          <div className="maskcanvas-loading">Chargement de l'image...</div>
        ) : (
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="maskcanvas-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            onTouchCancel={stopDrawing}
          />
        )}
      </div>

      <div className="maskcanvas-controls">
        <div className="maskcanvas-brush-control">
          <label htmlFor="brush-size">
            🖌️ Taille du pinceau : {brushSize}px
          </label>
          <input
            id="brush-size"
            type="range"
            min="20"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="maskcanvas-slider"
          />
        </div>

        <div className="maskcanvas-actions">
          <button
            className="maskcanvas-btn maskcanvas-btn-secondary"
            onClick={onBack}
            type="button"
          >
            ← Retour
          </button>
          <button
            className="maskcanvas-btn maskcanvas-btn-secondary"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            type="button"
          >
            ↩ Annuler
          </button>
          <button
            className="maskcanvas-btn maskcanvas-btn-secondary"
            onClick={handleClear}
            disabled={strokes.length === 0}
            type="button"
          >
            🗑️ Effacer
          </button>
          <button
            className="maskcanvas-btn maskcanvas-btn-primary"
            onClick={handleValidate}
            disabled={!canValidate}
            type="button"
          >
            ✓ Valider
          </button>
        </div>
      </div>

      {!canValidate && imageLoaded && (
        <div className="maskcanvas-hint">
          💡 Dessinez une zone sur l'image pour indiquer où placer le poêle
        </div>
      )}
    </div>
  );
}
