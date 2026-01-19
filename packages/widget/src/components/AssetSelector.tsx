// ============================================
// AssetSelector V2
// ============================================

import { useState, useMemo } from 'react';
import type { Asset } from '../types';

interface AssetSelectorProps {
  assets: Asset[];
  selectedAsset: Asset | null;
  onSelect: (asset: Asset) => void;
  compact?: boolean;
}

export function AssetSelector({
  assets,
  selectedAsset,
  onSelect,
  compact = false,
}: AssetSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterFuel, setFilterFuel] = useState<string>('all');

  // Extraire les marques uniques
  const brands = useMemo(() => {
    const uniqueBrands = [...new Set(assets.map((a) => a.brand.name))];
    return uniqueBrands.sort();
  }, [assets]);

  // Extraire les types de combustible
  const fuelTypes = useMemo(() => {
    const uniqueFuels = [...new Set(assets.map((a) => a.fuelType))];
    return uniqueFuels;
  }, [assets]);

  // Filtrer les assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        searchTerm === '' ||
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.description?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesBrand =
        filterBrand === 'all' || asset.brand.name === filterBrand;

      const matchesFuel =
        filterFuel === 'all' || asset.fuelType === filterFuel;

      return matchesSearch && matchesBrand && matchesFuel;
    });
  }, [assets, searchTerm, filterBrand, filterFuel]);

  // Mode compact : dropdown simple
  if (compact) {
    return (
      <div className="snapstudio-selector-compact">
        <label>
          Poêle sélectionné :
          <select
            value={selectedAsset?.id || ''}
            onChange={(e) => {
              const asset = assets.find((a) => a.id === e.target.value);
              if (asset) onSelect(asset);
            }}
          >
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.brand.name} {asset.name} - {asset.powerKw}kW
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <div className="snapstudio-selector">
      <h3 className="snapstudio-selector-title">
        🔥 Choisissez votre poêle
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
            className="snapstudio-selector-filter"
          >
            <option value="all">Toutes les marques</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        )}

        {fuelTypes.length > 1 && (
          <select
            value={filterFuel}
            onChange={(e) => setFilterFuel(e.target.value)}
            className="snapstudio-selector-filter"
          >
            <option value="all">Tous types</option>
            {fuelTypes.map((fuel) => (
              <option key={fuel} value={fuel}>
                {fuel === 'bois' ? '🪵 Bois' : '🔶 Granulés'}
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
                  src={asset.imageDetoureeUrl}
                  alt={asset.name}
                  loading="lazy"
                />
              </div>
              <div className="snapstudio-asset-info">
                <span className="snapstudio-asset-brand">{asset.brand.name}</span>
                <span className="snapstudio-asset-name">{asset.name}</span>
                <div className="snapstudio-asset-specs">
                  {asset.powerKw && (
                    <span className="snapstudio-asset-power">
                      {asset.powerKw} kW
                    </span>
                  )}
                  <span className="snapstudio-asset-fuel">
                    {asset.fuelType === 'bois' ? '🪵' : '🔶'}
                  </span>
                </div>
              </div>
              {selectedAsset?.id === asset.id && (
                <div className="snapstudio-asset-selected">✓</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
