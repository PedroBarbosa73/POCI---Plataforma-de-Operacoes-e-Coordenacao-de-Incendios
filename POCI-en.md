# POCI – Wildfire Coordination Platform

A national technological solution for command, communication and public information

---

## 1. Context

Portugal faces complex rural wildfires every year, with significant human, environmental and economic impact. In many situations, operational coordination still depends on:

- multiple non-integrated systems
- radio and telephone as the main means of transmitting information
- the absence of a single visual representation of the theatre of operations
- difficulty in ensuring that all entities share the same picture of the situation

This reality can lead to communication failures, delays in decision-making and increased risks for crews and the public.

---

## 2. Project purpose

POCI – Plataforma de Coordenação de Incêndios (Wildfire Coordination Platform) is a technology project under development that aims to:

**Centralise operational information**, providing a common picture of the situation to all entities involved in fighting rural wildfires, and **make filtered, reliable information available to the public** in parallel.

The platform is designed with two levels of use:

- **Command View** – full information, including sensitive data (e.g. unit GPS, operational status, tactical planning elements).
- **Public View** – simplified, safe information (no exact location of crews), aimed at protecting people and property.

---

## 3. Features already implemented (Proof of Concept)

### 3.1. Operational map

- Use of OpenStreetMap base layers, with Satellite and Topographic viewing options.
- Automatic marker clustering to reduce visual overlap when many units are present at incidents.
- Adaptive markers by zoom level (simple representation at distance; more detailed cards when zoomed in).
- Full-screen button to maximise map space in operational use.
- Visibility control for main layers:
  - incidents
  - operational zones
  - road closures
  - units/resources
- Legend for status and colours to quickly understand unit type and status.

### 3.2. Incidents

- List of active and recent incidents, with selection and immediate “fly-to” to the centre of the occurrence.
- Editing of:
  - fire status (active, controlled, resolved, under surveillance, etc.)
  - designation and notes
  - centre coordinates, with optional direct selection on the map.
- Structure prepared for export/import of associated data, to support future integration with official systems.

### 3.3. Operational zones

- Drawing of polygons for different zone types:
  - exclusion zones
  - safety zones
  - attack/intervention areas
- Storage, export and visibility control of these zones.
- Colour coding by type.
- Basic validation to avoid records with missing geometry or data.

### 3.4. Road closures

- Drawing of polylines for closures, restrictions or critical routes.
- Status (active, planned, reopened).
- Associated list for quick reference and coordination with law enforcement and municipal entities.

### 3.5. Units, GPS and resources

- Units shown on the map based on their GPS coordinates (when available), allowing near real-time position display.
- Visual differentiation by entity type:
  - Fire services
  - ANEPC (national civil protection)
  - GNR/UEPS (national republican guard / special unit)
  - Municipal Civil Protection
  - Air assets
  - Other relevant resources
- Filters by type and operational status (available, en route, at incident, assigned, etc.).
- Quick search by unit designation.
- Option to associate units with incidents, clarifying the distribution of resources.
- Function to centre/follow a selected unit for tracking movement in the field.
- Demo mode (“mock units”) to simulate scenarios with many units without using real data.

### 3.6. Alerts

- Create and view alerts linked to a specific incident.
- Severity level and target audience.
- Structure prepared for future connection to external channels (municipal portals, public apps, notifications, etc.).

### 3.7. Operational meteorology

- Integration with meteorological data (e.g. Open-Meteo) to view:
  - wind speed and gusts
  - wind direction
  - temperature
  - humidity
  - time of last update
- Information shown in dedicated cards, always for the incident area.

### 3.8. Interface

- Dark theme, suited to intensive use in operations rooms and low-light environments.
- Layout with collapsible side panels to maximise map space when needed.
- Organisation of elements for clear, direct use by command teams.

---

## 4. What POCI aims to solve

POCI was designed to address concrete problems:

- Lack of a single, shared situation picture accessible to all entities.
- Over-reliance on voice communication (radio/phone) to convey data that can be represented on a map.
- Difficulty reconciling information across command levels (municipal, district, national).
- Challenges in communicating with the public (information scattered across channels, often without clear geographical context).

By centralising in one system the display of incidents, GPS-tracked units, zones, road closures, meteorology and alerts, POCI aims to:

- reduce communication failures and redundancy
- improve the time to perceive and understand the situation
- support faster, better-informed decisions
- strengthen consistency between what is decided and what is communicated to the public

---

## 5. Radio and digital layer integration

One of POCI’s core aims is to bring traditional radio communication closer to a digital layer that supports decision-making, without replacing what already works but complementing it.

The vision is:

- to keep the radio network as the central tactical command channel
- to quickly record relevant operational information on the platform (orders, status, movements)
- to allow commanders and support staff to see on a single page:
  - what was communicated by radio
  - unit GPS positions
  - fire evolution, zones and closures
  - information prepared for public communication

In this way, POCI acts as a digital command post, aligned with existing procedures but with greater visibility and recording capacity.

---

## 6. International alignment

Several jurisdictions with significant exposure to wildfires have been adopting “Common Operating Picture” platforms to improve inter-agency coordination:

- Australian states with systems such as EM-COP and public applications integrated with operational information.
- Programmes such as FIRIS/Intterra in California, combining GPS data, air assets and propagation models to reduce the time between detection, understanding and decision.

These examples share:

- the sharing of a single picture of the situation
- and the integration of field data, assets and meteorology

which have a direct impact on coordination quality and the safety of all those involved.

POCI seeks to adapt these principles to the Portuguese context, respecting the organisation of Civil Protection, Fire Services and Municipalities.

---

## 7. Future vision

Future development of POCI may include, subject to the direction and interest of responsible entities:

- Integration with national statistics, occurrence recording and decision-support systems.
- Use of drones and other air assets for near real-time mapping of the fire front, showing perimeter and evolution on the map.
- Propagation prediction models based on terrain, fuel and meteorological conditions.
- Support for defining priorities, resources and evacuation routes.
- Public portal and/or application for geo-referenced alerts and official recommendations to the public.
- Post-incident analysis modules for training, response evaluation and continuous improvement.

---

## 8. Current project status

- POCI is currently an independent project in development, with a functional proof of concept already implemented.
- It is not integrated with official systems nor used in real operations.
- It is in a phase of presentation, technical feedback and assessment of institutional interest.

---

## 9. Purpose of this document

When addressed to Municipal Councils, Municipal Civil Protection Services and other competent entities, the aim of this presentation is to:

- introduce the vision and capabilities already developed
- gather technical feedback and comments from those in the field
- assess to what extent a solution of this kind could be useful in the municipal and national context
- explore, where there is interest, possible future collaboration and project development
