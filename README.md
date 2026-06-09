# Neural Network Portfolio

An interactive 3D portfolio that visualizes skills, experiences, and projects as a neural network. Built with Three.js, this mobile-first web experience maps a career path from physician to AI engineer, focusing on building trustworthy AI for healthcare.

[![Live Demo](https://img.shields.io/badge/Live-Demo-7c3aed?style=for-the-badge&logo=vercel)](https://pyaesonep.github.io/neural-network-portfolio)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Mobile First](https://img.shields.io/badge/Mobile-First-00f0ff?style=for-the-badge&logo=android)](/)
[![Security](https://img.shields.io/badge/Security-CSP%20%7C%20SRI-success?style=for-the-badge&logo=mozilla)](/)

## Preview

![General Features Demo](assets/nn-portfolio.gif)

![Pathfinder Demo](assets/nn-portfolio_pathfinder.gif)

## Features

### Core Experience
- **Interactive 3D Neural Network:** 25 nodes across 5 layers with 68 connections.
- **Real-time Data Flow:** "Forward Pass" animation pulses through skill connections.
- **Deep Linking:** Share direct links to specific nodes (`?node=id`).
- **Dark/Light Mode:** OS preference detection with manual toggle and no theme flash.

### Discovery Tools
- **Skill Path Tracer:** BFS shortest-path between any two nodes with 7 preset journeys; minimize to see the path on the 3D network.
- **Smart Search:** Filter nodes by name, tags, or description in real-time.
- **Timeline View:** Chronological layout (2015–2026) with year markers.
- **Activation Visualization:** Proficiency levels with animated gauges.

### Premium UI
- **Glassmorphism panels:** with animated gradient borders.
- **Custom cursor:** with magnetic button effects (desktop).
- **Atmospheric texture:** noise overlay, scanlines, floating CSS particles.
- **Staggered content reveal:** animations in the info panel.
- **Reduced-motion support:** respects `prefers-reduced-motion: reduce`.

### Mobile-First Design
- **Bottom Sheet Navigation:** native app-like expandable panel.
- **Touch Optimized:** drag to rotate, pinch to zoom, tap to select.
- **Performance Optimized:** reduced particles and geometry on mobile.
- **Safe Area Support:** uses `env(safe-area-inset-*)` for notched phones.
- **44px touch targets:** WCAG compliant minimum size.

### Onboarding
- **5-step interactive tour:** for first-time visitors.
- **Element highlighting:** focuses attention during onboarding.
- **Persistent memory:** via localStorage.

### Accessibility
- **Keyboard navigation:** with visible `:focus-visible` outlines.
- **ARIA labels:** on all interactive elements.
- **`prefers-reduced-motion`:** honored globally.
- **`prefers-color-scheme`:** CSS fallback prevents theme flash.

## Tech Stack

- **Three.js 0.160** — 3D rendering and WebGL via jsDelivr CDN (with SRI integrity hash)
- **Vanilla JavaScript** — No framework, no build step
- **CSS3** — Custom properties, glassmorphism, animations, mobile-first responsive
- **Font Awesome 6.4** — Icons via cdnjs (with SRI integrity hash)
- **Google Fonts** — Syne (headings) + JetBrains Mono (monospace)
- **JSON data layer** — Portfolio content in `data/network.json`, loaded via `fetch()`

## Quick Start

```bash
# Clone the repository
git clone https://github.com/pyaesonep/neural-network-portfolio.git
cd neural-network-portfolio

# Serve locally (required: fetch() needs HTTP)
python -m http.server 8000

# Open http://localhost:8000

```

### Deploy

Upload to any static hosting provider: Vercel, Netlify, GitHub Pages, or Cloudflare Pages.

## Project Structure

```
neural-network-portfolio/
├── index.html              # Shell — HTML markup (274 lines)
├── css/
│   └── style.css           # All styles (2,100+ lines)
├── js/
│   └── main.js             # Three.js engine + UI logic (1,950+ lines)
├── data/
│   └── network.json        # Portfolio data — nodes, connections (editable)
├── assets/
│   ├── nn-portfolio.gif          # General features demo
│   └── nn-portfolio_pathfinder.gif # Pathfinder demo
├── scripts/
│   └── resume_to_network.py # Resume → JSON generator (Python)
├── DATA.md                 # Human-readable data reference
├── README.md
├── LICENSE
└── resume.pdf              # Downloadable resume
```

## Data-Driven Architecture

All portfolio content lives in `data/network.json`. Edit this file to update skills, projects, and connections without touching the JavaScript.

```json
{
  "layers": [
    {
      "id": "input",
      "label": "Education & Background",
      "nodes": [
        {
          "id": "medical",
          "name": "Medical Background",
          "icon": "fa-user-md",
          "description": "MBBS from University of Medicine 1...",
          "tags": ["MBBS", "Clinical", "Healthcare"],
          "activation": 0.95,
          "year": 2015
        }
      ]
    }
  ],
  "connections": [
    { "from": "medical", "to": "python", "strength": 0.75 }
  ]
}

```

### Field Reference

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique snake_case identifier |
| `name` | string | Display name |
| `icon` | string | Font Awesome 6 class (e.g., `fa-brain`) |
| `description` | string | 1–2 sentence description |
| `tags` | string[] | 3–4 short keywords |
| `activation` | float | 0–1 proficiency/impact score |
| `year` | int | Timeline year |

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `F` | Trigger Forward Pass |
| `A` | Show Activation levels |
| `R` | Reset camera |
| `P` | Toggle Path Tracer (restores if minimized) |
| `T` | Toggle Timeline / Network view |
| `D` | Toggle Dark / Light mode |
| `L` | Toggle node labels (desktop) |
| `/` | Open search |
| `Esc` | Close panels / overlays (clears path if minimized) |

## Network Structure

The portfolio is organized into 5 layers:

1. **Education & Background:** Medical (MBBS), SUTD CSD, SP Diploma, Resilience
2. **Foundation Layer:** Python, Math & Stats, Software Eng, Cloud & DevOps, Cybersecurity
3. **Core AI/ML Skills:** ML, Deep Learning, NLP & LLMs, Computer Vision, MLOps
4. **Specialized Expertise:** Healthcare AI, LLM Security, RAG & Agents, DevSecOps, Cloud Architecture
5. **Projects & Impact:** Aegis-MD, CNN from Scratch, CVD Modeling, ASL Classification, DevSecOps @ LTA, AI CTF

## Resume → JSON Generator

Automatically generate `network.json` from a resume:

```bash
# LLM-powered (best results)
python scripts/resume_to_network.py resume.pdf --llm openai

# Local LLM
python scripts/resume_to_network.py resume.pdf --llm ollama

# Regex-based (no API needed)
python scripts/resume_to_network.py resume.txt --llm none -o data/custom.json

```

Supports PDF, DOCX, and TXT input. Outputs valid JSON matching the schema above.

## Configuration

```javascript
const config = {
    layerGap: 10,           // Horizontal spacing between layers
    nodeSpacing: 3.2,       // Vertical spacing between nodes
    nodeSize: 0.55,         // Base node radius
    particleCount: 1200,    // Background particles (600 on mobile)
    dataPacketSpeed: 0.018  // Data flow animation speed
};

```

## Responsive Breakpoints

| Breakpoint | Layout |
| --- | --- |
| < 768px | Mobile: Bottom sheet, FABs, full-screen overlays |
| 768px – 1023px | Tablet: Side panels, tooltips, expanded controls |
| ≥ 1024px | Desktop: Sidebar, legend, timeline bar, centered nav |

## Security

* **CSP meta tag:** restricts scripts/styles to trusted CDNs
* **SRI integrity hashes:** CDN scripts verified on load
* **`rel="noopener noreferrer"`:** on all external links
* **`textContent` over `innerHTML`:** data rendered safely
* **No secrets:** all credentials via environment variables
* **No backend:** zero server-side attack surface

## Browser Support

*  Chrome 90+
*  Firefox 88+
*  Safari 14+
*  Edge 90+
*  Mobile Safari (iOS 14+)
*  Chrome Mobile (Android 10+)

## Performance

| Device | FPS | Optimizations |
| --- | --- | --- |
| Desktop | 60 | Full geometry, orbital rings, node labels, custom cursor |
| Tablet | 55–60 | Reduced particles, simplified rings |
| Mobile | 45–60 | Half particles, no antialiasing, minimal geometry |

## License

MIT — see [LICENSE](LICENSE).

## Author

**Pyae Sone**
- BEng CSD @ SUTD (Trailblazers Scholar)
- Physician-turned-AI-Engineer
- [pyaesone.perfect2014@gmail.com](mailto:pyaesone.perfect2014@gmail.com)
- [LinkedIn](https://linkedin.com/in/pyaesonep) · [GitHub](https://github.com/pyaesonep) · [Blog](https://dev.to/pyaesonep)