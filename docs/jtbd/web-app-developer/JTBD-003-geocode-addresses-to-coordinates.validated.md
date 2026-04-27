---
status: validated
job-id: geocode-addresses-to-coordinates
persona: web-app-developer
date-created: 2026-04-15
secondary-personas:
  - data-quality-analyst
screens:
  - /addresses/{id} (geocodes block)
---

# JTBD-003: Geocode addresses to coordinates

## Job Statement

When I have a validated address, I want its coordinates, so I can display it on a map in my application.

## Desired Outcomes

- Geocoding data includes reliability indicator
- Coordinates are accurate to property level where available

## Persona Constraints

- **Web/App Developer** (primary): plotting on maps, distance calculations.
- **Data Quality Analyst** (secondary): enriching datasets with lat/lon for spatial analysis.

## Current Solutions

- Google Maps / Mapbox geocoding — costs scale with volume, may diverge from G-NAF.
- Self-managed PostGIS + G-NAF imports — operational burden.
