import { useState, useCallback, useRef } from 'react';

interface ImageUploaderProps {
  onImageUpload: (base64: string, preview: string) => void;
  maxSizeMB?: number;
  acceptedFormats?: string[];
}

export function ImageUploader({
  onImageUpload,
  maxSizeMB = 10,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      // Vérifier le type
      if (!acceptedFormats.includes(file.type)) {
        setError('Format non supporté. Utilisez JPG, PNG ou WebP.');
        return;
      }

      // Vérifier la taille
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        setError(`Image trop volumineuse. Maximum ${maxSizeMB}MB.`);
        return;
      }

      // Créer le preview et le base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        onImageUpload(base64, base64);
      };
      reader.onerror = () => {
        setError('Erreur lors de la lecture du fichier.');
      };
      reader.readAsDataURL(file);
    },
    [acceptedFormats, maxSizeMB, onImageUpload]
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
        className={`snapstudio-dropzone ${isDragging ? 'dragging' : ''}`}
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
        </div>
      </div>

      {error && (
        <div className="snapstudio-uploader-error">
          ⚠️ {error}
        </div>
      )}

      <div className="snapstudio-uploader-tips">
        <p>💡 <strong>Conseils pour une meilleure génération :</strong></p>
        <ul>
          <li>Prenez une photo de face, bien éclairée</li>
          <li>Assurez-vous qu'il y a de l'espace libre pour le poêle</li>
          <li>Évitez les photos floues ou sombres</li>
        </ul>
      </div>
    </div>
  );
}
