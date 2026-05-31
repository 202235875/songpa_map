# Songpa GIS Data Structure

## Overview

This project stores the Songpa GIS inputs in four groups:

- `raw/`: original source files
- `processed/`: cleaned or Songpa-filtered working files
- `reference/`: supporting boundary/reference datasets
- `exports/`: web-ready export files

## Folder Layout

- `raw/cadastral/`
  - Original cadastral shapefile (`AL_D002`)
- `raw/buildings/`
  - Original building integrated information shapefile (`AL_D010`)
- `raw/building-register/`
  - Original building register CSV

- `processed/cadastral/songpa/`
  - Songpa-only cadastral shapefile
- `processed/buildings/songpa/`
  - Songpa-only building integrated information shapefile
- `processed/building-register/`
  - Cleaned Songpa building register CSV

- `reference/admin-boundaries/songpa/`
  - Songpa administrative-dong boundary GeoJSON

- `exports/geojson/`
  - Web-ready GeoJSON exports

## Recommended App Inputs

For the web app, use these files first:

- Buildings: `exports/geojson/songpa_buildings.geojson`
- Cadastral parcels: `exports/geojson/songpa_cadastral.geojson`
- Administrative dongs: `reference/admin-boundaries/songpa/hangjeongdong_songpa.geojson`
- Building register: `processed/building-register/songpa_building_register_pyojebu.csv`
