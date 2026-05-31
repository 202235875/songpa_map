# Songpa GIS Viewer

Songpa-gu GIS viewer built with React, Vite, and MapLibre GL.

## Live Demo

https://202235875.github.io/songpa_map/

## Setup

```bash
npm install
cp .env.example .env
```

Set your VWorld API key in `.env`:

```bash
VITE_VWORLD_API_KEY=YOUR_VWORLD_API_KEY
```

The `.env` file is ignored by Git and should not be committed.

For GitHub Pages deployment, add `VITE_VWORLD_API_KEY` as a repository secret if you want to use the VWorld base map in production.

## Run

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173`.

## Build

```bash
npm run build
```

## Data

The app reads web-ready GeoJSON and stats files from `public/data/`.
