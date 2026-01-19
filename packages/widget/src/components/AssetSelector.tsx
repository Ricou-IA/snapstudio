import { useState, useMemo } from 'react';
import type { Asset } from '../types';

interface AssetSelectorProps {
  assets: Asset[];
  selectedAsset: Asset | null;
  onSelect: (asset: Asset) => void;
}

export function AssetSelector({
  assets,
  selectedAsset,
  onSelect,
}: AssetSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');

  // Extraire les marques uniques
  const brands = useMemo(() => {
    const uniqueBrands = [...new Set(assets.map((a) => a.brand))];
    return uniqueBrands.sort();
  }, [assets]);

  // Filtrer les assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        searchTerm === '' ||
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesBrand =
        filterBrand === 'all' || asset.brand === filterBrand;

      return matchesSearch && matchesBrand;
    });
  }, [assets, searchTerm, filterBrand]);

  return (
    <div className="snapstudio-selector">
      <h3 className="snapstudio-selector-title">
        Choisissez votre poêle
      </h3>

      {/* Filtres */}
      <div className="snapstudio-selector-filters">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="snapstudio-selector-search"
        />

        {brands.length > 1 && (
          <select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            className="snapstudio-selector-brand"
          >
            <option value="all">Toutes les marques</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Grille d'assets */}
      <div className="snapstudio-selector-grid">
        {filteredAssets.length === 0 ? (
          <div className="snapstudio-selector-empty">
            Aucun poêle trouvé
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className={`snapstudio-asset-card ${
                selectedAsset?.id === asset.id ? 'selected' : ''
              }`}
              onClick={() => onSelect(asset)}
            >
              <div className="snapstudio-asset-image">
                <img
                  src={asset.imageThumbnail || asset.imageUrl}
                  alt={asset.name}
                  loading="lazy"
                />
              </div>
              <div className="snapstudio-asset-info">
                <span className="snapstudio-asset-brand">{asset.brand}</span>
                <span className="snapstudio-asset-name">{asset.name}</span>
                {asset.metadata?.puissance_kw && (
                  <span className="snapstudio-asset-power">
                    {asset.metadata.puissance_kw} kW
                  </span>
                )}
              </div>
              {selectedAsset?.id === asset.id && (
                <div className="snapstudio-asset-selected">
                  ✓
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Info sélection */}
      {selectedAsset && (
        <div className="snapstudio-selector-selected">
          <p>
            <strong>Sélectionné :</strong> {selectedAsset.brand} {selectedAsset.name}
          </p>
          <button
            className="snapstudio-btn-primary"
            onClick={() => {}}
          >
            Continuer →
          </button>
        </div>
      )}
    </div>
  );
}
