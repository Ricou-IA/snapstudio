import React from 'react';
import ReactDOM from 'react-dom/client';
import { SnapStudio } from './components/SnapStudio';

console.log('🚀 Main.tsx chargé');

function App() {
  console.log('🔄 App rendu');
  
  return (
    <SnapStudio
      apiUrl="https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/generate"
      vertical="hvac"
      branding={{
        primaryColor: '#2563eb',
        ctaText: 'Demander un devis',
        ctaUrl: 'https://example.com/contact',
        hidePoweredBy: false,
      }}
      onGenerated={(result) => {
        console.log('✅ Génération réussie:', result);
      }}
      onError={(error) => {
        console.error('❌ Erreur:', error);
      }}
      onCtaClick={(asset, _resultImage) => {
        console.log('🔗 CTA cliqué:', asset.name);
      }}
    />
  );
}

const container = document.getElementById('widget-container');
console.log('📦 Container:', container);

if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('❌ Container #widget-container non trouvé');
}
