# SnapStudio

Plateforme de génération d'images IA pré-promptée par vertical métier.

## Structure du projet
```
snapstudio/
├── supabase/functions/generate/    # Edge Function (proxy fal.ai)
└── packages/widget/                # Widget React intégrable
```

## Quick Start

### 1. Déployer l'Edge Function
```bash
cd supabase
supabase functions deploy generate
```

### 2. Installer le widget
```bash
cd packages/widget
npm install
npm run dev
```

### 3. Tester

Ouvrir `packages/widget/demo/index.html` dans un navigateur.

## Configuration

### Variables d'environnement Supabase

- `FAL_AI_KEY` : Clé API fal.ai

### Configuration du widget
```jsx
import { SnapStudio } from '@snapstudio/widget';

<SnapStudio 
  apiUrl="https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/generate"
  vertical="hvac"
  onGenerated={(result) => console.log(result)}
  onError={(error) => console.error(error)}
/>
```

## Vertical HVAC

Templates disponibles :
- Insertion de poêle dans une pièce

## License

Propriétaire - Confer SAS