// ============================================
// ImageUploader V2
// ============================================

import { useState, useCallback, useRef } from 'react';

interface ImageUploaderProps {
  onImageUpload: (base64: string) => void;
  maxSizeMB?: number;
  maxDimension?: number;
  acceptedFormats?: string[];
}

export function ImageUploader({
  onImageUpload,
  maxSizeMB = 10,
  maxDimension = 2048,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);

      try {
        // Vérifier le type
        if (!acceptedFormats.includes(file.type)) {
          throw new Error('Format non supporté. Utilisez JPG, PNG ou WebP.');
        }

        // Vérifier la taille
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
          throw new Error(`Image trop volumineuse. Maximum ${maxSizeMB}MB.`);
        }

        // Charger l'image
        const base64 = await readFileAsBase64(file);
        
        // Redimensionner si nécessaire
        const resizedBase64 = await resizeImage(base64, maxDimension);
        
        onImageUpload(resizedBase64);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du traitement');
      } finally {
        setIsProcessing(false);
      }
    },
    [acceptedFormats, maxSizeMB, maxDimension, onImageUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="snapstudio-uploader">
      <div
        className={`snapstudio-dropzone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(',')}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div className="snapstudio-dropzone-content">
          {isProcessing ? (
            <>
              <div className="snapstudio-dropzone-icon">⏳</div>
              <p className="snapstudio-dropzone-title">Traitement en cours...</p>
            </>
          ) : (
            <>
              <div className="snapstudio-dropzone-icon">📷</div>
              <p className="snapstudio-dropzone-title">
                Déposez votre photo ici
              </p>
              <p className="snapstudio-dropzone-subtitle">
                ou cliquez pour sélectionner
              </p>
              <p className="snapstudio-dropzone-hint">
                JPG, PNG ou WebP • Max {maxSizeMB}MB
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="snapstudio-uploader-error">
          ⚠️ {error}
        </div>
      )}

      <div className="snapstudio-uploader-tips">
        <p>💡 <strong>Conseils pour un meilleur résultat :</strong></p>
        <ul>
          <li>Prenez une photo de face, bien éclairée</li>
          <li>Assurez-vous qu'il y a un espace libre pour le poêle</li>
          <li>Évitez les photos floues ou trop sombres</li>
          <li>L'idéal : un coin de mur visible près d'une cheminée existante</li>
        </ul>
      </div>
    </div>
  );
}

// Utilitaires

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsDataURL(file);
  });
}

function resizeImage(base64: string, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      
      // Pas besoin de redimensionner si déjà dans les limites
      if (width <= maxDimension && height <= maxDimension) {
        resolve(base64);
        return;
      }

      // Calculer les nouvelles dimensions
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      // Créer un canvas pour redimensionner
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible de créer le contexte canvas'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Exporter en JPEG pour réduire la taille
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = () => reject(new Error('Erreur de chargement de l\'image'));
    img.src = base64;
  });
}
